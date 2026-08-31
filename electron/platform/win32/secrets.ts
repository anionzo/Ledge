/**
 * Windows Credential Manager reads.
 *
 * Ported from agent-notch's `readWindowsGenericCredential` + `wincred.ps1`,
 * with the hardening from Edge-Drop's `powershell.ts` applied.
 *
 * There is no Node binding for `CredReadW` in this app's dependency set, and
 * Electron's `safeStorage` reads only secrets Ledge itself wrote — it cannot
 * open a credential another program (a CLI's login flow) stored. So the read
 * goes through PowerShell and a small P/Invoke.
 *
 * Three things make that safe rather than the usual PowerShell footgun:
 *
 *  1. **The target name is never interpolated into the script.** It is passed
 *     in the child's environment and read back as `$env:LEDGE_CRED_TARGET`.
 *     Even a target containing quotes, `$(...)`, or a newline is inert,
 *     because it is data the script reads at runtime, not text the parser
 *     ever sees. This is the single most important difference from the
 *     reference implementation, which passed `-Target $target` as an argument.
 *
 *  2. **`-EncodedCommand`.** The script is sent as base64 UTF-16LE, so
 *     Windows' argv quoting rules — which differ between `cmd.exe`, Node's
 *     spawn, and PowerShell's own parser — cannot corrupt a multi-line script.
 *
 *  3. **An absolute path to in-box PowerShell 5.1**, spawned with no shell,
 *     `-NoProfile` (so a user profile script cannot run), `-NonInteractive`
 *     (so nothing can block waiting for input), `windowsHide`, a writable cwd,
 *     and a timeout. See `./system.ts`.
 */
import type { SecretLookup, SecretResult } from '../types'
import { execFileCapture } from '../shared/exec'
import { powerShellPath, writableCwd } from './system'

/** How long a credential read may take before it is abandoned. */
const TIMEOUT_MS = 8_000

/**
 * Exit codes the script uses. Chosen so the outcome is unambiguous without
 * parsing English error text, which is localised.
 */
const EXIT_NOT_FOUND = 2
const EXIT_ACCESS_DENIED = 3
const EXIT_BAD_INPUT = 4

const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class LedgeCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr cred);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr cred);
}
"@

$target = $env:LEDGE_CRED_TARGET
if ([string]::IsNullOrWhiteSpace($target)) { exit ${EXIT_BAD_INPUT} }

[IntPtr]$ptr = [IntPtr]::Zero
# CRED_TYPE_GENERIC = 1. Every agent CLI that uses the credential store
# writes a generic credential; domain credentials are not readable this way.
if (-not [LedgeCred]::CredRead($target, 1, 0, [ref]$ptr)) {
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($err -eq 1168) { exit ${EXIT_NOT_FOUND} }      # ERROR_NOT_FOUND
  if ($err -eq 5)    { exit ${EXIT_ACCESS_DENIED} }  # ERROR_ACCESS_DENIED
  exit 5
}
try {
  $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][LedgeCred+CREDENTIAL])

  # An account filter is advisory: Credential Manager keys on target name
  # alone, so the caller's account is checked against the stored UserName only
  # when both are present. A stored credential with no UserName matches
  # anything, which is how most CLIs write theirs.
  $want = $env:LEDGE_CRED_ACCOUNT
  if (-not [string]::IsNullOrWhiteSpace($want) -and $cred.UserName -ne [IntPtr]::Zero) {
    $have = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($cred.UserName)
    if (-not [string]::IsNullOrWhiteSpace($have) -and $have -ne $want) { exit ${EXIT_NOT_FOUND} }
  }

  if ($cred.CredentialBlobSize -eq 0) { exit ${EXIT_NOT_FOUND} }
  $bytes = New-Object byte[] $cred.CredentialBlobSize
  [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
  [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($bytes).Trim([char]0))
} finally {
  [LedgeCred]::CredFree($ptr)
}
`

/** PowerShell's `-EncodedCommand` wants base64 of UTF-16LE. */
function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/**
 * A credential target is opaque to us, but it still has to be a sane string.
 * Rejecting control characters here is belt-and-braces — the value travels in
 * an environment variable, which cannot carry a NUL anyway.
 */
function isValidTarget(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 32767) return false
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001F\u007F]/.test(trimmed)
}

/**
 * Read a generic credential from Windows Credential Manager.
 *
 * Never throws. `permission-denied` is reachable (an ACL'd credential, or a
 * process running as a different user) but is rare on Windows: unlike the
 * macOS Keychain, Credential Manager does not prompt, so there is no
 * "dismissed the dialog" case here.
 */
export async function readSecret(lookup: SecretLookup): Promise<SecretResult> {
  const service = lookup?.service
  if (!isValidTarget(service)) {
    return { ok: false, reason: 'error', message: 'invalid credential target' }
  }

  const account = typeof lookup?.account === 'string' ? lookup.account.trim() : ''
  if (account && !isValidTarget(account)) {
    return { ok: false, reason: 'error', message: 'invalid credential account' }
  }

  const result = await execFileCapture(
    powerShellPath(),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(SCRIPT)],
    {
      timeoutMs: TIMEOUT_MS,
      cwd: writableCwd(),
      env: {
        LEDGE_CRED_TARGET: service.trim(),
        LEDGE_CRED_ACCOUNT: account
      }
    }
  )

  if (result.code === EXIT_NOT_FOUND) return { ok: false, reason: 'not-found' }
  if (result.code === EXIT_ACCESS_DENIED) {
    return { ok: false, reason: 'permission-denied', message: 'Windows denied access to this credential' }
  }
  if (result.code === EXIT_BAD_INPUT) {
    return { ok: false, reason: 'error', message: 'credential target was not passed through' }
  }
  if (!result.ok) {
    // `code: null` means spawn failed or the timeout fired — on a machine with
    // no in-box PowerShell, that is genuinely "unsupported" rather than an
    // error the user can act on.
    if (result.code === null) {
      return { ok: false, reason: 'unsupported', message: result.stderr || 'PowerShell unavailable' }
    }
    return { ok: false, reason: 'error', message: result.stderr.trim() || `powershell exited ${result.code}` }
  }

  // Strip a UTF-8 BOM: PowerShell can emit one ahead of the first write.
  const value = result.stdout.replace(/^\ufeff/, '').trim()
  if (!value) return { ok: false, reason: 'not-found' }
  return { ok: true, value }
}

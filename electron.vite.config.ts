/**
 * Three builds from one repo: main, preload, renderer.
 *
 * The renderer is the unusual one — Ledge is not a single-window app, so it has
 * three HTML entries that share `src/ui`, `src/lib` and the design tokens.
 * Rollup deduplicates the shared chunks between them, which is why the Shelf
 * and the Gauge can be separate windows without shipping React twice.
 */
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Kept identical to the `paths` in tsconfig.node.json / tsconfig.web.json.
 * When these two drift, the editor stays happy while the build breaks — so
 * treat them as one setting in two files.
 */
const alias = {
  '@shared': resolve('shared'),
  '@renderer': resolve('src')
}

export default defineConfig({
  main: {
    // Node builtins and real dependencies stay external: bundling `electron`
    // or a native module into the main chunk is how you get a runtime that
    // cannot find its own .node files.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve('electron/main/index.ts') },
        // The quota engine imports `../platform` dynamically on purpose — a
        // static import would pull `electron` at module load and make the quota
        // unit tests require the Electron binary. Main imports it statically.
        // For a single-startup main bundle, not code-splitting that module is
        // irrelevant, so silence Rollup's advisory about the mixed import.
        onwarn(warning, defaultHandler) {
          if (
            warning.message.includes('platform/index') &&
            warning.message.includes('dynamically imported')
          ) {
            return
          }
          defaultHandler(warning)
        }
      }
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve('electron/preload/index.ts') },
        output: {
          // The one place in this repo that is not ESM. A preload script for a
          // window with `sandbox: true` is loaded by Electron's own CommonJS
          // loader and cannot be an ES module; because package.json declares
          // `"type": "module"`, the file must also carry the `.cjs` extension
          // for Node to agree. PanelHost points `webPreferences.preload` at
          // `out/preload/index.cjs`.
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },

  renderer: {
    root: resolve('src'),
    plugins: [react()],
    resolve: { alias },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        // Entry names double as output directory names, so these become
        // out/renderer/{hub,settings}/index.html — the paths
        // electron/main/index.ts builds its `htmlEntry` from.
        //
        // One edge panel now, not two: `hub` is the single right-docked frame
        // that carries the quota strip and the clipboard shelf together. The
        // old per-feature `shelf` and `gauge` entries are gone — their
        // components live on and are composed inside `src/hub`.
        input: {
          hub: resolve('src/hub/index.html'),
          settings: resolve('src/settings/index.html')
        }
      }
    }
  }
})

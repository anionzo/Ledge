/**
 * Hub renderer entry.
 *
 * Ledge is one right-docked frame now, not two mirrored panels: this window
 * carries the clipboard shelf with a collapsible quota strip pinned above it.
 * The `index.html` mounts this module and provides `#root`.
 *
 * Tokens are imported here so the custom properties exist before any component
 * stylesheet reads them, and so there is one place per window that pulls in the
 * design system.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design/tokens.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Hub window has no #root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

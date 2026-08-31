/**
 * Shelf renderer entry.
 *
 * The `index.html` for this window is owned elsewhere; it mounts this module
 * and provides `#root`.
 *
 * Tokens are imported here rather than from a component so the custom
 * properties are defined before any component stylesheet that reads them, and
 * so there is exactly one place per window that pulls in the design system.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design/tokens.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Shelf window has no #root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

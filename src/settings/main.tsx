/**
 * Settings renderer entry.
 *
 * Same bootstrap as the two panels; the difference is entirely in what App
 * renders. The window's `index.html` is owned elsewhere and provides `#root`.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design/tokens.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Settings window has no #root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

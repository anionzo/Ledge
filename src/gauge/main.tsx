/**
 * Gauge renderer entry.
 *
 * Mirror of the Shelf's entry, deliberately identical in shape: the two panels
 * are one product, and that starts at the bootstrap.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design/tokens.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Gauge window has no #root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

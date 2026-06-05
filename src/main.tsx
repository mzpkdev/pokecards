import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter (not BrowserRouter): this deploys to GitHub Pages under
// '/pokecards/'. Hash routing survives a hard refresh / deep link without any
// server-side rewrite, and sidesteps the base path entirely.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Switcher } from './Switcher'
import './styles.css'

// The same bundle serves the panel and the quick switcher window.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.hash === '#switcher' ? <Switcher /> : <App />}
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SettingsApp } from './settings/SettingsApp'
import { Switcher } from './Switcher'
import './styles.css'

// The same bundle serves the panel, the quick switcher and the settings window.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.hash === '#switcher' ? <Switcher /> : window.location.hash === '#settings' ? <SettingsApp /> : <App />}
  </StrictMode>,
)

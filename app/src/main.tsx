import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyAppearance, loadAppearance } from './lib/appearance'
import { applySettings } from './lib/settings'

applyAppearance(loadAppearance())
applySettings()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

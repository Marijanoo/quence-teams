import { Palette } from 'lucide-react'
import { useStore } from '../lib/store'

// Same strip as the other Quence apps: one button on the left and the version next to it.
export function BottomBar() {
  const open = useStore(s => s.appearanceOpen)
  return (
    <footer className="bottombar">
      <button className={`bb-btn${open ? ' active' : ''}`} onClick={() => useStore.setState(s => ({ appearanceOpen: !s.appearanceOpen }))} title="Appearance" aria-expanded={open}>
        <Palette size={14} /><span>Appearance</span>
      </button>
      <span className="bb-version">v{__APP_VERSION__}</span>
    </footer>
  )
}

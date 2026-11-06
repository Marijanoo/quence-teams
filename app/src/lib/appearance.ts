// Appearance settings (accent, background, text), stored per device and applied as CSS variables.
export interface Oklch { l: number; c: number; h: number }
export interface Appearance { accent: Oklch; bgL: number; bgC: number; bgH: number; fgL: number; season: boolean }

export const DEFAULTS: Appearance = { accent: { l: 0.72, c: 0.19, h: 350 }, bgL: 0.28, bgC: 0.01, bgH: 282, fgL: 0.97, season: false }

export const ACCENT_PRESETS: (Oklch & { name: string })[] = [
  { name: 'Pink', l: 0.72, c: 0.19, h: 350 },
  { name: 'Rose', l: 0.7, c: 0.2, h: 15 },
  { name: 'Orange', l: 0.75, c: 0.18, h: 55 },
  { name: 'Lime', l: 0.78, c: 0.2, h: 130 },
  { name: 'Teal', l: 0.72, c: 0.15, h: 185 },
  { name: 'Blue', l: 0.68, c: 0.18, h: 245 },
  { name: 'Violet', l: 0.68, c: 0.2, h: 295 },
  { name: 'Fuchsia', l: 0.7, c: 0.25, h: 325 },
]

// Northern hemisphere seasons; "follow the season" swaps the accent as the months change.
export const SEASON_PRESETS: (Oklch & { name: string })[] = [
  { name: 'Winter', l: 0.76, c: 0.1, h: 225 },
  { name: 'Spring', l: 0.78, c: 0.17, h: 145 },
  { name: 'Summer', l: 0.82, c: 0.17, h: 85 },
  { name: 'Autumn', l: 0.7, c: 0.17, h: 45 }
]
export function currentSeason(date = new Date()) {
  const m = date.getMonth() // 0 = January
  return SEASON_PRESETS[m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3]
}

const KEY = 'quence-teams-appearance'
const fmt = (c: Oklch) => `oklch(${c.l.toFixed(3)} ${c.c.toFixed(3)} ${Math.round(c.h)})`
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Keeps text readable whatever the background is set to.
export function sanitize(a: Appearance): Appearance {
  const bgL = clamp(a.bgL, 0.05, 0.95)
  const dark = bgL <= 0.5
  const fgL = dark ? clamp(a.fgL, Math.min(1, bgL + 0.4), 1) : clamp(a.fgL, 0, Math.max(0, bgL - 0.4))
  return { ...a, bgL, bgC: clamp(a.bgC, 0, 0.08), bgH: clamp(a.bgH, 0, 359), fgL, accent: { l: clamp(a.accent.l, 0.35, 0.9), c: clamp(a.accent.c, 0, 0.3), h: clamp(a.accent.h, 0, 359) } }
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return sanitize({ ...DEFAULTS, ...JSON.parse(raw) })
  } catch { /* use the defaults */ }
  return DEFAULTS
}

export function saveAppearance(a: Appearance) {
  try { localStorage.setItem(KEY, JSON.stringify(a)) } catch { /* not critical */ }
}

export function applyAppearance(input: Appearance) {
  const base = sanitize(input)
  const a = base.season ? sanitize({ ...base, accent: currentSeason() }) : base
  const root = document.documentElement.style
  const bg = (dl: number): string => fmt({ l: clamp(a.bgL + dl, 0, 1), c: a.bgC, h: a.bgH })
  const dark = a.bgL <= 0.5
  const step = dark ? 1 : -1
  root.setProperty('--bg', bg(0))
  root.setProperty('--bg-deep', bg(-0.04 * step))
  root.setProperty('--card', bg(0.04 * step))
  root.setProperty('--card-hover', bg(0.07 * step))
  root.setProperty('--popover', bg(0.06 * step))
  root.setProperty('--secondary', bg(0.10 * step))
  root.setProperty('--muted', bg(0.08 * step))
  root.setProperty('--border', bg(0.14 * step))
  root.setProperty('--border-soft', bg(0.08 * step))
  root.setProperty('--fg', fmt({ l: a.fgL, c: 0, h: 0 }))
  root.setProperty('--fg-muted', fmt({ l: a.bgL + (a.fgL - a.bgL) * 0.88, c: 0, h: 0 }))
  root.setProperty('--fg-dim', fmt({ l: a.bgL + (a.fgL - a.bgL) * 0.62, c: 0.005, h: a.bgH }))
  root.setProperty('--accent', fmt(a.accent))
  root.setProperty('--accent-fg', a.accent.l > 0.6 ? fmt({ l: 0.2, c: 0.03, h: a.accent.h }) : 'oklch(0.98 0 0)')
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

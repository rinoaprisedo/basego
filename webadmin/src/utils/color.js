// Converts a `#rrggbb` hex color into a Tailwind-compatible "r g b" channel
// string, so it can back a CSS var that Tailwind's rgb(var(...) / <alpha>)
// colors (and their opacity modifiers, e.g. bg-primary/10) consume directly.
export function hexToRgbChannels(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

// Darkens a hex color by `amount` (0-1) for the "dark" shade variant used on
// hover states, keeping it a single source of truth (the picked base color).
export function darkenHex(hex, amount = 0.15) {
  const clean = hex.replace('#', '')
  const r = Math.round(parseInt(clean.slice(0, 2), 16) * (1 - amount))
  const g = Math.round(parseInt(clean.slice(2, 4), 16) * (1 - amount))
  const b = Math.round(parseInt(clean.slice(4, 6), 16) * (1 - amount))
  return `${r} ${g} ${b}`
}

// Mixes a hex color toward white; used on dark backgrounds, where a dark brand
// color (like the default #35494d) would almost vanish.
export function lightenHex(hex, amount) {
  const clean = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => Math.round(parseInt(clean.slice(i, i + 2), 16) * (1 - amount) + 255 * amount))
  return ch.join(' ')
}

export function applyPrimaryColor(hex) {
  if (!hex) return
  const root = document.documentElement
  if (root.classList.contains('dark')) {
    root.style.setProperty('--color-primary-rgb', lightenHex(hex, 0.28))
    root.style.setProperty('--color-primary-dark-rgb', lightenHex(hex, 0.18))
    return
  }
  root.style.setProperty('--color-primary-rgb', hexToRgbChannels(hex))
  root.style.setProperty('--color-primary-dark-rgb', darkenHex(hex))
}

// Sidebar surface color. Empty = follow the theme default. Text/hover/border
// shades are derived from the picked color's luminance so any choice stays readable.
export function applySidebarColor(hex) {
  const root = document.documentElement
  const props = ['--c-sidebar-bg', '--c-sidebar-text', '--c-sidebar-title', '--c-sidebar-muted', '--c-sidebar-hover', '--c-sidebar-border']
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) {
    props.forEach((p) => root.style.removeProperty(p))
    return
  }
  const [r, g, b] = hexToRgbChannels(hex).split(' ').map(Number)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const darkBg = lum < 0.55
  const fg = darkBg ? '255 255 255' : '26 25 23'
  const mix = (c) => `${c[0]} ${c[1]} ${c[2]}`
  const towardFg = (a) => mix([r, g, b].map((v, i) => Math.round(v * (1 - a) + (darkBg ? 255 : 0) * a)))
  root.style.setProperty('--c-sidebar-bg', `${r} ${g} ${b}`)
  root.style.setProperty('--c-sidebar-text', darkBg ? '226 232 240' : '70 70 66')
  root.style.setProperty('--c-sidebar-title', fg)
  root.style.setProperty('--c-sidebar-muted', darkBg ? '148 163 184' : '120 118 112')
  root.style.setProperty('--c-sidebar-hover', towardFg(0.1))
  root.style.setProperty('--c-sidebar-border', towardFg(0.16))
}

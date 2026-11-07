// Ready-made color packages: a base (primary) color paired with a sidebar color.
// The first entry is the app default.
export const THEMES = [
  { id: 'default', name: 'Crimson', primary: '#ec4141', sidebar: '#000000' },
  { id: 'ocean', name: 'Ocean', primary: '#2563eb', sidebar: '#0f172a' },
  { id: 'forest', name: 'Forest', primary: '#059669', sidebar: '#0b2b22' },
  { id: 'violet', name: 'Violet', primary: '#7c3aed', sidebar: '#1e1b4b' },
  { id: 'sunset', name: 'Sunset', primary: '#ea580c', sidebar: '#1c1917' },
  { id: 'teal', name: 'Slate Teal', primary: '#0f766e', sidebar: '#1f2d30' },
  { id: 'rose', name: 'Rose Light', primary: '#e11d48', sidebar: '#ffffff' },
  { id: 'sky', name: 'Sky Light', primary: '#2563eb', sidebar: '#ffffff' },
]

export const DEFAULT_THEME = THEMES[0]

export const findTheme = (primary, sidebar) =>
  THEMES.find((t) => t.primary.toLowerCase() === (primary || '').toLowerCase() && t.sidebar.toLowerCase() === (sidebar || '').toLowerCase())

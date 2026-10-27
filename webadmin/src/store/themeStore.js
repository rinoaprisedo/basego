import { create } from 'zustand'
import useSettingsStore from './settingsStore'
import { applyPrimaryColor } from '../utils/color'

const KEY = 'basego-theme'

// An explicit choice wins; otherwise follow the OS preference; otherwise light.
const initial = () => {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // storage can be blocked; fall through to the OS preference
  }
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// The brand color is recomputed on every switch because dark mode uses a lighter shade of it.
const apply = (theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  applyPrimaryColor(useSettingsStore.getState().primaryColor)
}

const useThemeStore = create((set, get) => ({
  theme: initial(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // the theme then lasts for this session only
    }
    apply(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

// Applied at import time, before React renders, so a reload does not flash the light theme.
apply(useThemeStore.getState().theme)

export default useThemeStore

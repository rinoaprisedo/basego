import { describe, it, expect, beforeEach, vi } from 'vitest'

// Deterministic in-memory storage (the runtime's own localStorage varies by Node/jsdom version).
function memoryStorage() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  }
}

// The store applies the theme at import time, so each test re-imports it fresh.
async function freshStore() {
  const { default: useThemeStore } = await import('./themeStore?' + Math.random())
  return useThemeStore
}

describe('themeStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('style')
  })

  it('defaults to light when nothing is saved and the OS has no dark preference', async () => {
    const store = await freshStore()
    expect(store.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggle switches the class and persists the choice', async () => {
    const store = await freshStore()
    store.getState().toggle()
    expect(store.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('basego-theme')).toBe('dark')
    store.getState().toggle()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('basego-theme')).toBe('light')
  })

  it('restores a saved dark choice on load, before any render', async () => {
    localStorage.setItem('basego-theme', 'dark')
    const store = await freshStore()
    expect(store.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignores garbage in storage', async () => {
    localStorage.setItem('basego-theme', 'purple')
    const store = await freshStore()
    expect(store.getState().theme).toBe('light')
  })

  it('uses a lighter brand shade in dark mode so the default dark teal stays visible', async () => {
    const store = await freshStore()
    const root = document.documentElement
    store.getState().setTheme('light')
    const light = root.style.getPropertyValue('--color-primary-rgb')
    store.getState().setTheme('dark')
    const dark = root.style.getPropertyValue('--color-primary-rgb')
    expect(light).toBe('53 73 77') // #35494d unchanged
    const [lr, lg, lb] = light.split(' ').map(Number)
    const [dr, dg, db] = dark.split(' ').map(Number)
    expect(dr).toBeGreaterThan(lr)
    expect(dg).toBeGreaterThan(lg)
    expect(db).toBeGreaterThan(lb)
  })
})

describe('themeStore when storage is blocked', () => {
  it('still works for the session instead of throwing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    document.documentElement.classList.remove('dark')
    const store = await freshStore()
    expect(store.getState().theme).toBe('light')
    store.getState().toggle()
    expect(store.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

import { create } from 'zustand'
import { getSettings } from '../api/settings'

const useSettingsStore = create((set) => ({
  appName: 'BaseAdmin',
  logo: null,
  favicon: null,
  maintenanceMode: false,
  fetchSettings: async () => {
    try {
      const res = await getSettings()
      const list = Array.isArray(res.data) ? res.data : []
      const map = {}
      list.forEach((s) => {
        map[s.key] = s.value
      })
      set({
        appName: map.app_name || 'BaseAdmin',
        logo: map.app_logo || null,
        favicon: map.app_favicon || null,
        maintenanceMode: map.maintenance_mode === 'true' || map.maintenance_mode === true,
      })
    } catch {
      // settings API not reachable — keep defaults
    }
  },
}))

export default useSettingsStore

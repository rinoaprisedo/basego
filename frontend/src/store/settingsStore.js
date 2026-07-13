import { create } from 'zustand'
import { getSettings } from '../api/settings'
import { fileURL } from '../utils/url'

const useSettingsStore = create((set) => ({
  appName: 'BaseAdmin',
  logo: null,
  favicon: null,
  maintenanceMode: false,
  fetchSettings: async () => {
    try {
      const res = await getSettings()
      // GET /settings returns a { key: value } map directly, not an array.
      const map = res.data || {}
      set({
        appName: map.app_name || 'BaseAdmin',
        logo: fileURL(map.app_logo),
        favicon: fileURL(map.app_favicon),
        maintenanceMode: map.maintenance_mode === 'true' || map.maintenance_mode === true,
      })
    } catch {
      // settings API not reachable — keep defaults
    }
  },
}))

export default useSettingsStore

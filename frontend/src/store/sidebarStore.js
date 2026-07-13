import { create } from 'zustand'

const useSidebarStore = create((set) => ({
  isCollapsed: false,
  activeMenu: null,
  toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  close: () => set({ isCollapsed: true }),
  setActiveMenu: (menu) => set({ activeMenu: menu }),
}))

export default useSidebarStore

import { create } from 'zustand'

// Maps a raw URL segment (e.g. a UUID) to a human-readable label, so the
// Navbar breadcrumb can show "Super Admin" instead of the role's UUID.
const useBreadcrumbStore = create((set) => ({
  labels: {},
  setLabel: (segment, label) =>
    set((state) => ({ labels: { ...state.labels, [segment]: label } })),
}))

export default useBreadcrumbStore

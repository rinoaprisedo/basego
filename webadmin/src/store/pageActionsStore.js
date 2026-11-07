import { create } from 'zustand'

// Lets a page register its action buttons (Add New, Filter, Export, etc.).
// A <Table> on the page hosts them in its own toolbar (tableHosted); otherwise
// the Navbar renders them in its top toolbar slot.
const usePageActionsStore = create((set) => ({
  actions: null,
  tableHosted: false,
  setPageActions: (actions) => set({ actions }),
  setTableHosted: (tableHosted) => set({ tableHosted }),
}))

export default usePageActionsStore

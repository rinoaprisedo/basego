import { Menu } from 'lucide-react'
import useSidebarStore from '../../store/sidebarStore'
import usePageActionsStore from '../../store/pageActionsStore'

function Navbar() {
  const toggleSidebar = useSidebarStore((s) => s.toggle)
  const pageActions = usePageActionsStore((s) => s.actions)
  const tableHosted = usePageActionsStore((s) => s.tableHosted)

  // On desktop the bar only exists to host page actions that no <Table> took over.
  const hasActions = !tableHosted && !!pageActions

  return (
    <header
      className={`sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-surface-border/70 glass px-4 md:px-[28px] ${
        hasActions ? '' : 'lg:hidden'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button onClick={toggleSidebar} className="shrink-0 rounded-md p-2 text-text-secondary transition-colors duration-100 hover:bg-surface-hover lg:hidden">
          <Menu size={20} />
        </button>
        {pageActions && <div className={`min-w-0 ${tableHosted ? 'lg:hidden' : ''}`}>{pageActions}</div>}
      </div>
    </header>
  )
}

export default Navbar

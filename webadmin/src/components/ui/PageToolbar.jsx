import { useEffect } from 'react'
import { Search } from 'lucide-react'
import usePageActionsStore from '../../store/pageActionsStore'
import Input from './Input'

// Standard card toolbar: the page's registered actions on the left, optional
// search on the right. Rendering it tells the Navbar that actions are hosted
// here (desktop); below `lg` the Navbar shows them instead.
function PageToolbar({ search, onSearchChange }) {
  const pageActions = usePageActionsStore((s) => s.actions)
  const setTableHosted = usePageActionsStore((s) => s.setTableHosted)

  useEffect(() => {
    setTableHosted(true)
    return () => setTableHosted(false)
  }, [setTableHosted])

  if (!pageActions && !onSearchChange) return null

  return (
    <div
      className={`flex-wrap items-center justify-between gap-3 border-b border-surface-border px-[16px] py-[10px] ${
        onSearchChange ? 'flex' : 'hidden lg:flex'
      }`}
    >
      <div className="hidden min-w-0 max-w-full lg:block">{pageActions}</div>
      {onSearchChange && (
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="h-9 pl-9 text-[13px]"
          />
        </div>
      )}
    </div>
  )
}

export default PageToolbar

import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as Icons from 'lucide-react'
import { LayoutGrid, X } from 'lucide-react'
import { getMenus } from '../../api/menus'
import useSidebarStore from '../../store/sidebarStore'
import usePermission from '../../hooks/usePermission'

function iconFor(name) {
  return Icons[name] || LayoutGrid
}

function Sidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const { canView } = usePermission()

  const { data } = useQuery({
    queryKey: ['menus', 'tree'],
    queryFn: () => getMenus({ is_active: true }),
    staleTime: 5 * 60 * 1000,
  })

  // /menus returns sections with a nested `menus` array already grouped server-side
  const sections = (() => {
    const raw = data?.data
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    return raw.sections || []
  })()

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar-bg transition-all duration-200 ${
          isCollapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'w-64 translate-x-0'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <span className="text-lg font-bold text-white">{isCollapsed ? 'BA' : 'BaseAdmin'}</span>
          <button onClick={toggle} className="text-sidebar-text lg:hidden">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((section) => (
            <div key={section.id || section.uuid || section.name} className="mb-4">
              {!isCollapsed && (
                <div className="mb-1 flex items-center gap-2 px-2 py-2 text-xs font-semibold uppercase text-sidebar-text/70">
                  {section.name}
                </div>
              )}
              {(section.menus || []).map((menu) => {
                if (!canView(menu.path) && !canView(menu.name)) return null
                const Icon = iconFor(menu.icon)
                return (
                  <NavLink
                    key={menu.id || menu.uuid}
                    to={menu.path}
                    className={({ isActive }) =>
                      `mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sidebar-active text-white'
                          : 'text-sidebar-text hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={18} />
                    {!isCollapsed && menu.name}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
      {!isCollapsed && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={toggle} />
      )}
    </>
  )
}

export default Sidebar

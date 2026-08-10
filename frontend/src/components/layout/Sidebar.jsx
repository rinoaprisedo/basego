import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as Icons from 'lucide-react'
import { LayoutGrid, X, FileCode2, ChevronRight } from 'lucide-react'
import { getMenus } from '../../api/menus'
import useSidebarStore from '../../store/sidebarStore'
import useSettingsStore from '../../store/settingsStore'
import useAuthStore from '../../store/authStore'
import usePermission from '../../hooks/usePermission'

function iconFor(name) {
  return Icons[name] || LayoutGrid
}

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8500/api/v1'
const swaggerURL = apiBase.replace(/\/api\/v1\/?$/, '') + '/swagger/index.html'

// A menu item with a path is gated by the existing permission check
// (unchanged from before). A group item with no path of its own — e.g. "Job
// Posting" — is visible only if at least one descendant survives filtering.
// A pathless *leaf* (no children either) has nothing to gate — it's a
// placeholder waiting for its route to be wired up — so it stays visible
// rather than disappearing entirely. Recurses to whatever depth the tree goes.
function filterVisible(items, canView) {
  const result = []
  for (const item of items || []) {
    const children = filterVisible(item.children, canView)
    const hasChildren = (item.children || []).length > 0
    let selfVisible
    if (item.path) selfVisible = canView(item.path) || canView(item.name)
    else if (hasChildren) selfVisible = children.length > 0
    else selfVisible = true
    if (selfVisible) result.push({ ...item, children })
  }
  return result
}

function SidebarItem({ menu, depth, expanded, toggleExpanded, close }) {
  const Icon = iconFor(menu.icon)
  const hasChildren = menu.children.length > 0
  const isExpanded = expanded.has(menu.uuid)
  const padStyle = { paddingLeft: 10 + depth * 16 }

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => toggleExpanded(menu.uuid)}
          style={padStyle}
          className="mb-1 flex h-[38px] w-full items-center gap-3 rounded-lg pr-[10px] text-[13px] text-sidebar-text transition-colors duration-100 hover:bg-surface-hover hover:text-text-primary"
        >
          <Icon size={16} strokeWidth={1.7} />
          <span className="flex-1 text-left">{menu.name}</span>
          <ChevronRight size={14} className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
        {isExpanded && (
          <div>
            {menu.children.map((child) => (
              <SidebarItem key={child.uuid} menu={child} depth={depth + 1} expanded={expanded} toggleExpanded={toggleExpanded} close={close} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const linkClasses =
    'mb-1 flex h-[38px] items-center gap-3 rounded-lg pr-[10px] text-[13px] transition-colors duration-100'

  // Leaves with no route wired up yet still render as a normal clickable
  // link (falling back to "#") so the tree previews the same way it will
  // once real paths are filled in. Plain `Link` rather than `NavLink` here —
  // NavLink's isActive would otherwise match "#" against the current
  // location and light up every un-wired item as "active" simultaneously.
  if (!menu.path) {
    return (
      <Link
        to="#"
        onClick={(e) => e.preventDefault()}
        style={padStyle}
        className={`${linkClasses} text-sidebar-text hover:bg-surface-hover hover:text-text-primary`}
      >
        <Icon size={16} strokeWidth={1.7} />
        {menu.name}
      </Link>
    )
  }

  return (
    <NavLink
      to={menu.path}
      onClick={close}
      style={padStyle}
      className={({ isActive }) =>
        `${linkClasses} ${
          isActive ? 'bg-sidebar-active font-medium text-white' : 'text-sidebar-text hover:bg-surface-hover hover:text-text-primary'
        }`
      }
    >
      <Icon size={16} strokeWidth={1.7} />
      {menu.name}
    </NavLink>
  )
}

function Sidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const close = useSidebarStore((s) => s.close)
  const appName = useSettingsStore((s) => s.appName)
  const isSuperadmin = useAuthStore((s) => !!s.user?.is_superadmin)
  const { canView } = usePermission()
  const [expanded, setExpanded] = useState(() => new Set())

  const toggleExpanded = (uuid) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(uuid)) next.delete(uuid)
      else next.add(uuid)
      return next
    })
  }

  const { data } = useQuery({
    queryKey: ['menus', 'tree'],
    queryFn: () => getMenus({ is_active: true }),
    staleTime: 5 * 60 * 1000,
  })

  // /menus returns sections with a nested `menus` array, each item recursively
  // carrying its own `children` array (already grouped/sorted server-side).
  const sections = (() => {
    const raw = data?.data
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    return raw.sections || []
  })()

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-surface-border bg-sidebar-bg transition-transform duration-200 ${
          isCollapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0'
        }`}
      >
        <div className="relative flex h-[60px] items-center justify-center border-b border-surface-border px-4">
          <span className="truncate text-[17px] font-bold tracking-[-.02em] text-text-primary">{appName}</span>
          <button onClick={toggle} className="absolute right-4 text-text-secondary lg:hidden">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((section) => {
            const visibleMenus = filterVisible(section.menus, canView)
            const showSwagger = section.name === 'System' && isSuperadmin
            if (visibleMenus.length === 0 && !showSwagger) return null

            return (
              <div key={section.id || section.uuid || section.name} className="mb-4">
                <div className="mb-1 flex items-center gap-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-[.08em] text-text-tertiary">
                  {section.name}
                </div>
                {visibleMenus.map((menu) => (
                  <SidebarItem key={menu.id || menu.uuid} menu={menu} depth={0} expanded={expanded} toggleExpanded={toggleExpanded} close={close} />
                ))}
                {showSwagger && (
                  <a
                    href={swaggerURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className="mb-1 flex h-[38px] items-center gap-3 rounded-lg px-[10px] text-[13px] text-sidebar-text transition-colors duration-100 hover:bg-surface-hover hover:text-text-primary"
                  >
                    <FileCode2 size={16} strokeWidth={1.7} />
                    Swagger
                  </a>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
      {!isCollapsed && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={toggle} />
      )}
    </>
  )
}

export default Sidebar

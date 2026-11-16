import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as Icons from 'lucide-react'
import { LayoutGrid, X, FileCode2, Sun, Moon, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMenus } from '../../api/menus'
import useSidebarStore from '../../store/sidebarStore'
import useSettingsStore from '../../store/settingsStore'
import useAuthStore from '../../store/authStore'
import useThemeStore from '../../store/themeStore'
import { logout as logoutApi } from '../../api/auth'
import usePermission from '../../hooks/usePermission'

function iconFor(name) {
  return Icons[name] || LayoutGrid
}

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8800/api/v1'
const swaggerURL = apiBase.replace(/\/api\/v1\/?$/, '') + '/swagger/index.html'

function Sidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const close = useSidebarStore((s) => s.close)
  const appName = useSettingsStore((s) => s.appName)
  const isSuperadmin = useAuthStore((s) => !!s.user?.is_superadmin)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const navigate = useNavigate()
  const { canView } = usePermission()

  const handleLogout = async () => {
    try {
      await logoutApi()
    } catch {
      // ignore network failure on logout
    }
    logout()
    toast.success('Logged out')
    navigate('/login')
  }

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
        className={`fixed bottom-3 left-3 top-3 z-40 flex w-[240px] flex-col overflow-hidden rounded-2xl border border-[rgb(var(--c-sidebar-border)/0.7)] bg-sidebar-bg shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
          isCollapsed ? '-translate-x-[calc(100%+12px)] lg:translate-x-0' : 'translate-x-0'
        }`}
      >
        <div className="relative flex h-[60px] items-center justify-center border-b border-[rgb(var(--c-sidebar-border))] px-4">
          <span className="truncate text-[17px] font-bold tracking-[-.02em] text-gradient">{appName}</span>
          <button onClick={toggle} className="absolute right-4 text-text-secondary lg:hidden">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((section) => {
            const visibleMenus = (section.menus || []).filter((menu) => canView(menu.path) || canView(menu.name))
            const showSwagger = section.name === 'System' && isSuperadmin
            if (visibleMenus.length === 0 && !showSwagger) return null

            return (
              <div key={section.id || section.uuid || section.name} className="mb-4">
                <div className="mb-1 flex items-center gap-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[rgb(var(--c-sidebar-muted))]">
                  {section.name}
                </div>
                {visibleMenus.map((menu) => {
                  const Icon = iconFor(menu.icon)
                  return (
                    <NavLink
                      key={menu.id || menu.uuid}
                      to={menu.path}
                      onClick={close}
                      className={({ isActive }) =>
                        `mb-1 flex h-[38px] items-center gap-3 rounded-lg px-[10px] text-[13px] transition-colors duration-100 ${
                          isActive
                            ? 'bg-sidebar-active font-medium text-white shadow-[0_0_18px_-2px_rgb(var(--c-accent)/0.55)] ring-1 ring-[rgb(var(--c-accent)/0.5)]'
                            : 'text-sidebar-text hover:bg-[rgb(var(--c-sidebar-hover))] hover:text-[rgb(var(--c-sidebar-title))]'
                        }`
                      }
                    >
                      <Icon size={16} strokeWidth={1.7} />
                      {menu.name}
                    </NavLink>
                  )
                })}
                {showSwagger && (
                  <a
                    href={swaggerURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className="mb-1 flex h-[38px] items-center gap-3 rounded-lg px-[10px] text-[13px] text-sidebar-text transition-colors duration-100 hover:bg-[rgb(var(--c-sidebar-hover))] hover:text-[rgb(var(--c-sidebar-title))]"
                  >
                    <FileCode2 size={16} strokeWidth={1.7} />
                    Swagger
                  </a>
                )}
              </div>
            )
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-[rgb(var(--c-sidebar-border))] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white">
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight text-[rgb(var(--c-sidebar-title))]" title={user?.name}>
              {user?.name || 'User'}
            </div>
            <div className="truncate text-[11px] text-[rgb(var(--c-sidebar-muted))]" title={user?.email}>
              {user?.email}
            </div>
          </div>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-text transition-colors hover:bg-[rgb(var(--c-sidebar-hover))] hover:text-[rgb(var(--c-sidebar-title))]"
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.7} /> : <Moon size={16} strokeWidth={1.7} />}
          </button>
          <button
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-text transition-colors hover:bg-danger/15 hover:text-danger"
          >
            <LogOut size={16} strokeWidth={1.7} />
          </button>
        </div>
      </aside>
      {!isCollapsed && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={toggle} />
      )}
    </>
  )
}

export default Sidebar

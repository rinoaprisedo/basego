import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Sun, Moon, ChevronDown, LogOut, User } from 'lucide-react'
import toast from 'react-hot-toast'
import useDarkMode from '../../hooks/useDarkMode'
import useSidebarStore from '../../store/sidebarStore'
import useAuthStore from '../../store/authStore'
import { logout as logoutApi } from '../../api/auth'

function Navbar() {
  const [isDark, setIsDark] = useDarkMode()
  const toggleSidebar = useSidebarStore((s) => s.toggle)
  const [menuOpen, setMenuOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()

  const crumbs = location.pathname.split('/').filter(Boolean)

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

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-surface-border bg-surface-card px-4 dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-700">
          <Menu size={20} />
        </button>
        <nav className="text-sm text-text-secondary">
          <span className="capitalize">{crumbs.length ? crumbs.join(' / ') : 'Dashboard'}</span>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsDark(!isDark)}
          className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <span className="hidden text-sm font-medium sm:block">{user?.name || 'User'}</span>
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-md border border-surface-border bg-surface-card py-1 shadow-lg dark:bg-slate-800 dark:border-slate-700">
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary">
                <User size={14} /> {user?.email}
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Navbar

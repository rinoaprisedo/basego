import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import useSidebarStore from '../../store/sidebarStore'

function AppLayout() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)

  return (
    <div className="min-h-screen bg-surface-bg dark:bg-slate-900">
      <Sidebar />
      <div className={`transition-all duration-200 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <Navbar />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppLayout

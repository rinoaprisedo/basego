import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen app-bg">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-[240px]">
        <Navbar />
        <main key={pathname} className="rise flex-1 p-4 pb-6 md:px-[28px] md:pb-8 md:pt-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppLayout

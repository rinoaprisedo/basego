import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import Footer from './Footer'

function AppLayout() {
  return (
    <div className="min-h-screen app-bg">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-[240px]">
        <Navbar />
        <main className="flex-1 p-4 pb-16 md:px-[28px] md:pb-14 md:pt-4">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}

export default AppLayout

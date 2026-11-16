import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import useSettingsStore from '../../store/settingsStore'
import BackendOffline from '../BackendOffline'
import TechBackground from '../auth/TechBackground'

function AuthLayout() {
  const appName = useSettingsStore((s) => s.appName)
  const logo = useSettingsStore((s) => s.logo)
  const backendOnline = useSettingsStore((s) => s.backendOnline)
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)

  useEffect(() => {
    if (backendOnline) return
    const interval = setInterval(fetchSettings, 5000)
    return () => clearInterval(interval)
  }, [backendOnline, fetchSettings])

  if (!backendOnline) return <BackendOffline />

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <TechBackground />
      <div className="rise relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          {logo ? (
            <img src={logo} alt={appName} className="h-12 w-12 object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">
              {appName.charAt(0)}
            </div>
          )}
          <h1 className="text-[20px] font-semibold tracking-[-.02em] text-white">{appName}</h1>
        </div>
        <div className="relative rounded-3xl border border-white/25 bg-white/[0.10] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150 [&_h2]:text-white [&_label]:text-white/70 [&_input]:border-white/25 [&_input]:bg-white/[0.08] [&_input]:text-white [&_input::placeholder]:text-white/40 [&_input:focus]:border-primary [&_input:focus]:bg-white/[0.14] [&_input:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&_input:-webkit-autofill]:shadow-[inset_0_0_0_100px_rgba(52,58,72,1)] [&_button[aria-label*=password]]:text-white/60 [&_button[aria-label*=password]:hover]:text-white">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default AuthLayout

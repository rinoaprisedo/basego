import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import useSettingsStore from '../../store/settingsStore'
import BackendOffline from '../BackendOffline'
import loginBackground from '../../assets/background-login.webp'

function AuthLayout() {
  const appName = useSettingsStore((s) => s.appName)
  const logo = useSettingsStore((s) => s.logo)
  const login = useSettingsStore((s) => s.login)
  const backendOnline = useSettingsStore((s) => s.backendOnline)
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)

  useEffect(() => {
    if (backendOnline) return
    const interval = setInterval(fetchSettings, 5000)
    return () => clearInterval(interval)
  }, [backendOnline, fetchSettings])

  if (!backendOnline) return <BackendOffline />

  return (
    <div className="flex min-h-screen app-bg">
      <div className="hero-card relative hidden overflow-hidden md:flex md:w-1/2 md:flex-col md:justify-between md:p-12">
        <img src={loginBackground} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity" />
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative flex items-center gap-3">
          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-[rgb(var(--c-accent))] shadow-[0_0_12px_rgb(var(--c-accent))]" />
          <span className="text-gradient text-[20px] font-bold tracking-tight">{appName}</span>
        </div>
        <div className="relative">
          <div className={`mb-4 inline-flex ${login.badge ? '' : 'hidden'} items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 font-mono text-[11px] text-white/90`}>
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[rgb(var(--c-accent))]" /> {login.badge}
          </div>
          <h2 className="text-[40px] font-bold leading-[1.1] tracking-tight">
            {login.headline.split(/\*(.+?)\*/g).map((part, i) =>
              i % 2 ? <span key={i} className="text-gradient">{part}</span> : part
            )}
          </h2>
          <p className="mt-4 max-w-md text-[15px] text-slate-300">
            {login.description}
          </p>
        </div>
        <div className="relative font-mono text-[11px] text-slate-400">© {new Date().getFullYear()} {appName}</div>
      </div>
      <div className="flex w-full items-center justify-center px-4 md:w-1/2">
        <div className="rise w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-2">
            {logo ? (
              <img src={logo} alt={appName} className="h-12 w-12 object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[rgb(var(--c-accent))] to-[var(--accent-shift)] text-lg font-bold text-white shadow-[0_0_24px_-4px_rgb(var(--c-accent))]">
                {appName.charAt(0)}
              </div>
            )}
            <h1 className="text-gradient text-[22px] font-semibold tracking-[-.02em]">{appName}</h1>
          </div>
          <div className="glass rounded-2xl border border-surface-border/80 p-[40px_40px] shadow-[0_20px_60px_-20px_rgb(var(--c-accent)/0.45)]">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout

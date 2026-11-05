import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Users, ShieldCheck, Activity, Ticket, Cpu, Server, Database, Zap } from 'lucide-react'
import { getUsers } from '../../api/users'
import { getRoles } from '../../api/roles'
import { getActivityLogs } from '../../api/activityLogs'
import { getTickets } from '../../api/devTickets'
import { getVersion } from '../../api/system'
import useAuthStore from '../../store/authStore'
import useSettingsStore from '../../store/settingsStore'

const total = (q) => q.data?.meta?.total ?? '—'

function Stat({ icon: Icon, label, value, hint, delay }) {
  return (
    <div className="glow-card glass rise p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-[.08em] text-text-secondary">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(var(--c-accent)/0.12)] text-[rgb(var(--c-accent))]">
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-3 font-mono text-[34px] font-semibold leading-none tracking-tight">{value}</div>
      <div className="mt-2 text-[12px] text-text-tertiary">{hint}</div>
      <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-surface-border/60">
        <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[rgb(var(--c-accent))] to-[var(--accent-shift)]" />
      </div>
    </div>
  )
}

function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const appName = useSettingsStore((s) => s.appName)
  const opts = { retry: false, staleTime: 60000 }
  const users = useQuery({ queryKey: ['dash', 'users'], queryFn: () => getUsers({ limit: 1 }), ...opts })
  const roles = useQuery({ queryKey: ['dash', 'roles'], queryFn: () => getRoles({ limit: 1 }), ...opts })
  const logs = useQuery({ queryKey: ['dash', 'logs'], queryFn: () => getActivityLogs({ limit: 6 }), ...opts })
  const tickets = useQuery({ queryKey: ['dash', 'tickets'], queryFn: () => getTickets({ limit: 1 }), ...opts })
  const ver = useQuery({ queryKey: ['version'], queryFn: getVersion, staleTime: Infinity, retry: false })

  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Good morning' : hour < 15 ? 'Good afternoon' : hour < 19 ? 'Good evening' : 'Good night'
  const systems = [
    { icon: Server, name: 'API Server', ok: !ver.isError },
    { icon: Database, name: 'PostgreSQL', ok: !ver.isError },
    { icon: Zap, name: 'Redis Session', ok: !ver.isError },
    { icon: Cpu, name: 'Web Admin', ok: true },
  ]

  return (
    <div className="space-y-6">
      <section className="hero-card rise relative overflow-hidden rounded-2xl border border-white/10 p-7 shadow-md">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 font-mono text-[11px] text-white/90">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[rgb(var(--c-accent))]" /> SYSTEM ONLINE
            </div>
            <h1 className="text-[28px] font-bold tracking-tight">
              {greet}, <span className="text-gradient">{user?.name || 'Admin'}</span>
            </h1>
            <p className="mt-1 text-[14px] text-slate-300">Welcome to {appName} control center.</p>
          </div>
          <div className="text-right font-mono text-[12px] text-slate-300">
            <div>{format(new Date(), 'EEEE, dd MMM yyyy')}</div>
            <div className="text-gradient">BE {ver.data?.data?.backend_version || ver.data?.backend_version || 'v1'}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="Users" value={total(users)} hint="Registered accounts" delay={60} />
        <Stat icon={ShieldCheck} label="Roles" value={total(roles)} hint="Access profiles" delay={120} />
        <Stat icon={Activity} label="Activity" value={total(logs)} hint="Logged events" delay={180} />
        <Stat icon={Ticket} label="Tickets" value={total(tickets)} hint="Dev tickets" delay={240} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glow-card glass rise p-5 xl:col-span-2" style={{ animationDelay: '300ms' }}>
          <h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold">
            <Activity size={16} className="text-[rgb(var(--c-accent))]" /> Recent Activity
          </h2>
          <ul className="divide-y divide-surface-border/70">
            {(logs.data?.data || []).map((l) => (
              <li key={l.uuid || l.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--c-accent))] shadow-[0_0_8px_rgb(var(--c-accent))]" />
                  <span className="truncate">
                    <b className="font-medium">{l.user?.name || 'System'}</b>{' '}
                    <span className="text-text-secondary">{l.action}</span>{' '}
                    <span className="font-mono text-text-tertiary">{l.module || l.table_name || ''}</span>
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-text-tertiary">
                  {l.created_at ? format(new Date(l.created_at), 'dd MMM HH:mm') : ''}
                </span>
              </li>
            ))}
            {!logs.isLoading && !(logs.data?.data || []).length && (
              <li className="py-6 text-center text-[13px] text-text-tertiary">No activity yet</li>
            )}
          </ul>
        </div>

        <div className="glow-card glass rise p-5" style={{ animationDelay: '360ms' }}>
          <h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold">
            <Cpu size={16} className="text-[rgb(var(--c-accent-2))]" /> System Status
          </h2>
          <ul className="space-y-3">
            {systems.map(({ icon: Icon, name, ok }) => (
              <li key={name} className="flex items-center justify-between rounded-lg border border-surface-border/70 bg-surface-bg/40 px-3 py-2.5 text-[13px]">
                <span className="flex items-center gap-2.5"><Icon size={15} className="text-text-secondary" />{name}</span>
                <span className={`flex items-center gap-1.5 font-mono text-[11px] ${ok ? 'text-success' : 'text-danger'}`}>
                  <span className={`pulse-dot h-1.5 w-1.5 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`} />
                  {ok ? 'OPERATIONAL' : 'DOWN'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

export default Dashboard

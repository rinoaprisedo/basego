import { useQuery } from '@tanstack/react-query'
import { Users, LayoutGrid, ShieldCheck, Activity } from 'lucide-react'
import { format } from 'date-fns'
import { getUsers } from '../../api/users'
import { getMenus } from '../../api/menus'
import { getRoles } from '../../api/roles'
import { getActivityLogs } from '../../api/activityLogs'
import Skeleton from '../../components/ui/Skeleton'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'

function StatCard({ icon: Icon, label, value, loading }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-5 dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-14" /> : <p className="mt-1 text-2xl font-bold text-text-primary dark:text-slate-100">{value}</p>}
        </div>
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon size={22} />
        </div>
      </div>
    </div>
  )
}

const actionVariant = { create: 'success', update: 'primary', delete: 'danger', login: 'success', logout: 'neutral', view: 'neutral' }

function Dashboard() {
  const usersQ = useQuery({ queryKey: ['stats', 'users'], queryFn: () => getUsers({ page: 1, limit: 1 }) })
  const menusQ = useQuery({ queryKey: ['stats', 'menus'], queryFn: () => getMenus({ page: 1, limit: 1 }) })
  const rolesQ = useQuery({ queryKey: ['stats', 'roles'], queryFn: () => getRoles({ page: 1, limit: 1 }) })
  const logsQ = useQuery({ queryKey: ['stats', 'logs'], queryFn: () => getActivityLogs({ page: 1, limit: 10 }) })

  const recent = logsQ.data?.data || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Users" value={usersQ.data?.meta?.total ?? '-'} loading={usersQ.isLoading} />
        <StatCard icon={LayoutGrid} label="Menus" value={menusQ.data?.meta?.total ?? '-'} loading={menusQ.isLoading} />
        <StatCard icon={ShieldCheck} label="Roles" value={rolesQ.data?.meta?.total ?? '-'} loading={rolesQ.isLoading} />
        <StatCard icon={Activity} label="Activity Logs" value={logsQ.data?.meta?.total ?? '-'} loading={logsQ.isLoading} />
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-card dark:bg-slate-800 dark:border-slate-700">
        <div className="border-b border-surface-border px-5 py-4 dark:border-slate-700">
          <h3 className="font-semibold text-text-primary dark:text-slate-100">Recent Activity</h3>
        </div>
        {logsQ.isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState title="No recent activity" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-text-secondary dark:border-slate-700">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Module</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((log) => (
                <tr key={log.uuid} className="border-b border-surface-border last:border-0 dark:border-slate-700">
                  <td className="px-4 py-3 text-text-secondary">{log.created_at ? format(new Date(log.created_at), 'PP p') : '-'}</td>
                  <td className="px-4 py-3">{log.user?.name || 'System'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={actionVariant[log.action] || 'neutral'}>{log.action}</Badge>
                  </td>
                  <td className="px-4 py-3">{log.module}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Dashboard

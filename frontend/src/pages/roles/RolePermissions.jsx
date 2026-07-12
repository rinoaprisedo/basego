import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import { getRole, getRolePermissions, updateRolePermissions } from '../../api/roles'

const fields = [
  { key: 'can_view', label: 'View' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
]

function RolePermissions() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const [matrix, setMatrix] = useState({})

  const { data: role } = useQuery({ queryKey: ['roles', uuid], queryFn: () => getRole(uuid) })
  const { data: permsData, isLoading } = useQuery({
    queryKey: ['roles', uuid, 'permissions'],
    queryFn: () => getRolePermissions(uuid),
  })

  useEffect(() => {
    if (permsData?.data) {
      const initial = {}
      permsData.data.forEach((row) => {
        initial[row.menu_id || row.menu?.id || row.menu_uuid] = {
          menu_id: row.menu_id || row.menu?.id,
          menu_uuid: row.menu?.uuid || row.menu_uuid,
          menu_name: row.menu?.name || row.menu_name,
          can_view: !!row.can_view,
          can_create: !!row.can_create,
          can_edit: !!row.can_edit,
          can_delete: !!row.can_delete,
        }
      })
      setMatrix(initial)
    }
  }, [permsData])

  const saveMutation = useMutation({
    mutationFn: (payload) => updateRolePermissions(uuid, { permissions: payload }),
    onSuccess: () => toast.success('Permissions updated'),
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const toggle = (menuId, field) => {
    setMatrix((prev) => ({
      ...prev,
      [menuId]: { ...prev[menuId], [field]: !prev[menuId][field] },
    }))
  }

  const toggleRow = (menuId) => {
    setMatrix((prev) => {
      const row = prev[menuId]
      const allOn = fields.every((f) => row[f.key])
      const next = {}
      fields.forEach((f) => {
        next[f.key] = !allOn
      })
      return { ...prev, [menuId]: { ...row, ...next } }
    })
  }

  const handleSave = () => {
    const payload = Object.values(matrix).map((row) => ({
      menu_id: row.menu_id,
      can_view: row.can_view,
      can_create: row.can_create,
      can_edit: row.can_edit,
      can_delete: row.can_delete,
    }))
    saveMutation.mutate(payload)
  }

  const rows = Object.entries(matrix)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/roles')} className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-700">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-text-primary dark:text-slate-100">
            Permissions - {role?.data?.name}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card dark:bg-slate-800 dark:border-slate-700">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-text-secondary dark:border-slate-700">
                <th className="px-4 py-3 font-medium">Menu</th>
                {fields.map((f) => (
                  <th key={f.key} className="px-4 py-3 text-center font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-medium">All</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([menuId, row]) => (
                <tr key={menuId} className="border-b border-surface-border last:border-0 dark:border-slate-700">
                  <td className="px-4 py-3 font-medium text-text-primary dark:text-slate-100">{row.menu_name}</td>
                  {fields.map((f) => (
                    <td key={f.key} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={!!row[f.key]}
                        onChange={() => toggle(menuId, f.key)}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={fields.every((f) => row[f.key])}
                      onChange={() => toggleRow(menuId)}
                      className="h-4 w-4 accent-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default RolePermissions

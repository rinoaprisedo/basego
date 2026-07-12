import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import MenuFormModal from './MenuFormModal'
import { getMenus, createMenu, updateMenu, deleteMenu, reorderMenus } from '../../api/menus'
import { getMenuSections } from '../../api/menuSections'
import usePermission from '../../hooks/usePermission'

function Menus() {
  const { canCreate, canEdit, canDelete } = usePermission()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['menus', 'all'], queryFn: () => getMenus({ limit: 200 }) })
  const { data: sectionsData } = useQuery({ queryKey: ['menu-sections'], queryFn: () => getMenuSections({ limit: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? updateMenu(editing.uuid, payload) : createMenu(payload)),
    onSuccess: () => {
      toast.success(editing ? 'Menu updated' : 'Menu created')
      queryClient.invalidateQueries({ queryKey: ['menus'] })
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (uuid) => deleteMenu(uuid),
    onSuccess: () => {
      toast.success('Menu deleted')
      queryClient.invalidateQueries({ queryKey: ['menus'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const reorderMutation = useMutation({
    mutationFn: (payload) => reorderMenus({ menus: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menus'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Reorder failed'),
  })

  const menus = data?.data || []
  const sections = sectionsData?.data || []

  const grouped = sections.map((sec) => ({
    ...sec,
    menus: menus.filter((m) => (m.menu_section_id || m.menu_section?.id) === sec.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
  }))

  const move = (sectionMenus, index, dir) => {
    const swapIndex = index + dir
    if (swapIndex < 0 || swapIndex >= sectionMenus.length) return
    const a = sectionMenus[index]
    const b = sectionMenus[swapIndex]
    reorderMutation.mutate([
      { uuid: a.uuid, order: b.order },
      { uuid: b.uuid, order: a.order },
    ])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-slate-100">Menus</h1>
        {canCreate('menus') && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} /> Add Menu
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : grouped.length === 0 ? (
        <EmptyState title="No menu sections found" />
      ) : (
        <div className="space-y-4">
          {grouped.map((sec) => (
            <div key={sec.id} className="rounded-lg border border-surface-border bg-surface-card dark:bg-slate-800 dark:border-slate-700">
              <div className="border-b border-surface-border px-4 py-3 font-semibold text-text-primary dark:border-slate-700 dark:text-slate-100">
                {sec.name}
              </div>
              {sec.menus.length === 0 ? (
                <div className="p-4 text-sm text-text-secondary">No menus in this section</div>
              ) : (
                <ul className="divide-y divide-surface-border dark:divide-slate-700">
                  {sec.menus.map((m, i) => (
                    <li key={m.uuid} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-medium text-text-primary dark:text-slate-100">{m.name}</span>
                        <span className="text-text-secondary">{m.path}</span>
                        <Badge variant={m.is_active ? 'success' : 'neutral'}>{m.is_active ? 'active' : 'inactive'}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => move(sec.menus, i, -1)} disabled={i === 0} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700">
                          <ArrowUp size={14} />
                        </button>
                        <button onClick={() => move(sec.menus, i, 1)} disabled={i === sec.menus.length - 1} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-700">
                          <ArrowDown size={14} />
                        </button>
                        {canEdit('menus') && (
                          <button
                            onClick={() => {
                              setEditing(m)
                              setFormOpen(true)
                            }}
                            className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete('menus') && (
                          <button onClick={() => setDeleting(m)} className="rounded p-1.5 text-danger hover:bg-danger/10">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <MenuFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
        initialData={editing}
        sections={sections}
        loading={saveMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutate(deleting.uuid)}
        loading={deleteMutation.isPending}
        message={`Delete menu "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  )
}

export default Menus

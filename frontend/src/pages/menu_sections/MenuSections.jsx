import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import MenuSectionFormModal from './MenuSectionFormModal'
import { getMenuSections, createMenuSection, updateMenuSection, deleteMenuSection } from '../../api/menuSections'
import usePermission from '../../hooks/usePermission'

function MenuSections() {
  const { canCreate, canEdit, canDelete } = usePermission()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['menu-sections'], queryFn: () => getMenuSections({ limit: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? updateMenuSection(editing.uuid, payload) : createMenuSection(payload)),
    onSuccess: () => {
      toast.success(editing ? 'Section updated' : 'Section created')
      queryClient.invalidateQueries({ queryKey: ['menu-sections'] })
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (uuid) => deleteMenuSection(uuid),
    onSuccess: () => {
      toast.success('Section deleted')
      queryClient.invalidateQueries({ queryKey: ['menu-sections'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'icon', label: 'Icon' },
    { key: 'order', label: 'Order' },
    { key: 'menu_count', label: 'Menus', render: (row) => row.menu_count ?? (row.menus?.length || 0) },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {canEdit('menu_sections') && (
            <button
              onClick={() => {
                setEditing(row)
                setFormOpen(true)
              }}
              className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Pencil size={16} />
            </button>
          )}
          {canDelete('menu_sections') && (
            <button onClick={() => setDeleting(row)} className="rounded p-1.5 text-danger hover:bg-danger/10">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-slate-100">Menu Sections</h1>
        {canCreate('menu_sections') && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} /> Add Section
          </Button>
        )}
      </div>

      <Table columns={columns} data={data?.data || []} loading={isLoading} />

      <MenuSectionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
        initialData={editing}
        loading={saveMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutate(deleting.uuid)}
        loading={deleteMutation.isPending}
        message={`Delete section "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  )
}

export default MenuSections

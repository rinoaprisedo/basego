import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChevronRight, ChevronDown } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { Menubar, MenubarAction, MenubarLabel, MenubarSeparator } from '../../components/ui/Menubar'
import MenuFormModal from './MenuFormModal'
import { getMenus, createMenu, updateMenu, deleteMenu, reorderMenus } from '../../api/menus'
import { getMenuSections } from '../../api/menuSections'
import usePermission from '../../hooks/usePermission'
import usePageActions from '../../hooks/usePageActions'

// Renders one level of the menu tree and recurses into `children` for
// however many levels deep the data goes (sub-menus can nest sub-menus).
function MenuTreeLevel({ items, depth, sectionUuid, collapsed, toggleCollapsed, canCreate, canEdit, canDelete, onAdd, onEdit, onDelete, onMove }) {
  return (
    <ul className="divide-y divide-surface-border">
      {items.map((m, i) => {
        const hasChildren = (m.children?.length ?? 0) > 0
        const isCollapsed = collapsed.has(m.uuid)
        return (
          <li key={m.uuid}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ paddingLeft: 16 + depth * 20 }}>
              <div className="flex items-center gap-2">
                {hasChildren ? (
                  <button onClick={() => toggleCollapsed(m.uuid)} className="rounded p-1 hover:bg-surface-hover" title={isCollapsed ? 'Expand' : 'Collapse'}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                ) : (
                  <span className="inline-block w-6" />
                )}
                <span className="font-medium text-text-primary">{m.name}</span>
                {m.path && <span className="text-sm text-text-secondary">{m.path}</span>}
                <Badge variant={m.is_active ? 'success' : 'neutral'}>{m.is_active ? 'active' : 'inactive'}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onMove(items, i, -1)} disabled={i === 0} className="rounded p-1.5 hover:bg-surface-hover disabled:opacity-30">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => onMove(items, i, 1)} disabled={i === items.length - 1} className="rounded p-1.5 hover:bg-surface-hover disabled:opacity-30">
                  <ArrowDown size={14} />
                </button>
                {canCreate('menus') && (
                  <button onClick={() => onAdd(m, sectionUuid)} className="rounded p-1.5 hover:bg-surface-hover" title="Add sub-menu">
                    <Plus size={14} />
                  </button>
                )}
                {canEdit('menus') && (
                  <button onClick={() => onEdit(m)} className="rounded p-1.5 hover:bg-surface-hover">
                    <Pencil size={14} />
                  </button>
                )}
                {canDelete('menus') && (
                  <button onClick={() => onDelete(m)} className="rounded p-1.5 text-danger hover:bg-danger/10">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {hasChildren && !isCollapsed && (
              <MenuTreeLevel
                items={m.children}
                depth={depth + 1}
                sectionUuid={sectionUuid}
                collapsed={collapsed}
                toggleCollapsed={toggleCollapsed}
                canCreate={canCreate}
                canEdit={canEdit}
                canDelete={canDelete}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                onMove={onMove}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Menus() {
  const { canCreate, canEdit, canDelete } = usePermission()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [parentContext, setParentContext] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())

  // GET /menus returns sections with a nested `menus` array, each item
  // recursively carrying its own `children` — used by the sidebar tree too.
  // Query key must differ from Sidebar's ['menus', 'tree'] (which filters
  // is_active=true) — otherwise React Query treats them as the same cache
  // entry and this page silently inherits the sidebar's active-only result.
  const { data, isLoading } = useQuery({ queryKey: ['menus', 'tree', 'all'], queryFn: () => getMenus({ limit: 200 }) })
  const { data: sectionsData } = useQuery({ queryKey: ['menu-sections'], queryFn: () => getMenuSections({ limit: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? updateMenu(editing.uuid, payload) : createMenu(payload)),
    onSuccess: () => {
      toast.success(editing ? 'Menu updated' : 'Menu created')
      queryClient.invalidateQueries({ queryKey: ['menus'] })
      setFormOpen(false)
      setEditing(null)
      setParentContext(null)
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
    mutationFn: (payload) => reorderMenus(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menus'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Reorder failed'),
  })

  // Each item already carries its own `menus`/`children` array, sorted by the backend.
  const grouped = data?.data || []
  const sections = sectionsData?.data || []

  const move = (siblings, index, dir) => {
    const swapIndex = index + dir
    if (swapIndex < 0 || swapIndex >= siblings.length) return
    const a = siblings[index]
    const b = siblings[swapIndex]
    reorderMutation.mutate([
      { uuid: a.uuid, order: b.order },
      { uuid: b.uuid, order: a.order },
    ])
  }

  const toggleCollapsed = (uuid) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(uuid)) next.delete(uuid)
      else next.add(uuid)
      return next
    })
  }

  const openAdd = (parent, sectionUuid) => {
    setEditing(null)
    setParentContext(parent ? { parent_uuid: parent.uuid, menu_section_uuid: sectionUuid } : null)
    setFormOpen(true)
  }
  const openEdit = (menu) => {
    setEditing(menu)
    setParentContext(null)
    setFormOpen(true)
  }

  usePageActions(
    useMemo(
      () => (
        <Menubar>
          <MenubarLabel>Menus</MenubarLabel>
          {canCreate('menus') && (
            <>
              <MenubarSeparator />
              <MenubarAction label="Add New" icon={Plus} onClick={() => openAdd(null, null)} />
            </>
          )}
        </Menubar>
      ),
      [canCreate],
    ),
  )

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : grouped.length === 0 ? (
        <EmptyState title="No menu sections found" />
      ) : (
        <div className="space-y-4">
          {grouped.map((sec) => (
            <div key={sec.uuid} className="rounded-lg border border-surface-border bg-surface-card">
              <div className="border-b border-surface-border px-4 py-3 font-semibold text-text-primary">{sec.name}</div>
              {sec.menus.length === 0 ? (
                <div className="p-4 text-sm text-text-secondary">No menus in this section</div>
              ) : (
                <MenuTreeLevel
                  items={sec.menus}
                  depth={0}
                  sectionUuid={sec.uuid}
                  collapsed={collapsed}
                  toggleCollapsed={toggleCollapsed}
                  canCreate={canCreate}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onAdd={openAdd}
                  onEdit={openEdit}
                  onDelete={setDeleting}
                  onMove={move}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <MenuFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setParentContext(null)
        }}
        onSubmit={(values) => saveMutation.mutate(values)}
        initialData={editing || parentContext}
        sections={sections}
        menuTree={grouped}
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

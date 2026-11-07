import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, FolderPlus, Pencil, Trash2, GripVertical } from 'lucide-react'
import MenuIcon from '../../components/ui/MenuIcon'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { Menubar, MenubarAction, MenubarLabel, MenubarSeparator } from '../../components/ui/Menubar'
import MenuFormModal from './MenuFormModal'
import MenuSectionFormModal from './MenuSectionFormModal'
import {
  getMenus,
  createMenu,
  updateMenu,
  deleteMenu,
  reorderMenus,
  getMenuSections,
  createMenuSection,
  updateMenuSection,
  deleteMenuSection,
  reorderMenuSections,
} from '../../api/menus'
import usePermission from '../../hooks/usePermission'
import PageToolbar from '../../components/ui/PageToolbar'
import usePageActions from '../../hooks/usePageActions'

function MenuList() {
  const { canCreate, canEdit, canDelete } = usePermission()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [dragSection, setDragSection] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [sectionFormOpen, setSectionFormOpen] = useState(false)
  const [editingSection, setEditingSection] = useState(null)
  const [deletingSection, setDeletingSection] = useState(null)
  const [dragSecIndex, setDragSecIndex] = useState(null)
  const [overSecIndex, setOverSecIndex] = useState(null)

  // GET /menus returns sections with a nested `menus` array already grouped
  // server-side (used by the sidebar tree too) — no separate flat menu list
  // endpoint exists, so this page renders that tree directly. Query key must
  // differ from Sidebar's ['menus', 'tree'] (which filters is_active=true) —
  // otherwise React Query treats them as the same cache entry and this page
  // silently inherits the sidebar's active-only result, hiding inactive menus.
  const { data, isLoading } = useQuery({ queryKey: ['menus', 'tree', 'all'], queryFn: () => getMenus({ limit: 200 }) })
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
    mutationFn: (payload) => reorderMenus(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menus'] }),
    onError: (err) => toast.error(err.response?.data?.message || 'Reorder failed'),
  })

  const refreshMenus = () => {
    queryClient.invalidateQueries({ queryKey: ['menus'] })
    queryClient.invalidateQueries({ queryKey: ['menu-sections'] })
  }

  const saveSectionMutation = useMutation({
    mutationFn: (payload) =>
      editingSection ? updateMenuSection(editingSection.uuid, payload) : createMenuSection(payload),
    onSuccess: () => {
      toast.success(editingSection ? 'Section updated' : 'Section created')
      refreshMenus()
      setSectionFormOpen(false)
      setEditingSection(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const deleteSectionMutation = useMutation({
    mutationFn: (uuid) => deleteMenuSection(uuid),
    onSuccess: () => {
      toast.success('Section deleted')
      refreshMenus()
      setDeletingSection(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const reorderSectionMutation = useMutation({
    mutationFn: (payload) => reorderMenuSections(payload),
    onSuccess: refreshMenus,
    onError: (err) => toast.error(err.response?.data?.message || 'Reorder failed'),
  })

  // Each item already carries its own `menus` array, sorted by the backend.
  const grouped = data?.data || []
  const sections = sectionsData?.data || []

  const dropReorder = (sectionMenus, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const orders = sectionMenus.map((m) => m.order)
    const items = [...sectionMenus]
    const [moved] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, moved)
    reorderMutation.mutate(items.map((m, i) => ({ uuid: m.uuid, order: orders[i] })))
  }

  const dropSectionReorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const orders = grouped.map((sec) => sec.order)
    const items = [...grouped]
    const [moved] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, moved)
    reorderSectionMutation.mutate(items.map((sec, i) => ({ uuid: sec.uuid, order: orders[i] })))
  }

  const resetDrag = () => {
    setDragSection(null)
    setDragIndex(null)
    setOverIndex(null)
    setDragSecIndex(null)
    setOverSecIndex(null)
  }

  usePageActions(
    useMemo(
      () => (
        <Menubar>
          <MenubarLabel>Menus</MenubarLabel>
          {canCreate('menus') && (
            <>
              <MenubarSeparator />
              <MenubarAction
                label="Add Menu"
                icon={Plus}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              />
              <MenubarAction
                label="Add Section"
                icon={FolderPlus}
                onClick={() => {
                  setEditingSection(null)
                  setSectionFormOpen(true)
                }}
              />
            </>
          )}
        </Menubar>
      ),
      [canCreate],
    ),
  )

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-surface-border bg-surface-card shadow-card">
        <PageToolbar />
      </div>
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState title="No menu sections found" />
      ) : (
        <div className="space-y-4">
          {grouped.map((sec, si) => (
            <div
              key={sec.uuid}
              onDragOver={(e) => {
                if (dragSecIndex === null) return
                e.preventDefault()
                setOverSecIndex(si)
              }}
              onDrop={(e) => {
                if (dragSecIndex === null) return
                e.preventDefault()
                dropSectionReorder(dragSecIndex, si)
                resetDrag()
              }}
              className={`overflow-hidden rounded-xl border bg-surface-card shadow-card transition-opacity ${
                dragSecIndex === si ? 'opacity-40' : ''
              } ${overSecIndex === si && dragSecIndex !== si ? 'border-primary ring-2 ring-primary/30' : 'border-surface-border'}`}
            >
              <div
                draggable={canEdit('menus')}
                onDragStart={() => setDragSecIndex(si)}
                onDragEnd={resetDrag}
                className="flex items-center gap-3 border-b border-surface-border bg-primary/[0.06] px-4 py-3"
              >
                {canEdit('menus') && (
                  <GripVertical size={14} className="shrink-0 cursor-grab text-text-tertiary active:cursor-grabbing" />
                )}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                  <MenuIcon name={sec.icon} size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text-primary">{sec.name}</div>
                  <div className="text-xs text-text-tertiary">
                    {sec.menus.length} {sec.menus.length === 1 ? 'menu' : 'menus'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canEdit('menus') && (
                    <button
                      onClick={() => {
                        setEditingSection(sec)
                        setSectionFormOpen(true)
                      }}
                      className="rounded-md border border-surface-border bg-surface-card p-1.5 hover:bg-surface-hover"
                      title="Edit section"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {canDelete('menus') && (
                    <button
                      onClick={() => setDeletingSection(sec)}
                      className="rounded-md border border-danger/30 bg-surface-card p-1.5 text-danger hover:bg-danger/10"
                      title="Delete section"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {sec.menus.length === 0 ? (
                <div className="p-6 text-center text-sm text-text-tertiary">No menus in this section</div>
              ) : (
                <ul className="divide-y divide-surface-border">
                  {sec.menus.map((m, i) => {
                    const draggable = canEdit('menus')
                    const isDragging = dragSection === sec.uuid && dragIndex === i
                    const isOver = dragSection === sec.uuid && overIndex === i && dragIndex !== i
                    return (
                      <li
                        key={m.uuid}
                        draggable={draggable}
                        onDragStart={() => {
                          setDragSection(sec.uuid)
                          setDragIndex(i)
                        }}
                        onDragOver={(e) => {
                          if (dragSection !== sec.uuid) return
                          e.preventDefault()
                          setOverIndex(i)
                        }}
                        onDrop={(e) => {
                          if (dragSection === null) return
                          e.preventDefault()
                          if (dragSection === sec.uuid && dragIndex !== null) {
                            dropReorder(sec.menus, dragIndex, i)
                          }
                          resetDrag()
                        }}
                        onDragEnd={resetDrag}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/50 ${isDragging ? 'opacity-40' : ''} ${isOver ? 'border-t-2 border-primary' : ''}`}
                      >
                        {draggable && (
                          <GripVertical size={14} className="shrink-0 cursor-grab text-text-tertiary active:cursor-grabbing" />
                        )}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                          <MenuIcon name={m.icon} size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-text-primary">{m.name}</span>
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.is_active ? 'bg-success' : 'bg-text-tertiary'}`}
                              title={m.is_active ? 'Active' : 'Inactive'}
                            />
                          </div>
                          <div className="truncate font-mono text-xs text-text-tertiary">{m.path}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {canEdit('menus') && (
                            <button
                              onClick={() => {
                                setEditing(m)
                                setFormOpen(true)
                              }}
                              className="rounded-md border border-surface-border p-1.5 hover:bg-surface-hover"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete('menus') && (
                            <button
                              onClick={() => setDeleting(m)}
                              className="rounded-md border border-danger/30 p-1.5 text-danger hover:bg-danger/10"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <MenuSectionFormModal
        open={sectionFormOpen}
        onClose={() => setSectionFormOpen(false)}
        onSubmit={(values) => saveSectionMutation.mutate(values)}
        initialData={editingSection}
        loading={saveSectionMutation.isPending}
      />

      <ConfirmDialog
        open={!!deletingSection}
        onClose={() => setDeletingSection(null)}
        onConfirm={() => deleteSectionMutation.mutate(deletingSection.uuid)}
        loading={deleteSectionMutation.isPending}
        message={`Delete section "${deletingSection?.name}"? This cannot be undone.`}
      />

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

export default MenuList

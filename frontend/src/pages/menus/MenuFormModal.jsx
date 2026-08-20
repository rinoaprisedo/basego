import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import { menuSchema } from '../../utils/validation'

// Depth-first flatten of a section's menu tree into {uuid, name, depth}[] for
// the parent dropdown, so nesting reads as indentation ("— — Sub item").
function flattenMenuTree(items, depth = 0, excluded = new Set()) {
  let result = []
  for (const item of items || []) {
    if (excluded.has(item.uuid)) continue
    result.push({ uuid: item.uuid, name: item.name, depth })
    result = result.concat(flattenMenuTree(item.children, depth + 1, excluded))
  }
  return result
}

// A node can't become its own parent or the parent of one of its own
// descendants (that would create a cycle) — collect that whole subtree so
// the dropdown can exclude it.
function collectSubtreeUuids(node) {
  const ids = new Set([node.uuid])
  for (const child of node.children || []) {
    for (const id of collectSubtreeUuids(child)) ids.add(id)
  }
  return ids
}

function findMenuNode(items, uuid) {
  for (const item of items || []) {
    if (item.uuid === uuid) return item
    const found = findMenuNode(item.children, uuid)
    if (found) return found
  }
  return null
}

function MenuFormModal({ open, onClose, onSubmit, initialData, sections = [], menuTree = [], loading }) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(menuSchema) })

  const selectedSectionUuid = watch('menu_section_uuid')

  useEffect(() => {
    if (open) {
      reset({
        name: initialData?.name || '',
        icon: initialData?.icon || '',
        path: initialData?.path || '',
        menu_section_uuid: initialData?.menu_section_uuid || '',
        parent_uuid: initialData?.parent_uuid || '',
        order: initialData?.order ?? 0,
        is_active: initialData?.is_active ?? true,
      })
    }
  }, [open, initialData, reset])

  const parentOptions = useMemo(() => {
    const section = sections.find((s) => s.uuid === selectedSectionUuid)
    const sectionTree = menuTree.find((s) => s.uuid === selectedSectionUuid)
    if (!section || !sectionTree) return []

    const excluded = initialData?.uuid
      ? collectSubtreeUuids(findMenuNode(sectionTree.menus, initialData.uuid) || { uuid: initialData.uuid, children: [] })
      : new Set()

    return flattenMenuTree(sectionTree.menus, 0, excluded)
  }, [sections, menuTree, selectedSectionUuid, initialData])

  return (
    <Modal open={open} onClose={onClose} title={initialData?.uuid ? 'Edit Menu' : 'Add Menu'}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Input label="Icon (lucide name)" placeholder="e.g. Users" error={errors.icon?.message} {...register('icon')} />
        <Input label="Path" placeholder="/users (leave blank for a group/parent item)" error={errors.path?.message} {...register('path')} />
        <Select label="Section" error={errors.menu_section_uuid?.message} {...register('menu_section_uuid')}>
          <option value="">Select section</option>
          {sections.map((s) => (
            <option key={s.uuid} value={s.uuid}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label="Parent menu (optional)" error={errors.parent_uuid?.message} {...register('parent_uuid')}>
          <option value="">No parent (top-level)</option>
          {parentOptions.map((m) => (
            <option key={m.uuid} value={m.uuid}>
              {'— '.repeat(m.depth)}
              {m.name}
            </option>
          ))}
        </Select>
        <Input label="Order" type="number" error={errors.order?.message} {...register('order', { valueAsNumber: true })} />
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" className="h-4 w-4 accent-primary" {...register('is_active')} />
          Active
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default MenuFormModal

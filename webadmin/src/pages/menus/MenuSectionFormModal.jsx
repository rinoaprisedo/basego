import { FolderTree } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Modal from '../../components/ui/Modal'
import IconPicker from '../../components/ui/IconPicker'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { menuSectionSchema } from '../../utils/validation'

function MenuSectionFormModal({ open, onClose, onSubmit, initialData, loading }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(menuSectionSchema) })

  useEffect(() => {
    if (open) {
      reset(
        initialData
          ? { name: initialData.name, icon: initialData.icon || '', order: initialData.order ?? 0 }
          : { name: '', icon: '', order: 0 },
      )
    }
  }, [open, initialData, reset])

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Edit Section' : 'Add Section'}
      description="Group menus together in the sidebar."
      icon={FolderTree}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <input type="hidden" {...register('icon')} />
        <IconPicker
          value={watch('icon')}
          onChange={(v) => setValue('icon', v, { shouldDirty: true })}
          error={errors.icon?.message}
        />
        <Input label="Order" type="number" error={errors.order?.message} {...register('order', { valueAsNumber: true })} />
        <div className="modal-footer -mx-[26px] mt-2 flex justify-end gap-2 border-t border-surface-border bg-surface-hover/40 px-[26px] py-4">
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

export default MenuSectionFormModal

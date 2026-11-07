import { ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { roleSchema } from '../../utils/validation'

function RoleFormModal({ open, onClose, onSubmit, initialData, loading }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(roleSchema) })

  useEffect(() => {
    if (open) {
      reset(initialData ? { name: initialData.name, description: initialData.description || '' } : { name: '', description: '' })
    }
  }, [open, initialData, reset])

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Edit Role' : 'Add Role'}
      description={initialData ? 'Update the role name and description.' : 'Define a role, then set its permissions.'}
      icon={ShieldCheck}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Input label="Description" error={errors.description?.message} {...register('description')} />
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

export default RoleFormModal

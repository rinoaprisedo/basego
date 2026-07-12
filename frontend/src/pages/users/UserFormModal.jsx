import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import { userSchema } from '../../utils/validation'

function UserFormModal({ open, onClose, onSubmit, initialData, roles = [], loading }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(userSchema) })

  useEffect(() => {
    if (open) {
      reset(
        initialData
          ? {
              name: initialData.name,
              email: initialData.email,
              status: initialData.status || 'active',
              password: '',
              role_id: initialData.roles?.[0]?.id || '',
            }
          : { name: '', email: '', password: '', status: 'active', role_id: '' },
      )
    }
  }, [open, initialData, reset])

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Edit User' : 'Add User'}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Input
          label={initialData ? 'Password (leave blank to keep current)' : 'Password'}
          type="password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Select label="Status" error={errors.status?.message} {...register('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Select label="Role" error={errors.role_id?.message} {...register('role_id')}>
          <option value="">Select role</option>
          {roles.map((r) => (
            <option key={r.id || r.uuid} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
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

export default UserFormModal

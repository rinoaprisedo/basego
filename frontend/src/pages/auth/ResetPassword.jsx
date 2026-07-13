import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useMutation } from '@tanstack/react-query'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { resetPassword } from '../../api/auth'
import { resetPasswordSchema } from '../../utils/validation'

function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(resetPasswordSchema) })

  const mutation = useMutation({
    mutationFn: (data) => resetPassword({ token, password: data.password }),
    onSuccess: () => {
      toast.success('Password reset successfully')
      navigate('/login')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Reset failed, link may be expired'),
  })

  return (
    <div>
      <h2 className="mb-4 text-center text-lg font-semibold text-text-primary">
        Reset password
      </h2>
      {!token && <p className="mb-3 text-center text-sm text-danger">Missing or invalid token.</p>}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <Input label="New password" type="password" error={errors.password?.message} {...register('password')} />
        <Input
          label="Confirm password"
          type="password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" disabled={mutation.isPending || !token} className="w-full">
          {mutation.isPending ? 'Resetting...' : 'Reset password'}
        </Button>
      </form>
    </div>
  )
}

export default ResetPassword

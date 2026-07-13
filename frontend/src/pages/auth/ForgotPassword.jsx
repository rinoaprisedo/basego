import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useMutation } from '@tanstack/react-query'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { forgotPassword } from '../../api/auth'
import { forgotPasswordSchema } from '../../utils/validation'

function ForgotPassword() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema) })

  const mutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: () => toast.success('Reset link sent, check your email'),
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send reset link'),
  })

  return (
    <div>
      <h2 className="mb-4 text-center text-lg font-semibold text-text-primary">
        Forgot password
      </h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <Input label="Email" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? 'Sending...' : 'Send reset link'}
        </Button>
        <Link to="/login" className="text-center text-sm text-primary hover:underline">
          Back to login
        </Link>
      </form>
    </div>
  )
}

export default ForgotPassword

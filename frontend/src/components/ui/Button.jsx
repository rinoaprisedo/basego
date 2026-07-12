import { cn } from '../../utils/cn'

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-slate-100 text-text-primary hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100',
  danger: 'bg-danger text-white hover:bg-red-600',
  ghost: 'bg-transparent text-text-primary hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700',
}

function Button({ variant = 'primary', className, children, disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button

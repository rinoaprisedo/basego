import { cn } from '../../utils/cn'

const variants = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-slate-100 text-text-secondary dark:bg-slate-700 dark:text-slate-300',
}

function Badge({ variant = 'neutral', children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export default Badge

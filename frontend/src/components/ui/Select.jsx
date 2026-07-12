import { forwardRef } from 'react'
import { cn } from '../../utils/cn'

const Select = forwardRef(function Select({ label, error, className, children, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-text-primary dark:text-slate-200">{label}</label>}
      <select
        ref={ref}
        className={cn(
          'rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100',
          error && 'border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
})

export default Select

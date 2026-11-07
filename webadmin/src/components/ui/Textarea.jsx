import { forwardRef } from 'react'
import { cn } from '../../utils/cn'

const Textarea = forwardRef(function Textarea({ label, hint, className, wrapperClassName, rows = 3, ...props }, ref) {
  return (
    <div className={cn('flex flex-col gap-1', wrapperClassName)}>
      {label && <label className="text-xs font-medium uppercase tracking-[.05em] text-text-secondary">{label}</label>}
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'grow rounded-md border-[1.5px] border-surface-border bg-field px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-150 focus:border-primary',
          className,
        )}
        {...props}
      />
      {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
    </div>
  )
})

export default Textarea

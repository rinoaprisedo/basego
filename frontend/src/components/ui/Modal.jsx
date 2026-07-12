import { X } from 'lucide-react'

function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`w-full ${sizes[size]} max-h-[90vh] overflow-y-auto rounded-lg bg-surface-card shadow-xl dark:bg-slate-800`}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-text-primary dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-secondary hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export default Modal

import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

function Modal({ open, onClose, title, description, icon: Icon, children, size = 'md' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  // Rendered via portal into document.body so the fixed-position overlay
  // always covers the true viewport, regardless of any ancestor establishing
  // its own stacking/containing context (transform, filter, etc.).
  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${sizes[size]} modal-panel max-h-[90vh] overflow-y-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-surface-card`}
      >
        <div className="modal-hero flex items-center gap-4 px-[26px] py-5">
          {Icon && (
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white">
              <Icon size={22} />
            </div>
          )}
          <div className="relative min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-tight text-white">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-white/80">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="relative rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-[26px] py-6 has-[.modal-footer]:pb-0">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default Modal

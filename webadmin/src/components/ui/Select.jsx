import { Children, Fragment, forwardRef, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../utils/cn'

// Flatten <option> children (incl. fragments/arrays) into { value, label, disabled }.
function parseOptions(children) {
  const out = []
  const walk = (nodes) =>
    Children.forEach(nodes, (node) => {
      if (!isValidElement(node)) return
      if (node.type === Fragment) return walk(node.props.children)
      if (node.type !== 'option') return
      const label = Children.toArray(node.props.children).join('')
      out.push({ value: String(node.props.value ?? label), label, disabled: !!node.props.disabled })
    })
  walk(children)
  return out
}

// Searchable dropdown (select2-style). Keeps the native <select> API: children
// are <option>s, onChange receives an event with target.value/name, and a
// hidden real <select> carries the value so react-hook-form's register() works.
const Select = forwardRef(function Select(
  { label, error, className, compact, children, value, disabled, 'aria-label': ariaLabel, ...props },
  ref,
) {
  const nativeRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [pos, setPos] = useState(null)
  const [domValue, setDomValue] = useState('')

  const setRefs = (el) => {
    nativeRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const options = useMemo(() => parseOptions(children), [children])

  // Uncontrolled (react-hook-form) values are written straight to the DOM node,
  // so mirror them into state after each render.
  useEffect(() => {
    if (value === undefined && nativeRef.current && nativeRef.current.value !== domValue) {
      setDomValue(nativeRef.current.value)
    }
  })

  const current = value !== undefined ? String(value ?? '') : domValue
  const selected = options.find((o) => o.value === current)
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const openMenu = () => {
    if (disabled) return
    setCursor(Math.max(0, options.findIndex((o) => o.value === current)))
    setOpen(true)
  }

  const choose = (opt) => {
    if (opt.disabled) return
    const el = nativeRef.current
    if (el && el.value !== opt.value) {
      el.value = opt.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      setDomValue(opt.value)
    }
    close()
    triggerRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = triggerRef.current.getBoundingClientRect()
      const below = window.innerHeight - r.bottom
      const up = below < 260 && r.top > below
      setPos({
        left: r.left,
        width: compact ? r.width : Math.max(r.width, 150),
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        maxH: Math.min(300, (up ? r.top : below) - 16),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || e.target.closest?.('[data-select-portal]')) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open, query])

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[cursor]) choose(filtered[cursor])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      triggerRef.current?.focus()
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium uppercase tracking-[.05em] text-text-secondary">{label}</label>
      )}
      <div className="relative">
        <select
          ref={setRefs}
          value={value}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          {...props}
        >
          {children}
        </select>
        <button
          type="button"
          ref={triggerRef}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault()
              openMenu()
            }
          }}
          className={cn(
            'flex h-[42px] w-full items-center rounded-lg border-[1.5px] border-surface-border bg-field px-3 pr-9 text-left text-sm text-text-primary outline-none transition-colors duration-150 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60',
            open && 'border-primary ring-4 ring-primary/10',
            error && 'border-danger',
            className,
          )}
        >
          <span className={cn('truncate', (!selected || current === '') && 'text-text-tertiary')}>
            {selected ? selected.label : ''}
          </span>
        </button>
        <ChevronDown
          size={16}
          strokeWidth={1.7}
          className={cn(
            'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary transition-transform',
            open && 'rotate-180',
          )}
        />
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      {open &&
        pos &&
        createPortal(
          <div
            data-select-portal
            data-menubar-portal
            className="fixed z-[70] overflow-hidden rounded-lg border border-surface-border bg-surface-card shadow-md"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          >
            {!compact && (
            <div className="flex items-center gap-2 border-b border-surface-border px-3">
              <Search size={14} className="shrink-0 text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCursor(0)
                }}
                onKeyDown={onKeyDown}
                placeholder="Search..."
                className="h-9 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
            )}
            <div ref={listRef} role="listbox" className="overflow-y-auto p-1" style={{ maxHeight: Math.max(120, pos.maxH - (compact ? 0 : 38)) }}>
              {filtered.length === 0 && <div className="px-3 py-2 text-sm text-text-tertiary">No results</div>}
              {filtered.map((o, i) => (
                <button
                  type="button"
                  key={o.value}
                  role="option"
                  aria-selected={o.value === current}
                  data-active={i === cursor}
                  disabled={o.disabled}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md text-left text-text-primary disabled:opacity-40',
                    compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
                    i === cursor && 'bg-surface-hover',
                    o.value === current && 'font-medium text-primary',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === current && <Check size={14} className="shrink-0" />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
})

export default Select

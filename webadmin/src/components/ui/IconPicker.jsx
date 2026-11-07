import { useMemo, useState } from 'react'
import { icons } from 'lucide-react'
import { Search, X } from 'lucide-react'
import { cn } from '../../utils/cn'

const ALL = Object.keys(icons)
const PAGE = 96

// Visual picker for a lucide icon name: search box + grid of icon tiles.
function IconPicker({ label = 'Icon', value, onChange, error }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? ALL.filter((n) => n.toLowerCase().includes(q)) : ALL
  }, [query])

  const Selected = value ? icons[value] : null

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-[.05em] text-text-secondary">{label}</label>
      <div className={cn('rounded-lg border-[1.5px] border-surface-border bg-field', error && 'border-danger')}>
        <div className="flex items-center gap-3 border-b border-surface-border px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {Selected ? <Selected size={18} /> : <Search size={16} className="text-text-tertiary" />}
          </div>
          <div className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {value || <span className="text-text-tertiary">No icon selected</span>}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
              aria-label="Clear icon"
              title="Clear icon"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="relative border-b border-surface-border">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            placeholder="Search icons..."
            className="h-9 w-full bg-transparent pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
        <div
          className="max-h-[188px] overflow-y-auto p-2"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setLimit((l) => l + PAGE)
          }}
        >
          {matches.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-tertiary">No icons found</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5">
              {matches.slice(0, limit).map((name) => {
                const Icon = icons[name]
                const active = name === value
                return (
                  <button
                    type="button"
                    key={name}
                    title={name}
                    onClick={() => onChange(name)}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-lg border text-text-secondary transition-colors',
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-surface-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary',
                    )}
                  >
                    <Icon size={18} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}

export default IconPicker

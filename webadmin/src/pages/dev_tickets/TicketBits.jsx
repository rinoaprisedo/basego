import { Fragment } from 'react'
import { Monitor, Server, Smartphone, Globe, LayoutDashboard } from 'lucide-react'
import { cn } from '../../utils/cn'
import { CATEGORY_STYLE, DEV_STATUS_LABEL, DEV_STATUS_STYLE, PRIORITY_STYLE, QC_STYLE, splitPlatforms } from './ticketUtils'

const pill = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'

export function DevStatusBadge({ status }) {
  return <span className={cn(pill, DEV_STATUS_STYLE[status])}>{DEV_STATUS_LABEL[status] || status}</span>
}

export function PriorityBadge({ priority }) {
  return <span className={cn(pill, PRIORITY_STYLE[priority])}>{priority}</span>
}

export function CategoryBadge({ category }) {
  return <span className={cn(pill, 'border bg-white', CATEGORY_STYLE[category])}>{category}</span>
}

export function QCStatus({ status }) {
  return <span className={cn('text-xs font-semibold', QC_STYLE[status])}>{status}</span>
}

const PLATFORM_ICON = { Android: Smartphone, iOS: Smartphone, Website: Globe, 'Web Admin': LayoutDashboard, Backend: Server }

export function Platform({ platform }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
      {splitPlatforms(platform).map((p) => {
        const Icon = PLATFORM_ICON[p] || Monitor
        return (
          <span key={p} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon size={13} className="text-text-tertiary" />
            {p}
          </span>
        )
      })}
    </span>
  )
}

const urlRe = /(https?:\/\/[^\s]+)/g

// Plain text with bare URLs turned into links (QC pastes prnt.sc links).
export function Linkified({ text, className }) {
  if (!text) return null
  const parts = text.split(urlRe)
  return (
    <p className={cn('whitespace-pre-line break-words', className)}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          >
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  )
}

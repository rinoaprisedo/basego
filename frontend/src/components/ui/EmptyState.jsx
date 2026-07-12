import { Inbox } from 'lucide-react'

function EmptyState({ icon: Icon = Inbox, title = 'No data found', message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon size={40} className="text-text-secondary/50" />
      <p className="text-sm font-medium text-text-primary dark:text-slate-200">{title}</p>
      {message && <p className="text-xs text-text-secondary">{message}</p>}
    </div>
  )
}

export default EmptyState

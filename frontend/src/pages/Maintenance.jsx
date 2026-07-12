import { Wrench } from 'lucide-react'

function Maintenance() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-bg text-center dark:bg-slate-900">
      <Wrench size={48} className="text-warning" />
      <h1 className="text-3xl font-bold text-text-primary dark:text-slate-100">Under maintenance</h1>
      <p className="text-text-secondary">We'll be back shortly. Thanks for your patience.</p>
    </div>
  )
}

export default Maintenance

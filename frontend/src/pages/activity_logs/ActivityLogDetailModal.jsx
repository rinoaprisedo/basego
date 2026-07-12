import Modal from '../../components/ui/Modal'

function JsonBlock({ value }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-text-primary dark:bg-slate-900 dark:text-slate-200">
      {value ? JSON.stringify(value, null, 2) : 'null'}
    </pre>
  )
}

function ActivityLogDetailModal({ open, onClose, log }) {
  return (
    <Modal open={open} onClose={onClose} title="Activity Log Detail" size="xl">
      {log && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-text-secondary">Action</p>
              <p className="font-medium capitalize text-text-primary dark:text-slate-100">{log.action}</p>
            </div>
            <div>
              <p className="text-text-secondary">Module</p>
              <p className="font-medium text-text-primary dark:text-slate-100">{log.module}</p>
            </div>
            <div>
              <p className="text-text-secondary">Record ID</p>
              <p className="font-medium text-text-primary dark:text-slate-100">{log.record_id || '-'}</p>
            </div>
            <div>
              <p className="text-text-secondary">IP Address</p>
              <p className="font-medium text-text-primary dark:text-slate-100">{log.ip_address}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium text-text-secondary">Old Value</p>
              <JsonBlock value={log.old_value} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-text-secondary">New Value</p>
              <JsonBlock value={log.new_value} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default ActivityLogDetailModal

import { ChevronUp, ChevronDown, Search } from 'lucide-react'
import { TableSkeleton } from './Skeleton'
import EmptyState from './EmptyState'
import Input from './Input'

// columns: [{ key, label, sortable, render }]
function Table({
  columns,
  data = [],
  loading,
  search,
  onSearchChange,
  sortBy,
  sortDir,
  onSortChange,
  page = 1,
  limit = 10,
  total = 0,
  onPageChange,
  onLimitChange,
  onRowClick,
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const handleSort = (col) => {
    if (!col.sortable || !onSortChange) return
    if (sortBy === col.key) {
      onSortChange(col.key, sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      onSortChange(col.key, 'asc')
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card dark:bg-slate-800 dark:border-slate-700">
      {onSearchChange && (
        <div className="border-b border-surface-border p-4 dark:border-slate-700">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="pl-9"
            />
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : data.length === 0 ? (
        <EmptyState title="No records found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-text-secondary dark:border-slate-700">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col)}
                    className={`px-4 py-3 font-medium ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortBy === col.key && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={row.uuid || row.id || i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-surface-border last:border-0 dark:border-slate-700 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-text-primary dark:text-slate-200">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onPageChange && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border p-4 text-sm dark:border-slate-700">
          <div className="flex items-center gap-2 text-text-secondary">
            <span>Rows per page</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange?.(Number(e.target.value))}
              className="rounded border border-surface-border bg-white px-2 py-1 dark:bg-slate-800 dark:border-slate-600"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded border border-surface-border px-3 py-1 disabled:opacity-40 dark:border-slate-600"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded border border-surface-border px-3 py-1 disabled:opacity-40 dark:border-slate-600"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Table

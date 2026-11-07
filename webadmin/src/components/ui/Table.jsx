import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { TableSkeleton } from './Skeleton'
import EmptyState from './EmptyState'
import PageToolbar from './PageToolbar'
import Select from './Select'

// Builds a compact page list like [1, '…', 4, 5, 6, '…', 12] around the
// current page, always keeping the first/last page visible.
function pageRange(current, total) {
  const delta = 1
  const range = []
  const withDots = []
  let last

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i)
    }
  }

  for (const i of range) {
    if (last !== undefined) {
      if (i - last === 2) withDots.push(last + 1)
      else if (i - last > 2) withDots.push('...')
    }
    withDots.push(i)
    last = i
  }

  return withDots
}

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
  // Standard sizes plus whatever is active (e.g. a custom default from Settings).
  const pageSizeOptions = [...new Set([10, 20, 25, 50, 100, limit])].sort((a, b) => a - b)
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
    <div className="rounded-lg border border-surface-border bg-surface-card shadow-card">
      <PageToolbar search={search} onSearchChange={onSearchChange} />

      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : data.length === 0 ? (
        <EmptyState title="No records found" />
      ) : (
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <table className="w-full min-w-max text-left text-[13px] md:min-w-full">
            <thead>
              <tr className="border-b border-surface-border text-text-tertiary">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col)}
                    className={`whitespace-nowrap px-5 py-[11px] text-[11px] font-semibold uppercase tracking-[.07em] ${col.sortable ? 'cursor-pointer select-none' : ''}`}
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
                  className={`border-b border-surface-border transition-colors duration-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface-hover' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="whitespace-nowrap px-5 py-[13px] text-text-primary md:whitespace-normal">
                      {col.render ? col.render(row, i) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onPageChange && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border p-4 text-[13px]">
          <div className="flex items-center gap-2 text-text-secondary">
            <span>Rows per page</span>
            <div className="w-[62px]">
              <Select
                compact
                aria-label="Rows per page"
                value={limit}
                onChange={(e) => onLimitChange?.(Number(e.target.value))}
                className="h-7 rounded-md border px-2 pr-6 text-xs"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-surface-border text-text-secondary transition-colors duration-100 hover:bg-surface-hover hover:border-surface-border-hover disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            {pageRange(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`dots-${i}`} className="flex h-[30px] w-[30px] items-center justify-center text-xs text-text-tertiary">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`h-[30px] w-[30px] rounded-[7px] border text-xs transition-colors duration-100 ${
                    p === page
                      ? 'border-primary bg-primary text-white'
                      : 'border-surface-border text-text-secondary hover:bg-surface-hover hover:border-surface-border-hover'
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-surface-border text-text-secondary transition-colors duration-100 hover:bg-surface-hover hover:border-surface-border-hover disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Table

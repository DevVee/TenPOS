import { useState } from 'react'
import { Search, Download, Shield, Loader2 } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetAuditLog } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { downloadXLSX } from '../../lib/xlsxExport'

interface AuditEntry {
  id: string
  action: string
  user: string
  details: string
  ip: string
  severity: 'info' | 'warning' | 'critical'
  timestamp: string
}

const SEV_VARIANT: Record<string, 'red' | 'yellow' | 'green' | 'gray'> = {
  critical: 'red',
  warning:  'yellow',
  info:     'green',
}

export function AuditLog() {
  const [search,   setSearch]   = useState('')
  const [severity, setSeverity] = useState('all')

  const { data, loading, error } = useApiData<{ data: AuditEntry[]; total: number }>(
    () => {
      const params: Record<string, string> = { limit: '100' }
      if (severity !== 'all') params.severity = severity
      if (search.trim()) params.q = search.trim()
      return apiGetAuditLog(params) as Promise<{ data: AuditEntry[]; total: number }>
    },
    [severity]
  )

  const entries = data?.data ?? []

  const handleExport = () => {
    downloadXLSX(
      `TenPOS-Audit-Log-${new Date().toISOString().slice(0, 10)}`,
      [{
        name: 'Audit Log',
        columns: [
          { header: 'Severity',  width: 12 },
          { header: 'Action',    width: 32 },
          { header: 'User',      width: 22 },
          { header: 'Details',   width: 44 },
          { header: 'IP Address',width: 16 },
          { header: 'Timestamp', type: 'date', width: 22 },
        ],
        rows: filtered.map((a) => [a.severity, a.action, a.user, a.details, a.ip, a.timestamp]),
      }],
      'Audit Log'
    )
  }

  const filtered = entries.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.action?.toLowerCase().includes(q) ||
      a.user?.toLowerCase().includes(q) ||
      a.details?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Immutable record of all system actions"
        actions={
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export Log</button>
        }
      />

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 flex items-center gap-2.5">
        <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <p className="text-xs text-blue-700">This log is append-only and tamper-evident. All entries are SHA-256 hashed and cannot be modified or deleted.</p>
      </div>

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-base pl-9"
            placeholder="Search actions, users, details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'info', 'warning', 'critical'].map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                severity === s ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden lg:table-cell">Details</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">IP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No audit entries found</td></tr>
                  ) : (
                    filtered.map((a) => (
                        <tr key={a.id} className="table-row">
                          <td className="px-4 py-3">
                            <Badge variant={SEV_VARIANT[a.severity] ?? 'gray'}>
                              {a.severity}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-700">{a.action}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{a.user}</td>
                          <td className="px-4 py-3 text-sm text-gray-400 hidden lg:table-cell max-w-xs truncate">{a.details}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-mono hidden md:table-cell">{a.ip}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {new Date(a.timestamp).toLocaleString('en-PH', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
              Showing {filtered.length} of {data?.total ?? 0} entries
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import React, { useState, useMemo } from 'react'
import { updateStatus, deleteReport } from '../api.js'
import { BASE } from '../api.js'

function SeverityBadge({ severity }) {
  const cls =
    severity === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
    severity === 'Medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
    'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
  return <span className={`${cls} text-xs font-semibold px-2 py-0.5 rounded-full`}>{severity || 'Unknown'}</span>
}

function StatusBadge({ status }) {
  const cls =
    status === 'Resolved' ? 'text-emerald-400' :
    status === 'In Progress' ? 'text-amber-400' : 'text-blue-400'
  return <span className={`${cls} text-xs font-medium`}>{status || 'Reported'}</span>
}

const SORT_OPTIONS = [
  { label: 'Date (Newest)', value: 'date_desc' },
  { label: 'Date (Oldest)', value: 'date_asc' },
  { label: 'Severity (High→Low)', value: 'severity_desc' },
  { label: 'Confidence (High→Low)', value: 'confidence_desc' },
]

const severityOrder = { High: 3, Medium: 2, Low: 1 }
const PAGE_SIZE = 10

export default function MaintenanceTable({ potholes, darkMode, onUpdate, onViewOnMap }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [page, setPage] = useState(1)
  const [updatingId, setUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = potholes.filter(p => {
      if (!q) return true
      return (
        (p.severity || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q) ||
        String(p.lat || '').includes(q) ||
        String(p.lng || '').includes(q)
      )
    })

    list = [...list].sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0)
      if (sortBy === 'date_asc') return new Date(a.timestamp || a.createdAt || 0) - new Date(b.timestamp || b.createdAt || 0)
      if (sortBy === 'severity_desc') return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
      if (sortBy === 'confidence_desc') return (b.confidence || 0) - (a.confidence || 0)
      return 0
    })

    return list
  }, [potholes, search, sortBy])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id)
    try {
      await updateStatus(id, newStatus)
      onUpdate()
    } catch (e) {
      console.error(e)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this pothole report permanently?')) return
    setDeletingId(id)
    try {
      await deleteReport(id)
      onUpdate()
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingId(null)
    }
  }

  const card = `${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg`
  const input = `px-3 py-2 rounded-lg text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} border focus:outline-none focus:ring-2 focus:ring-blue-500`
  const th = `px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Maintenance Table</h2>
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{filtered.length} records</span>
      </div>

      {/* Controls */}
      <div className={`${card} p-4`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by severity, status, or coordinates..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className={`${input} flex-1`}
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className={`${input} w-full sm:w-56`}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className={`${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <tr>
                <th className={th}>Image</th>
                <th className={th}>GPS Coords</th>
                <th className={th}>Severity</th>
                <th className={th}>Confidence</th>
                <th className={th}>Detections</th>
                <th className={th}>Date</th>
                <th className={th}>Status</th>
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`text-center py-12 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {search ? 'No results match your search.' : 'No pothole reports yet.'}
                  </td>
                </tr>
              ) : pageData.map((p, idx) => (
                <tr
                  key={p._id || idx}
                  className={`${darkMode ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'} transition-colors`}
                >
                  {/* Thumbnail */}
                  <td className="px-3 py-2">
                    {p.imageUrl ? (
                      <img
                        src={`${BASE}${p.imageUrl}`}
                        alt="pothole"
                        className="w-14 h-10 object-cover rounded-lg"
                        onError={e => { e.target.src = ''; e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className={`w-14 h-10 rounded-lg flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} text-lg`}>
                        🕳️
                      </div>
                    )}
                  </td>

                  {/* GPS */}
                  <td className="px-3 py-2">
                    <div className={`text-xs font-mono ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {p.lat?.toFixed(5) || '—'}
                    </div>
                    <div className={`text-xs font-mono ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {p.lng?.toFixed(5) || '—'}
                    </div>
                  </td>

                  {/* Severity */}
                  <td className="px-3 py-2">
                    <SeverityBadge severity={p.severity} />
                  </td>

                  {/* Confidence */}
                  <td className="px-3 py-2">
                    <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {p.confidence ? `${(p.confidence * 100).toFixed(1)}%` : '—'}
                    </span>
                  </td>

                  {/* Detection Count */}
                  <td className="px-3 py-2">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {p.detectionCount ?? '—'}
                    </span>
                  </td>

                  {/* Timestamp */}
                  <td className="px-3 py-2">
                    <div className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {(p.createdAt || p.timestamp) ? new Date(p.createdAt || p.timestamp).toLocaleDateString() : '—'}
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {(p.createdAt || p.timestamp) ? new Date(p.createdAt || p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </td>

                  {/* Status dropdown */}
                  <td className="px-3 py-2">
                    <select
                      value={p.status || 'Reported'}
                      disabled={updatingId === p._id}
                      onChange={e => handleStatusChange(p._id, e.target.value)}
                      className={`text-xs rounded-lg px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'
                      } ${updatingId === p._id ? 'opacity-50' : ''}`}
                    >
                      <option value="Reported">Reported</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onViewOnMap(p)}
                        className="px-2 py-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors whitespace-nowrap"
                        title="View on map"
                      >
                        🗺️ Map
                      </button>
                      <button
                        onClick={() => handleDelete(p._id)}
                        disabled={deletingId === p._id}
                        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                        title="Delete"
                      >
                        {deletingId === p._id ? '...' : '🗑️'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={`px-4 py-3 flex items-center justify-between border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Page {page} of {totalPages} ({filtered.length} records)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className={`px-2 py-1 rounded text-xs ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-40 transition-colors`}
              >
                «
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`px-3 py-1 rounded text-xs ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-40 transition-colors`}
              >
                ‹ Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const pageNum = start + i
                if (pageNum > totalPages) return null
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                      page === pageNum
                        ? 'bg-blue-600 text-white'
                        : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`px-3 py-1 rounded text-xs ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-40 transition-colors`}
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className={`px-2 py-1 rounded text-xs ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-40 transition-colors`}
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


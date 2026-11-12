import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts'

const KpiCard = ({ title, value, icon, color, darkMode }) => (
  <div className={`relative rounded-xl p-5 overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg group hover:scale-105 transition-transform duration-200`}>
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl`}
      style={{ background: `linear-gradient(135deg, ${color}22, ${color}08)` }} />
    <div className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-xl`} style={{ background: color }} />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
    </div>
  </div>
)

const RADIAN = Math.PI / 180
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  if (percent < 0.05) return null
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const CustomTooltip = ({ active, payload, label, darkMode }) => {
  if (active && payload && payload.length) {
    return (
      <div className={`${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg px-3 py-2 shadow-xl text-sm`}>
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }}>{entry.name}: {entry.value}</p>
        ))}
      </div>
    )
  }
  return null
}

export default function Overview({ potholes, darkMode }) {
  const stats = useMemo(() => {
    const total = potholes.length
    const high = potholes.filter(p => p.severity === 'High').length
    const medium = potholes.filter(p => p.severity === 'Medium').length
    const low = potholes.filter(p => p.severity === 'Low').length
    const reported = potholes.filter(p => p.status === 'Reported').length
    const inProgress = potholes.filter(p => p.status === 'In Progress').length
    const resolved = potholes.filter(p => p.status === 'Resolved').length
    const pending = reported + inProgress

    return { total, high, medium, low, reported, inProgress, resolved, pending }
  }, [potholes])

  const severityData = [
    { name: 'High', value: stats.high, color: '#ef4444' },
    { name: 'Medium', value: stats.medium, color: '#f59e0b' },
    { name: 'Low', value: stats.low, color: '#facc15' },
  ]

  const statusData = [
    { name: 'Reported', value: stats.reported, color: '#3b82f6' },
    { name: 'In Progress', value: stats.inProgress, color: '#f59e0b' },
    { name: 'Resolved', value: stats.resolved, color: '#10b981' },
  ].filter(d => d.value > 0)

  const textColor = darkMode ? '#d1d5db' : '#374151'
  const gridColor = darkMode ? '#374151' : '#e5e7eb'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">System Overview</h2>
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {potholes.length} total reports
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Detected" value={stats.total} icon="🕳️" color="#06b6d4" darkMode={darkMode} />
        <KpiCard title="High Severity" value={stats.high} icon="🔴" color="#ef4444" darkMode={darkMode} />
        <KpiCard title="Pending Repairs" value={stats.pending} icon="⏳" color="#f59e0b" darkMode={darkMode} />
        <KpiCard title="Resolved" value={stats.resolved} icon="✅" color="#10b981" darkMode={darkMode} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Severity */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 shadow-lg`}>
          <h3 className="text-base font-semibold mb-4">Severity Breakdown</h3>
          {potholes.length === 0 ? (
            <div className={`flex items-center justify-center h-48 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={severityData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fill: textColor, fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: textColor, fontSize: 12 }} />
                <Tooltip content={<CustomTooltip darkMode={darkMode} />} />
                <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                  {severityData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart - Status */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 shadow-lg`}>
          <h3 className="text-base font-semibold mb-4">Status Distribution</h3>
          {statusData.length === 0 ? (
            <div className={`flex items-center justify-center h-48 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={90}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip darkMode={darkMode} />} />
                <Legend
                  iconType="circle"
                  formatter={(value) => <span style={{ color: textColor, fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {potholes.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 shadow-lg`}>
          <h3 className="text-base font-semibold mb-4">Recent Reports</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...potholes]
              .sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp))
              .slice(0, 8)
              .map((p, i) => (
                <div key={p._id || i} className={`flex items-center justify-between py-2 px-3 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      p.severity === 'High' ? 'bg-red-500' : p.severity === 'Medium' ? 'bg-amber-500' : 'bg-yellow-400'
                    }`} />
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400' :
                      p.status === 'In Progress' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>{p.status || 'Reported'}</span>
                    <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {(p.createdAt || p.timestamp) ? new Date(p.createdAt || p.timestamp).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}


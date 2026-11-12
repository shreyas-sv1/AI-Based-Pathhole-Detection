import React, { useEffect, useState, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { updateStatus } from '../api.js'
import { BASE } from '../api.js'

// Fix default icon issue - use divIcon with colored circles instead
const createColoredIcon = (color) => L.divIcon({
  className: '',
  html: `<div style="
    width:16px;height:16px;
    background:${color};
    border-radius:50%;
    border:2.5px solid white;
    box-shadow:0 2px 6px rgba(0,0,0,0.5);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
})

const severityColors = { High: '#ef4444', Medium: '#f59e0b', Low: '#facc15' }

function getMarkerColor(pothole) {
  if (pothole.status === 'Resolved') return '#10b981'
  return severityColors[pothole.severity] || '#3b82f6'
}

function BoundsAdjuster({ markers }) {
  const map = useMap()
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]))
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      }
    }
  }, [markers, map])
  return null
}

function HighlightFly({ highlighted }) {
  const map = useMap()
  useEffect(() => {
    if (highlighted && highlighted.lat && highlighted.lng) {
      map.flyTo([highlighted.lat, highlighted.lng], 16, { duration: 1.5 })
    }
  }, [highlighted, map])
  return null
}

export default function MapView({ potholes, darkMode, highlightedPothole, onStatusUpdate }) {
  const [severityFilter, setSeverityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [updatingId, setUpdatingId] = useState(null)

  const filtered = useMemo(() => {
    return potholes.filter(p => {
      const sevOk = severityFilter === 'All' || p.severity === severityFilter
      const statOk = statusFilter === 'All' || p.status === statusFilter
      return sevOk && statOk
    })
  }, [potholes, severityFilter, statusFilter])

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id)
    try {
      await updateStatus(id, newStatus)
      onStatusUpdate()
    } catch (e) {
      console.error('Status update failed', e)
    } finally {
      setUpdatingId(null)
    }
  }

  const btnClass = (active, color) =>
    `px-3 py-1 rounded-full text-xs font-medium transition-all ${active
      ? `${color} text-white shadow`
      : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
    }`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Interactive Map</h2>
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{filtered.length} markers</span>
      </div>

      {/* Filters */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-4 shadow flex flex-wrap gap-4`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wide`}>Severity:</span>
          {['All', 'High', 'Medium', 'Low'].map(s => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={btnClass(severityFilter === s,
                s === 'High' ? 'bg-red-500' : s === 'Medium' ? 'bg-amber-500' : s === 'Low' ? 'bg-yellow-400' : 'bg-blue-500'
              )}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wide`}>Status:</span>
          {['All', 'Reported', 'In Progress', 'Resolved'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={btnClass(statusFilter === s,
                s === 'Resolved' ? 'bg-emerald-500' : s === 'In Progress' ? 'bg-amber-500' : s === 'Reported' ? 'bg-blue-500' : 'bg-gray-500'
              )}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        {[
          { label: 'High (Unresolved)', color: '#ef4444' },
          { label: 'Medium (Unresolved)', color: '#f59e0b' },
          { label: 'Low (Unresolved)', color: '#facc15' },
          { label: 'Resolved', color: '#10b981' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden shadow-xl" style={{ height: '540px' }}>
        <MapContainer
          center={[13.1155, 77.6070]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filtered.length > 0 && <BoundsAdjuster markers={filtered} />}
          {highlightedPothole && <HighlightFly highlighted={highlightedPothole} />}

          {filtered.map((p, idx) => {
            if (!p.lat || !p.lng) return null
            const color = getMarkerColor(p)
            const icon = createColoredIcon(color)
            const isHighlighted = highlightedPothole && highlightedPothole._id === p._id

            return (
              <Marker
                key={p._id || idx}
                position={[p.lat, p.lng]}
                icon={isHighlighted ? createColoredIcon('#06b6d4') : icon}
              >
                <Popup maxWidth={280} className="pothole-popup">
                  <div className="text-sm space-y-2 p-1">
                    {p.imageUrl && (
                      <img
                        src={`${BASE}${p.imageUrl}`}
                        alt="Pothole"
                        className="w-full h-32 object-cover rounded-lg"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${
                        p.severity === 'High' ? 'bg-red-500' : p.severity === 'Medium' ? 'bg-amber-500' : 'bg-yellow-400'
                      }`}>{p.severity || 'Unknown'}</span>
                      <span className="text-gray-500 text-xs">{p.confidence ? `${(p.confidence * 100).toFixed(1)}% conf.` : ''}</span>
                    </div>
                    <div className="text-gray-600 text-xs space-y-0.5">
                      <div>📍 {p.lat?.toFixed(5)}, {p.lng?.toFixed(5)}</div>
                      <div>🕐 {(p.createdAt || p.timestamp) ? new Date(p.createdAt || p.timestamp).toLocaleString() : '—'}</div>
                      {(p.detectionCount || p.count) && <div>🔍 {p.detectionCount || p.count} detection{(p.detectionCount || p.count) > 1 ? 's' : ''}</div>}
                    </div>
                    <div className="flex gap-1 pt-1 flex-wrap">
                      {['Reported', 'In Progress', 'Resolved'].map(s => (
                        <button
                          key={s}
                          disabled={updatingId === p._id}
                          onClick={() => handleStatusChange(p._id, s)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                            p.status === s
                              ? s === 'Resolved' ? 'bg-emerald-500 text-white' : s === 'In Progress' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } ${updatingId === p._id ? 'opacity-50' : ''}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}


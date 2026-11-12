import React, { useState, useEffect, useCallback } from 'react'
import { getPotholes } from './api.js'
import Overview from './components/Overview.jsx'
import MapView from './components/MapView.jsx'
import DetectionStudio from './components/DetectionStudio.jsx'
import MaintenanceTable from './components/MaintenanceTable.jsx'

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 15a5 5 0 100-10 5 5 0 000 10zm7.071-12.071a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM21 11a1 1 0 110 2h-1a1 1 0 110-2h1zM17.657 17.657a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM12 20a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM6.343 17.657a1 1 0 010-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414 0zM4 11a1 1 0 110 2H3a1 1 0 110-2h1zM6.343 6.343a1 1 0 011.414 0l.707.707A1 1 0 117.05 8.464l-.707-.707a1 1 0 010-1.414z"/>
  </svg>
)

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/>
  </svg>
)

const RoadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l3-10h12l3 10"/>
    <path d="M12 7v10"/>
    <path d="M8 17l1-3"/>
    <path d="M16 17l-1-3"/>
  </svg>
)

const TABS = ['Overview', 'Map', 'Detection Studio', 'Maintenance Table']

export default function App() {
  const [darkMode, setDarkMode] = useState(true)
  const [activeTab, setActiveTab] = useState('Overview')
  const [potholes, setPotholes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [highlightedPothole, setHighlightedPothole] = useState(null)

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  const fetchPotholes = useCallback(async () => {
    try {
      const data = await getPotholes()
      setPotholes(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch pothole data. Make sure the server is running.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPotholes()
    const interval = setInterval(fetchPotholes, 30000)
    return () => clearInterval(interval)
  }, [fetchPotholes])

  const handleViewOnMap = (pothole) => {
    setHighlightedPothole(pothole)
    setActiveTab('Map')
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'} transition-colors duration-300`}>
      {/* Navbar */}
      <nav className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-50 shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <RoadIcon />
              <div>
                <h1 className="text-lg font-bold text-cyan-400 leading-tight">SmartRoad Monitor</h1>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>AI Pothole Detection System</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : darkMode
                        ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchPotholes}
                className={`p-2 rounded-lg text-sm ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'} transition-colors`}
                title="Refresh data"
              >
                &#8635;
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-yellow-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'} transition-colors`}
                title="Toggle theme"
              >
                {darkMode ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>

          <div className="flex md:hidden gap-1 pb-2 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {loading && (
        <div className="bg-blue-600/20 border-b border-blue-500/30 text-blue-400 text-xs text-center py-1">
          Loading data...
        </div>
      )}
      {error && (
        <div className="bg-red-600/20 border-b border-red-500/30 text-red-400 text-xs text-center py-1">
          {error}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'Overview' && (
          <Overview potholes={potholes} darkMode={darkMode} />
        )}
        {activeTab === 'Map' && (
          <MapView
            potholes={potholes}
            darkMode={darkMode}
            highlightedPothole={highlightedPothole}
            onStatusUpdate={fetchPotholes}
          />
        )}
        {activeTab === 'Detection Studio' && (
          <DetectionStudio darkMode={darkMode} onNewReport={fetchPotholes} />
        )}
        {activeTab === 'Maintenance Table' && (
          <MaintenanceTable
            potholes={potholes}
            darkMode={darkMode}
            onUpdate={fetchPotholes}
            onViewOnMap={handleViewOnMap}
          />
        )}
      </main>
    </div>
  )
}

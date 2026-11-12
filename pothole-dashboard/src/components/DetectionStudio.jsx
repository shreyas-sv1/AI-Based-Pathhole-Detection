import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { reportImage, reportVideo } from '../api.js'

const dragMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function LocationPicker({ position, onPositionChange }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng)
    },
  })
  return position ? <Marker position={[position.lat, position.lng]} icon={dragMarkerIcon} /> : null
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function SeverityBadge({ severity }) {
  const cls = severity === 'High' ? 'bg-red-500' : severity === 'Medium' ? 'bg-amber-500' : 'bg-yellow-400'
  return <span className={`${cls} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>{severity}</span>
}

export default function DetectionStudio({ darkMode, onNewReport }) {
  const [mode, setMode] = useState('image')
  // Image mode state
  const [imgFile, setImgFile] = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [mapPosition, setMapPosition] = useState(null)
  const [submittingImg, setSubmittingImg] = useState(false)
  const [imgResult, setImgResult] = useState(null)
  const [imgError, setImgError] = useState('')

  // Video mode state
  const [videoFile, setVideoFile] = useState(null)
  const [videoLat, setVideoLat] = useState('')
  const [videoLng, setVideoLng] = useState('')
  const [submittingVideo, setSubmittingVideo] = useState(false)
  const [videoResult, setVideoResult] = useState(null)
  const [videoError, setVideoError] = useState('')

  const canvasRef = useRef(null)
  const imgDisplayRef = useRef(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted.length > 0) {
        setImgFile(accepted[0])
        setImgPreview(URL.createObjectURL(accepted[0]))
        setImgResult(null)
        setImgError('')
      }
    },
  })

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported by this browser.')
      return
    }
    setGpsLoading(true)
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setLat(latitude.toFixed(6))
        setLng(longitude.toFixed(6))
        setMapPosition({ lat: latitude, lng: longitude })
        setGpsLoading(false)
      },
      (err) => {
        setGpsError('Could not get location: ' + err.message)
        setGpsLoading(false)
      },
      { timeout: 10000 }
    )
  }

  const handleMapPositionChange = (newLat, newLng) => {
    setMapPosition({ lat: newLat, lng: newLng })
    setLat(newLat.toFixed(6))
    setLng(newLng.toFixed(6))
  }

  const drawBoundingBoxes = useCallback((detections, imageElement) => {
    const canvas = canvasRef.current
    if (!canvas || !imageElement) return

    const naturalW = imageElement.naturalWidth
    const naturalH = imageElement.naturalHeight
    const displayW = imageElement.clientWidth
    const displayH = imageElement.clientHeight

    if (!naturalW || !naturalH || !displayW || !displayH) return

    canvas.width = displayW
    canvas.height = displayH

    const scaleX = displayW / naturalW
    const scaleY = displayH / naturalH

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, displayW, displayH)

    if (!detections || detections.length === 0) return

    detections.forEach(det => {
      const bbox = det.bbox || det.box || det.bounding_box
      if (!bbox) return

      let x1, y1, x2, y2
      if (Array.isArray(bbox)) {
        [x1, y1, x2, y2] = bbox
      } else {
        x1 = bbox.x1 ?? bbox.xmin ?? 0
        y1 = bbox.y1 ?? bbox.ymin ?? 0
        x2 = bbox.x2 ?? bbox.xmax ?? 0
        y2 = bbox.y2 ?? bbox.ymax ?? 0
      }

      const sx = x1 * scaleX
      const sy = y1 * scaleY
      const sw = (x2 - x1) * scaleX
      const sh = (y2 - y1) * scaleY

      const severity = det.severity || 'Low'
      const color = severity === 'High' ? '#ef4444' : severity === 'Medium' ? '#f59e0b' : '#facc15'

      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.strokeRect(sx, sy, sw, sh)

      const conf = det.confidence ?? det.conf ?? 0
      const label = `${severity} ${(conf * 100).toFixed(0)}%`

      ctx.font = 'bold 11px sans-serif'
      const textW = ctx.measureText(label).width + 8
      ctx.fillStyle = color
      ctx.fillRect(sx, sy - 18, textW, 18)
      ctx.fillStyle = '#000000'
      ctx.fillText(label, sx + 4, sy - 4)
    })
  }, [])

  const handleImageSubmit = async (e) => {
    e.preventDefault()
    if (!imgFile) {
      setImgError('Please select an image.')
      return
    }
    setSubmittingImg(true)
    setImgError('')
    setImgResult(null)

    const formData = new FormData()
    formData.append('image', imgFile)
    if (lat) formData.append('lat', lat)
    if (lng) formData.append('lng', lng)

    try {
      const result = await reportImage(formData)
      if (result.saved === false) {
        setImgResult({
          detectionCount: 0,
          detections: [],
          severity: 'None',
          confidence: 0,
          noPothole: true,
          message: result.message || 'No pothole detected.'
        })
        return
      }

      const normalized = {
        ...result,
        ...(result.pothole || {}),
        detections: result.detections || result.pothole?.detections || [],
        detectionCount: result.detectionCount ?? result.count ?? result.pothole?.count ?? (result.detections?.length || 0),
        severity: result.severity || result.overall_severity || result.pothole?.severity || 'Low',
        confidence: result.confidence ?? result.pothole?.confidence ?? 0,
      }
      setImgResult(normalized)
      onNewReport()
      // Draw bounding boxes after image renders
      setTimeout(() => {
        if (imgDisplayRef.current) {
          drawBoundingBoxes(normalized.detections || [], imgDisplayRef.current)
        }
      }, 100)
    } catch (err) {
      setImgError(err?.response?.data?.detail || err.message || 'Detection failed.')
    } finally {
      setSubmittingImg(false)
    }
  }

  const handleVideoSubmit = async (e) => {
    e.preventDefault()
    if (!videoFile) {
      setVideoError('Please select a video file.')
      return
    }
    setSubmittingVideo(true)
    setVideoError('')
    setVideoResult(null)

    const formData = new FormData()
    formData.append('video', videoFile)
    if (videoLat) formData.append('lat', videoLat)
    if (videoLng) formData.append('lng', videoLng)

    try {
      const result = await reportVideo(formData)
      const normalized = {
        ...result,
        ...(result.pothole || {}),
      }
      setVideoResult(normalized)
      onNewReport()
    } catch (err) {
      setVideoError(err?.response?.data?.detail || err.message || 'Video analysis failed.')
    } finally {
      setSubmittingVideo(false)
    }
  }

  const card = `${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 shadow-lg`
  const input = `w-full px-3 py-2 rounded-lg text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} border focus:outline-none focus:ring-2 focus:ring-blue-500`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Detection Studio</h2>
      </div>

      {/* Mode tabs */}
      <div className={`${card} p-1 flex gap-1 w-fit`}>
        <button
          onClick={() => setMode('image')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'image' ? 'bg-blue-600 text-white shadow' : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          🖼️ Image Mode
        </button>
        <button
          onClick={() => setMode('video')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'video' ? 'bg-blue-600 text-white shadow' : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          🎥 Video Mode
        </button>
      </div>

      {/* IMAGE MODE */}
      {mode === 'image' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upload + Form */}
          <div className={card}>
            <h3 className="text-base font-semibold mb-4">Upload Image</h3>
            <form onSubmit={handleImageSubmit} className="space-y-4">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-500/10'
                    : darkMode ? 'border-gray-600 hover:border-blue-500 hover:bg-gray-700/50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
              >
                <input {...getInputProps()} />
                {imgPreview ? (
                  <div>
                    <img src={imgPreview} alt="Preview" className="max-h-32 mx-auto rounded-lg object-contain" />
                    <p className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{imgFile?.name}</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">📸</div>
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {isDragActive ? 'Drop image here...' : 'Drag & drop or click to select'}
                    </p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>JPG, PNG, WEBP</p>
                  </div>
                )}
              </div>

              {/* GPS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>GPS Location</label>
                  <button
                    type="button"
                    onClick={handleGetGPS}
                    disabled={gpsLoading}
                    className="text-xs px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {gpsLoading ? 'Getting...' : '📍 Auto-fill'}
                  </button>
                </div>
                {gpsError && <p className="text-xs text-red-400">{gpsError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="any" placeholder="Latitude" value={lat} onChange={e => { setLat(e.target.value); setMapPosition(e.target.value && lng ? { lat: parseFloat(e.target.value), lng: parseFloat(lng) } : null) }} className={input} />
                  <input type="number" step="any" placeholder="Longitude" value={lng} onChange={e => { setLng(e.target.value); setMapPosition(lat && e.target.value ? { lat: parseFloat(lat), lng: parseFloat(e.target.value) } : null) }} className={input} />
                </div>
              </div>

              {/* Mini map for location picking */}
              <div>
                <label className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} block mb-1`}>Click map to set location</label>
                <div className="rounded-lg overflow-hidden" style={{ height: '160px' }}>
                  <MapContainer
                    center={mapPosition ? [mapPosition.lat, mapPosition.lng] : [13.1155, 77.6070]}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; OpenStreetMap'
                    />
                    <LocationPicker position={mapPosition} onPositionChange={handleMapPositionChange} />
                  </MapContainer>
                </div>
              </div>

              {imgError && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{imgError}</p>}

              <button
                type="submit"
                disabled={submittingImg || !imgFile}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {submittingImg ? 'Analyzing...' : '🔍 Detect Potholes'}
              </button>
            </form>
          </div>

          {/* Results */}
          <div className={card}>
            <h3 className="text-base font-semibold mb-4">Detection Results</h3>
            {submittingImg && <Spinner />}
            {!submittingImg && imgResult && (
              <div className="space-y-4">
                {/* Canvas overlay on image */}
                {imgPreview && (
                  <div className="relative rounded-lg overflow-hidden">
                    <img
                      ref={imgDisplayRef}
                      src={imgPreview}
                      alt="Analyzed"
                      className="w-full object-contain max-h-64 rounded-lg"
                      onLoad={() => {
                        if (imgResult?.detections) {
                          drawBoundingBoxes(imgResult.detections, imgDisplayRef.current)
                        }
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                )}

                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-2`}>
                    <div className="text-xl font-bold text-blue-400">{imgResult.detectionCount ?? imgResult.detections?.length ?? 0}</div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Detected</div>
                  </div>
                  <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-2`}>
                    <div className="font-bold">
                      <SeverityBadge severity={imgResult.severity || imgResult.overallSeverity || 'N/A'} />
                    </div>
                    <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Severity</div>
                  </div>
                  <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-2`}>
                    <div className="text-xl font-bold text-cyan-400">
                      {imgResult.confidence ? `${(imgResult.confidence * 100).toFixed(0)}%` : '—'}
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Confidence</div>
                  </div>
                </div>

                {/* Detections list */}
                {imgResult.detections && imgResult.detections.length > 0 && (
                  <div>
                    <h4 className={`text-xs font-semibold mb-2 uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Detections</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {imgResult.detections.map((det, i) => (
                        <div key={i} className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                          <SeverityBadge severity={det.severity || 'Low'} />
                          <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            conf: {((det.confidence ?? det.conf ?? 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {imgResult.noPothole ? (
                  <p className="text-xs text-amber-400">ℹ️ Clean road - No pothole detected</p>
                ) : (
                  <p className="text-xs text-emerald-400">✅ Report saved to database</p>
                )}
              </div>
            )}
            {!submittingImg && !imgResult && (
              <div className={`flex flex-col items-center justify-center h-48 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>
                <div className="text-5xl mb-3">🔍</div>
                <p className="text-sm">Upload an image and click detect</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIDEO MODE */}
      {mode === 'video' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={card}>
            <h3 className="text-base font-semibold mb-4">Upload Video</h3>
            <form onSubmit={handleVideoSubmit} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Video File (.mp4)
                </label>
                <input
                  type="file"
                  accept="video/mp4,video/*"
                  onChange={e => {
                    setVideoFile(e.target.files[0] || null)
                    setVideoResult(null)
                    setVideoError('')
                  }}
                  className={`${input} file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700`}
                />
                {videoFile && (
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Latitude (optional)</label>
                  <input type="number" step="any" placeholder="e.g. 13.1155" value={videoLat} onChange={e => setVideoLat(e.target.value)} className={input} />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Longitude (optional)</label>
                  <input type="number" step="any" placeholder="e.g. 77.6070" value={videoLng} onChange={e => setVideoLng(e.target.value)} className={input} />
                </div>
              </div>

              {videoError && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{videoError}</p>}

              <button
                type="submit"
                disabled={submittingVideo || !videoFile}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {submittingVideo ? 'Analyzing video...' : '🎬 Analyze Video'}
              </button>

              {submittingVideo && (
                <div>
                  <Spinner />
                  <p className={`text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Processing frames... this may take a few minutes
                  </p>
                </div>
              )}
            </form>
          </div>

          <div className={card}>
            <h3 className="text-base font-semibold mb-4">Video Analysis Results</h3>
            {!submittingVideo && videoResult && (
              <div className="space-y-4">
                {/* Annotated video player */}
                {videoResult.annotated_video_url && (
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'} block mb-1`}>
                      Annotated Video
                    </label>
                    <video
                      controls
                      className="w-full rounded-lg max-h-48 bg-black"
                      src={`http://localhost:8000${videoResult.annotated_video_url}`}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Frames Analyzed', value: videoResult.total_frames_analyzed ?? '—', color: 'text-blue-400' },
                    { label: 'Total Detections', value: videoResult.total_detections ?? '—', color: 'text-cyan-400' },
                    { label: 'Max Severity', value: videoResult.max_severity || '—', color: 'text-red-400' },
                    { label: 'Report Saved', value: '✅', color: 'text-emerald-400' },
                  ].map((item, i) => (
                    <div key={i} className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3`}>
                      <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* Timeline table */}
                {videoResult.detections_timeline && videoResult.detections_timeline.length > 0 && (
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'} block mb-2`}>
                      Detections Timeline
                    </label>
                    <div className={`rounded-lg overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'} max-h-48 overflow-y-auto`}>
                      <table className="w-full text-xs">
                        <thead className={`${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} sticky top-0`}>
                          <tr>
                            <th className="px-3 py-2 text-left">Frame</th>
                            <th className="px-3 py-2 text-left">Detections</th>
                            <th className="px-3 py-2 text-left">Max Severity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {videoResult.detections_timeline.map((item, i) => (
                            <tr key={i} className={`border-t ${darkMode ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <td className={`px-3 py-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.frame}</td>
                              <td className={`px-3 py-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.detections?.length ?? 0}</td>
                              <td className="px-3 py-1.5">
                                {item.detections?.length > 0 ? (
                                  <SeverityBadge severity={
                                    item.detections.some(d => d.severity === 'High') ? 'High' :
                                    item.detections.some(d => d.severity === 'Medium') ? 'Medium' : 'Low'
                                  } />
                                ) : <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!submittingVideo && !videoResult && (
              <div className={`flex flex-col items-center justify-center h-48 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>
                <div className="text-5xl mb-3">🎬</div>
                <p className="text-sm">Upload a video and click analyze</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


import axios from 'axios';
const BASE = 'http://localhost:5000';

// Normalize a pothole document from MongoDB to consistent field names
function normalizePothole(p) {
  if (!p) return p;
  // Capitalize severity: "high" -> "High", "medium" -> "Medium", "low" -> "Low"
  const rawSev = p.severity || '';
  const severity = rawSev ? (rawSev.charAt(0).toUpperCase() + rawSev.slice(1).toLowerCase()) : 'Low';
  const detectionCount = p.count ?? p.detectionCount ?? p.detections?.length ?? 0;
  return { ...p, severity, detectionCount };
}

export const getPotholes = () =>
  axios.get(`${BASE}/api/potholes`).then(r =>
    Array.isArray(r.data) ? r.data.map(normalizePothole) : []
  );

export const updateStatus = (id, status) =>
  axios.patch(`${BASE}/api/potholes/${id}`, { status }).then(r => r.data);

export const deleteReport = (id) =>
  axios.delete(`${BASE}/api/potholes/${id}`).then(r => r.data);

export const reportImage = (formData) =>
  axios.post(`${BASE}/api/report`, formData).then(r => r.data);

export const reportVideo = (formData) =>
  axios.post(`${BASE}/api/report-video`, formData, {
    timeout: 300000, // 5 min timeout for video processing
  }).then(r => r.data);

export { BASE };

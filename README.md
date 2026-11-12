# Smart Road Infrastructure Monitoring Using AI-Based Pothole Detection

An end-to-end full-stack intelligent road monitoring system that detects potholes in real-time from images and videos using computer vision (YOLOv8), geo-tags detections, stores telemetry and severity analytics in MongoDB, and presents live spatial maintenance data across an interactive React Leaflet dashboard.

---

## 🏛️ System Architecture

```text
       ┌────────────────────────┐
       │   React 19 + Vite UI   │  (pothole-dashboard - Port 5173)
       │ Leaflet Maps & Recharts│
       └───────────┬────────────┘
                   │ HTTP / REST
                   ▼
       ┌────────────────────────┐
       │  Express / Node Server │  (pothole-server - Port 5000)
       │ MongoDB Atlas Storage  │
       └───────────┬────────────┘
                   │ Forward media & GPS
                   ▼
       ┌────────────────────────┐
       │   FastAPI + YOLOv8     │  (pothole-api - Port 8000)
       │ Object Detection Engine│
       └────────────────────────┘
```

The system is decomposed into three modular tiers:

1. **AI Vision & Inference Engine (`pothole-api`)**
   - Built with **FastAPI** and **Ultralytics YOLOv8** (`best.pt`).
   - Extracts embedded EXIF GPS tags from media files.
   - Computes surface area ratio to classify severity (`low`, `medium`, `high`).
   - Processes image files and streams annotated video frames with bounding boxes.

2. **Backend Management Service (`pothole-server`)**
   - Built with **Node.js**, **Express**, and **Mongoose**.
   - Handles multipart image/video uploads via `multer`.
   - Persists detection records, GPS coordinates, severity metrics, and maintenance status (`Reported`, `In Progress`, `Repaired`) in **MongoDB Atlas**.
   - Securely configured with environment variables via `dotenv`.

3. **Interactive Control Dashboard (`pothole-dashboard`)**
   - Built with **React 19**, **Vite**, and **Tailwind CSS**.
   - **Detection Studio**: Drag-and-drop image and video analyzer with instant preview and status reporting.
   - **Interactive Map**: Geospatial visualization powered by **Leaflet** with severity-coded marker clusters.
   - **Maintenance Table**: Real-time management interface to track, filter, update, or remove incident reports.
   - **Analytics Overview**: Visual metrics and charts powered by **Recharts**.

---

## 📁 Repository Structure

```text
AI-Based-Pothole-Detection/
├── pothole-api/               # Python FastAPI + YOLOv8 Detection Engine
│   ├── best.pt                # Trained YOLOv8 pothole weights
│   ├── main.py                # FastAPI endpoints & CV processing pipeline
│   └── uploads_video/         # Output directory for processed video frames
│
├── pothole-server/            # Node.js + Express + MongoDB Service
│   ├── server.js              # Express REST API routes & MongoDB connection
│   ├── .env.example           # Template for environment variables
│   ├── package.json           # Backend npm dependencies (express, mongoose, dotenv)
│   └── uploads/               # Upload destination for reported media
│
├── pothole-dashboard/         # React + Vite Frontend
│   ├── src/
│   │   ├── components/        # DetectionStudio, MapView, MaintenanceTable, Overview
│   │   ├── api.js             # Axios client for pothole-server API
│   │   ├── App.jsx            # Main app shell & navigation tabs
│   │   └── main.jsx           # React DOM entry point
│   ├── package.json           # Frontend npm dependencies (react, leaflet, recharts)
│   └── vite.config.js         # Vite configuration
│
├── .gitignore                 # Root ignore rules for node_modules, .env, __pycache__, etc.
└── README.md                  # Project documentation
```

---

## 🚀 Getting Started & Setup

### Prerequisites
- **Python 3.10+** (with `pip`)
- **Node.js 18+** & **npm**
- **MongoDB Atlas** account (or local MongoDB instance)

---

### 1. AI Detection Service (`pothole-api`)

Navigate to `pothole-api` and install the required Python packages:

```bash
cd pothole-api
pip install fastapi uvicorn ultralytics opencv-python pillow python-multipart
```

Start the FastAPI server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*API docs available at: `http://localhost:8000/docs`*

---

### 2. Backend Server (`pothole-server`)

Navigate to `pothole-server` and install dependencies:

```bash
cd pothole-server
npm install
```

Configure your environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your MongoDB connection string and port:
```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/potholes?retryWrites=true&w=majority
PORT=5000
```

Start the backend:

```bash
node server.js
```
*Server runs at: `http://localhost:5000`*

---

### 3. Frontend Dashboard (`pothole-dashboard`)

Navigate to `pothole-dashboard` and install dependencies:

```bash
cd pothole-dashboard
npm install
```

Start the Vite development server:

```bash
npm run dev
```
*Dashboard opens at: `http://localhost:5173`*

---

## 📡 API Reference

### Backend (`pothole-server` on `:5000`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/report` | Upload image file (`multipart/form-data`) + optional `lat`/`lng` for detection and persistence |
| `POST` | `/api/report-video` | Upload video file (`multipart/form-data`) + optional `lat`/`lng` for frame-by-frame analysis |
| `GET` | `/api/potholes` | Retrieve all recorded pothole reports sorted by timestamp |
| `PATCH` | `/api/potholes/:id` | Update maintenance status (`Reported`, `In Progress`, `Repaired`) |
| `DELETE` | `/api/potholes/:id` | Delete a pothole record |

### AI Inference Engine (`pothole-api` on `:8000`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/detect` | Run YOLOv8 inference on single image; returns JSON detections & severity |
| `POST` | `/detect-image` | Run YOLOv8 inference and return rendered annotated image stream |
| `POST` | `/detect-video` | Process full video; renders detections and returns annotated output URL |

---

## 🛡️ Security & Environment Best Practices
- Never commit `.env` or sensitive database connection strings to source control.
- Ensure all secrets are kept in environment variables using `.env.example` as a template.
- Regularly rotate MongoDB Atlas database user credentials.

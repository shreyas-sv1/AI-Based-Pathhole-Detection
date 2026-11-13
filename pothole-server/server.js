require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ----------------------------------------------------
// 1. Environment Configuration & Validation
// ----------------------------------------------------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const AI_API_URL = process.env.AI_API_URL || "http://localhost:8000";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "admin-secret-key-123";
const MAX_IMAGE_SIZE_MB = parseInt(process.env.MAX_IMAGE_SIZE_MB || "10", 10);
const MAX_VIDEO_SIZE_MB = parseInt(process.env.MAX_VIDEO_SIZE_MB || "100", 10);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://localhost:5000"];

if (!MONGO_URI) {
    console.error("CRITICAL ERROR: MONGO_URI environment variable is missing.");
    console.error("Please configure MONGO_URI in your .env file or environment.");
    process.exit(1);
}

// ----------------------------------------------------
// 2. Security, CORS & Logging Middleware
// ----------------------------------------------------
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: false,
    })
);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) {
                callback(null, true);
            } else {
                callback(new Error(`Origin ${origin} not permitted by CORS policy`));
            }
        },
        credentials: true,
    })
);

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());

// Global Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: "Too many requests from this IP, please try again later." },
});
app.use("/api/", apiLimiter);

// Static Asset Directories
const UPLOADS_DIR = path.join(__dirname, "uploads");
const VIDEO_DIR = path.resolve(__dirname, "../pothole-api/uploads_video");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (fs.existsSync(VIDEO_DIR)) {
    app.use("/video-uploads", express.static(VIDEO_DIR));
}
app.use("/uploads", express.static(UPLOADS_DIR));

// ----------------------------------------------------
// 3. Database Connection & Mongoose Models
// ----------------------------------------------------
mongoose
    .connect(MONGO_URI)
    .then(() => console.log("MongoDB Atlas connected successfully."))
    .catch((err) => {
        console.error("MongoDB Atlas connection error:", err.message);
        process.exit(1);
    });

const STATUS_ENUM = ["Reported", "In Progress", "Repaired"];

const potholeSchema = new mongoose.Schema({
    imageUrl: { type: String },
    videoUrl: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point",
        },
        coordinates: {
            type: [Number], // [lng, lat]
            default: undefined,
        },
    },
    severity: {
        type: String,
        enum: ["low", "medium", "high", "Low", "Medium", "High"],
        default: "Low",
    },
    confidence: { type: Number },
    count: { type: Number, default: 1 },
    reportCount: { type: Number, default: 1 },
    detections: { type: Array, default: [] },
    status: {
        type: String,
        enum: STATUS_ENUM,
        default: "Reported",
    },
    mediaType: {
        type: String,
        enum: ["image", "video"],
        default: "image",
    },
    createdAt: { type: Date, default: Date.now },
});

// Indexes for fast geospatial lookup and dashboard filtering
potholeSchema.index({ location: "2dsphere" });
potholeSchema.index({ status: 1, createdAt: -1 });
potholeSchema.index({ createdAt: -1 });

const Pothole = mongoose.model("Pothole", potholeSchema);

// ----------------------------------------------------
// 4. Multer Upload Validation & Configuration
// ----------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    },
});

const imageFileFilter = (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only JPG, PNG, and WEBP image files are allowed."));
    }
};

const videoFileFilter = (req, file, cb) => {
    const allowedMimes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mkv"];
    const allowedExts = [".mp4", ".mov", ".avi", ".webm", ".mkv"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only MP4, MOV, AVI, and WEBM video files are allowed."));
    }
};

const uploadImage = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024 },
});

const uploadVideo = multer({
    storage,
    fileFilter: videoFileFilter,
    limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024 },
});

// ----------------------------------------------------
// 5. Authentication & Helper Utilities
// ----------------------------------------------------
const requireAdminAuth = (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (apiKey === ADMIN_API_KEY || token === ADMIN_API_KEY) {
        return next();
    }
    return res.status(401).json({
        error: "Unauthorized: Valid admin API key or bearer token required for this action.",
    });
};

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const safeDeleteFile = (filePath) => {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.warn(`Could not delete file ${filePath}:`, e.message);
    }
};

// ----------------------------------------------------
// 6. Routes
// ----------------------------------------------------

// GET /api/health
app.get("/api/health", async (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    let aiState = "unknown";
    try {
        const { data } = await axios.get(`${AI_API_URL}/health`, { timeout: 2000 });
        aiState = data.status || "healthy";
    } catch {
        aiState = "unreachable";
    }
    res.json({
        status: dbState === "connected" ? "healthy" : "degraded",
        database: dbState,
        ai_service: aiState,
        timestamp: new Date().toISOString(),
    });
});

// POST /api/auth/login (Admin authentication verification)
app.post("/api/auth/login", (req, res) => {
    const { apiKey, password } = req.body || {};
    const key = apiKey || password;
    if (key === ADMIN_API_KEY) {
        return res.json({ success: true, token: ADMIN_API_KEY, message: "Admin authenticated." });
    }
    return res.status(401).json({ success: false, error: "Invalid admin credentials." });
});

// POST /api/report - Image upload & AI detection
app.post("/api/report", uploadImage.single("image"), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image file provided in 'image' field." });
    }

    const uploadedPath = req.file.path;
    try {
        const fd = new FormData();
        fd.append("file", fs.createReadStream(uploadedPath), req.file.originalname);
        if (req.body.lat) fd.append("lat", req.body.lat);
        if (req.body.lng) fd.append("lng", req.body.lng);

        const aiResponse = await axios.post(`${AI_API_URL}/detect`, fd, {
            headers: fd.getHeaders(),
            timeout: 60000,
        });
        const data = aiResponse.data;

        // Cleanup orphan file if no pothole detected
        if (!data.count || data.count === 0) {
            safeDeleteFile(uploadedPath);
            return res.json({
                saved: false,
                message: "No pothole detected in image.",
                result: data,
            });
        }

        const reportLat = data.lat !== null && data.lat !== undefined ? parseFloat(data.lat) : (req.body.lat ? parseFloat(req.body.lat) : null);
        const reportLng = data.lng !== null && data.lng !== undefined ? parseFloat(data.lng) : (req.body.lng ? parseFloat(req.body.lng) : null);

        // Deduplication: Check if there is an existing non-repaired report within 15 meters
        if (reportLat !== null && reportLng !== null) {
            const nearbyCandidates = await Pothole.find({
                status: { $ne: "Repaired" },
                lat: { $exists: true, $ne: null },
                lng: { $exists: true, $ne: null },
            });

            const match = nearbyCandidates.find((c) => haversineMeters(reportLat, reportLng, c.lat, c.lng) <= 15);
            if (match) {
                // Link/merge with existing report
                match.reportCount = (match.reportCount || 1) + 1;
                match.detections = [...(match.detections || []), ...(data.detections || [])];
                match.count = Math.max(match.count || 0, data.count);
                await match.save();

                // Delete redundant image upload since it is merged
                safeDeleteFile(uploadedPath);

                return res.json({
                    saved: true,
                    merged: true,
                    message: "Nearby pothole report found; merged reports within 15 meters.",
                    pothole: match,
                    detectionCount: data.count,
                    count: match.count,
                    severity: match.severity,
                    confidence: match.confidence,
                    detections: data.detections,
                    imageUrl: match.imageUrl,
                });
            }
        }

        const topConfidence = data.detections && data.detections.length > 0
            ? Math.max(...data.detections.map((d) => d.confidence || 0))
            : null;

        const docData = {
            imageUrl: `/uploads/${req.file.filename}`,
            lat: reportLat,
            lng: reportLng,
            severity: data.overall_severity || "low",
            confidence: topConfidence,
            count: data.count,
            reportCount: 1,
            detections: data.detections,
            mediaType: "image",
            status: "Reported",
        };

        if (reportLat !== null && reportLng !== null) {
            docData.location = {
                type: "Point",
                coordinates: [reportLng, reportLat],
            };
        }

        const doc = await Pothole.create(docData);

        res.json({
            saved: true,
            pothole: doc,
            detectionCount: data.count,
            count: data.count,
            severity: data.overall_severity,
            confidence: topConfidence,
            detections: data.detections,
            imageUrl: doc.imageUrl,
        });
    } catch (err) {
        safeDeleteFile(uploadedPath);
        next(err);
    }
});

// POST /api/report-video - Video upload & AI processing
app.post("/api/report-video", uploadVideo.single("video"), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: "No video file provided in 'video' field." });
    }

    const tempVideoPath = req.file.path;
    try {
        const fd = new FormData();
        fd.append("file", fs.createReadStream(tempVideoPath), req.file.originalname);
        if (req.body.lat) fd.append("lat", req.body.lat);
        if (req.body.lng) fd.append("lng", req.body.lng);

        const aiResponse = await axios.post(`${AI_API_URL}/detect-video`, fd, {
            headers: fd.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000,
        });
        const data = aiResponse.data;

        // Delete incoming uploaded temporary video file after processing
        safeDeleteFile(tempVideoPath);

        const videoLat = req.body.lat ? parseFloat(req.body.lat) : (data.lat !== undefined ? data.lat : null);
        const videoLng = req.body.lng ? parseFloat(req.body.lng) : (data.lng !== undefined ? data.lng : null);

        const docData = {
            lat: videoLat,
            lng: videoLng,
            severity: data.max_severity || "low",
            confidence: null,
            count: data.unique_potholes_count || data.total_detections || 0,
            reportCount: 1,
            detections: data.detections_timeline || [],
            mediaType: "video",
            videoUrl: data.annotated_video_url,
            status: "Reported",
        };

        if (videoLat !== null && videoLng !== null && !isNaN(videoLat) && !isNaN(videoLng)) {
            docData.location = {
                type: "Point",
                coordinates: [videoLng, videoLat],
            };
        }

        const doc = await Pothole.create(docData);

        res.json({
            saved: true,
            pothole: doc,
            ...data,
        });
    } catch (err) {
        safeDeleteFile(tempVideoPath);
        next(err);
    }
});

// GET /api/potholes - Query reports with optional filters and pagination
app.get("/api/potholes", async (req, res, next) => {
    try {
        const { status, severity, mediaType, startDate, endDate, page, limit } = req.query;

        const filter = {};
        if (status && status !== "All") {
            filter.status = status;
        }
        if (severity && severity !== "All") {
            // Case-insensitive regex match for severity (e.g. High / high)
            filter.severity = new RegExp(`^${severity}$`, "i");
        }
        if (mediaType && mediaType !== "All") {
            filter.mediaType = mediaType;
        }
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Backward compatibility: If no pagination params are provided, return array directly
        if (!page && !limit) {
            const list = await Pothole.find(filter).sort({ createdAt: -1 });
            return res.json(list);
        }

        const pageNum = Math.max(1, parseInt(page || "1", 10));
        const limitNum = Math.max(1, Math.min(100, parseInt(limit || "20", 10)));
        const skip = (pageNum - 1) * limitNum;

        const [total, data] = await Promise.all([
            Pothole.countDocuments(filter),
            Pothole.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
        ]);

        res.json({
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            data,
        });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/potholes/:id - Update report status (Protected by Admin Auth)
app.patch("/api/potholes/:id", requireAdminAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid MongoDB ObjectId format." });
        }

        if (!status || !STATUS_ENUM.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${STATUS_ENUM.join(", ")}`,
            });
        }

        const updated = await Pothole.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
        if (!updated) {
            return res.status(404).json({ error: "Pothole record not found." });
        }

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/potholes/:id - Delete report and stored media file (Protected by Admin Auth)
app.delete("/api/potholes/:id", requireAdminAuth, async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid MongoDB ObjectId format." });
        }

        const doc = await Pothole.findById(id);
        if (!doc) {
            return res.status(404).json({ error: "Pothole record not found." });
        }

        // Delete associated image file from uploads/
        if (doc.imageUrl && doc.imageUrl.startsWith("/uploads/")) {
            const filename = path.basename(doc.imageUrl);
            safeDeleteFile(path.join(UPLOADS_DIR, filename));
        }

        // Delete associated video file from uploads_video/ if stored locally
        if (doc.videoUrl && doc.videoUrl.startsWith("/video-uploads/")) {
            const filename = path.basename(doc.videoUrl);
            safeDeleteFile(path.join(VIDEO_DIR, filename));
        }

        await Pothole.findByIdAndDelete(id);
        res.json({ deleted: true, id });
    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------
// 7. Centralized Error Handling Middleware
// ----------------------------------------------------
app.use((err, req, res, next) => {
    const status = err.status || (err.name === "MulterError" ? 400 : 500);
    const message = err.message || "Internal Server Error";

    if (process.env.NODE_ENV !== "production") {
        console.error("API Error:", err);
    }

    res.status(status).json({
        error: message,
        code: err.code || (err.name === "MulterError" ? "UPLOAD_ERROR" : "SERVER_ERROR"),
    });
});

// ----------------------------------------------------
// 8. Start Server
// ----------------------------------------------------
const server = app.listen(PORT, () => {
    console.log(`Pothole backend service listening on http://localhost:${PORT}`);
});

module.exports = { app, server, Pothole };

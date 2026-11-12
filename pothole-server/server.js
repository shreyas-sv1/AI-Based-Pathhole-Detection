require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/video-uploads", express.static("../pothole-api/uploads_video"));
fs.mkdirSync("uploads", { recursive: true });

// Multer disk storage that preserves original file extensions
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    },
});
const upload = multer({ storage });

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/potholes?retryWrites=true&w=majority";
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((e) => console.log("MongoDB error:", e.message));

const Pothole = mongoose.model("Pothole", new mongoose.Schema({
    imageUrl: String,
    lat: Number,
    lng: Number,
    severity: String,
    confidence: Number,
    count: Number,
    detections: Array,
    status: { type: String, default: "Reported" },
    createdAt: { type: Date, default: Date.now },
    mediaType: { type: String, default: "image" },
    videoUrl: String,
}));

// POST /api/report – image upload
app.post("/api/report", upload.single("image"), async (req, res) => {
    try {
        const fd = new FormData();
        fd.append("file", fs.createReadStream(req.file.path), req.file.originalname);
        if (req.body.lat) fd.append("lat", req.body.lat);
        if (req.body.lng) fd.append("lng", req.body.lng);

        const { data } = await axios.post("http://localhost:8000/detect", fd, { headers: fd.getHeaders() });

        if (data.count === 0) return res.json({ saved: false, message: "No pothole detected", result: data });

        const top = Math.max(...data.detections.map((d) => d.confidence));
        const doc = await Pothole.create({
            imageUrl: `/uploads/${req.file.filename}`,
            lat: data.lat, lng: data.lng,
            severity: data.overall_severity,
            confidence: top, count: data.count,
            detections: data.detections,
            mediaType: "image",
        });
        res.json({
            saved: true,
            pothole: doc,
            detectionCount: data.count,
            count: data.count,
            severity: data.overall_severity,
            confidence: top,
            detections: data.detections,
            imageUrl: doc.imageUrl
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/report-video – video upload
app.post("/api/report-video", upload.single("video"), async (req, res) => {
    try {
        const fd = new FormData();
        fd.append("file", fs.createReadStream(req.file.path), req.file.originalname);
        if (req.body.lat) fd.append("lat", req.body.lat);
        if (req.body.lng) fd.append("lng", req.body.lng);

        const { data } = await axios.post("http://localhost:8000/detect-video", fd, {
            headers: fd.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const doc = await Pothole.create({
            lat: req.body.lat ? parseFloat(req.body.lat) : data.lat,
            lng: req.body.lng ? parseFloat(req.body.lng) : data.lng,
            severity: data.max_severity,
            confidence: null,
            count: data.total_detections,
            detections: data.detections_timeline,
            mediaType: "video",
            videoUrl: data.annotated_video_url,
        });
        res.json({
            saved: true,
            pothole: doc,
            ...data
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/potholes
app.get("/api/potholes", async (req, res) => {
    res.json(await Pothole.find().sort({ createdAt: -1 }));
});

// PATCH /api/potholes/:id – update status
app.patch("/api/potholes/:id", async (req, res) => {
    res.json(await Pothole.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }));
});

// DELETE /api/potholes/:id
app.delete("/api/potholes/:id", async (req, res) => {
    try {
        await Pothole.findByIdAndDelete(req.params.id);
        res.json({ deleted: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));

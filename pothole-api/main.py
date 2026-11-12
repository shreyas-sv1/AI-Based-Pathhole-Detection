import io
import cv2
import tempfile
import os
import uuid
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from ultralytics import YOLO

app = FastAPI(title="Pothole Detection API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
model = YOLO("best.pt")

os.makedirs("uploads_video", exist_ok=True)
app.mount("/video-uploads", StaticFiles(directory="uploads_video"), name="video-uploads")


def severity(ratio: float) -> str:
    if ratio < 0.02:
        return "low"
    if ratio < 0.08:
        return "medium"
    return "high"


def to_deg(v, ref):
    d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
    return -d if ref in ("S", "W") else d


def exif_gps(img):
    try:
        gps = img.getexif().get_ifd(0x8825)
        if gps and 2 in gps and 4 in gps:
            return to_deg(gps[2], gps[1]), to_deg(gps[4], gps[3])
    except Exception:
        pass
    return None, None


@app.post("/detect")
async def detect(file: UploadFile = File(...),
                 lat: float | None = Form(None),
                 lng: float | None = Form(None),
                 conf: float = Form(0.25)):
    raw = Image.open(io.BytesIO(await file.read()))
    ex_lat, ex_lng = exif_gps(raw)  # read EXIF before converting
    img = raw.convert("RGB")
    W, H = img.size
    r = model.predict(img, conf=conf, verbose=False)[0]

    dets = []
    for b in r.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        ratio = ((x2 - x1) * (y2 - y1)) / (W * H)
        dets.append({
            "bbox": [round(x1), round(y1), round(x2), round(y2)],
            "confidence": round(float(b.conf[0]), 3),
            "area_ratio": round(ratio, 4),
            "severity": severity(ratio),
        })

    order = {"low": 0, "medium": 1, "high": 2}
    worst = max((d["severity"] for d in dets), key=order.get, default=None)
    return {
        "count": len(dets),
        "overall_severity": worst,
        "lat": lat if lat is not None else ex_lat,
        "lng": lng if lng is not None else ex_lng,
        "detections": dets,
    }


@app.post("/detect/image")
async def detect_image(file: UploadFile = File(...), conf: float = Form(0.25)):
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    r = model.predict(img, conf=conf, verbose=False)[0]
    out = Image.fromarray(r.plot()[..., ::-1])  # BGR -> RGB
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


@app.post("/detect-video")
async def detect_video(
    file: UploadFile = File(...),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
):
    # Severity color map (BGR for cv2): red=high, orange=medium, yellow=low
    severity_colors = {
        "high":   (0,   0,   255),
        "medium": (0,   165, 255),
        "low":    (0,   255, 255),
    }
    order = {"low": 0, "medium": 1, "high": 2}

    # Save uploaded video to a temp file
    suffix = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return {"error": "Could not open video file"}

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Prepare output video writer
        out_filename = f"{uuid.uuid4().hex}.mp4"
        out_path = os.path.join("uploads_video", out_filename)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

        frame_idx = 0
        frames_analyzed = 0
        total_detections = 0
        max_severity = None
        detections_timeline = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % 10 == 0:
                frames_analyzed += 1
                H, W = frame.shape[:2]

                # Run YOLO on this frame
                img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(img_rgb)
                result = model.predict(pil_img, conf=0.25, verbose=False)[0]

                frame_dets = []
                for b in result.boxes:
                    x1, y1, x2, y2 = [round(v) for v in b.xyxy[0].tolist()]
                    conf_val = round(float(b.conf[0]), 3)
                    ratio = ((x2 - x1) * (y2 - y1)) / (W * H)
                    sev = severity(ratio)
                    frame_dets.append({
                        "bbox": [x1, y1, x2, y2],
                        "confidence": conf_val,
                        "area_ratio": round(ratio, 4),
                        "severity": sev,
                    })

                    # Draw bounding box
                    color = severity_colors[sev]
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    label = f"{sev} {conf_val:.2f}"
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
                    cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 2, y1), color, -1)
                    cv2.putText(frame, label, (x1 + 1, y1 - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)

                total_detections += len(frame_dets)
                if frame_dets:
                    frame_worst = max((d["severity"] for d in frame_dets), key=order.get)
                    if max_severity is None or order[frame_worst] > order[max_severity]:
                        max_severity = frame_worst
                    detections_timeline.append({
                        "frame": frame_idx,
                        "detections": frame_dets,
                    })

            writer.write(frame)
            frame_idx += 1

        cap.release()
        writer.release()

    finally:
        os.unlink(tmp_path)

    return {
        "total_frames_analyzed": frames_analyzed,
        "total_detections": total_detections,
        "max_severity": max_severity,
        "detections_timeline": detections_timeline,
        "annotated_video_url": f"/video-uploads/{out_filename}",
        "lat": lat,
        "lng": lng,
    }

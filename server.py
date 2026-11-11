# server.py
import sys
import io
import requests
import base64
import numpy as np
import cv2
import keras
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ==============================================================================
# 🔑 ROBOFLOW API CONFIGURATION (Authenticated to workspace: arian-heisenberg)
# ==============================================================================
ROBOFLOW_API_KEY = "TMLRmkhXtbzwiC9VdvwD"
ROBOFLOW_MODEL = "id-card-detection-h5j8s/1"
# ==============================================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 1. Face Detector for Accurate Face Cropping ──────────────────────────────
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# ── 2. Load Mask Detector ─────────────────────────────────────────────────────
class CustomDepthwiseConv2D(keras.layers.DepthwiseConv2D):
    def __init__(self, *args, **kwargs):
        kwargs.pop('groups', None)
        super().__init__(*args, **kwargs)

print("[INFO] Loading Mask Detection Model (mask_detector_MFN.h5)...")
mask_model = keras.models.load_model(
    'mask_detector_MFN.h5',
    custom_objects={'DepthwiseConv2D': CustomDepthwiseConv2D},
    compile=False
)
print("[OK] Mask Model Ready!")

LABELS = ["Proper Mask", "Incorrect Mask (Exposed)", "No Mask"]

# ── 3. ID Card Detector ───────────────────────────────────────────────────────
def detect_card_local(frame):
    """Fast local detector: yellow header band (elongated blob) + bright card body below it.
    Returns a box in Roboflow format (center x/y + width/height, frame pixels) or None."""
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    yellow = cv2.inRange(hsv, (15, 35, 120), (45, 255, 255))
    yellow = cv2.morphologyEx(yellow, cv2.MORPH_CLOSE, np.ones((9, 45), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(yellow)

    best = None
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area < 0.0002 * w * h:
            continue
        if bw < 0.05 * w or bw > 0.45 * w:   # header must be card-wide
            continue
        if bw < 2.0 * bh:                    # must be a horizontal band
            continue
        bx0, bx1 = max(0, x - int(0.1 * bw)), min(w, x + bw + int(0.1 * bw))
        by0, by1 = y, min(h, y + int(bw * 0.75))
        body = hsv[by0:by1, bx0:bx1]
        if body.size == 0:
            continue
        bright = float(np.mean(body[:, :, 2] > 140))
        if bright < 0.45:
            continue
        gray = cv2.cvtColor(frame[by0:by1, bx0:bx1], cv2.COLOR_BGR2GRAY)
        edge = float(cv2.Canny(gray, 40, 120).mean() / 255.0)
        if edge < 0.002:
            continue
        score = area / float(bw * bh) + bright + min(edge * 20, 1.0)
        if best is None or score > best[0]:
            best = (score, {
                "x": int((bx0 + bx1) // 2), "y": int((by0 + by1) // 2),
                "width": int(bx1 - bx0), "height": int(by1 - by0)
            })
    return best[1] if best else None


def check_id_card(base64_str, frame):
    # 1) Local detector first (fast, no network)
    try:
        box = detect_card_local(frame)
        if box:
            return True, box
    except Exception as e:
        print("[ID] local detector error:", e)

    # 2) Roboflow cloud as backup
    if ROBOFLOW_API_KEY and len(ROBOFLOW_API_KEY) > 10:
        try:
            url = f"https://detect.roboflow.com/{ROBOFLOW_MODEL}?api_key={ROBOFLOW_API_KEY}"
            resp = requests.post(
                url, data=base64_str,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=1.2
            )
            if resp.status_code == 200:
                for p in resp.json().get("predictions", []):
                    if p.get("confidence", 0) > 0.40:
                        return True, p
        except Exception:
            pass

    return False, None

class FramePayload(BaseModel):
    image: str

@app.post("/detect")
async def detect(payload: FramePayload):
    try:
        raw_b64 = payload.image.split(",")[1] if "," in payload.image else payload.image
        
        img_bytes = base64.b64decode(raw_b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 1. ID Card Detection
        has_id, id_box = check_id_card(raw_b64, frame)

        # 2. Extract CROPPED Face for Mask Detection (MobileNetV2 expects a cropped face!)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(80, 80))

        if len(faces) > 0:
            # Crop the primary face
            x, y, w, h = faces[0]
            # Add small padding around the face
            pad = int(0.1 * w)
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(frame.shape[1], x + w + pad)
            y2 = min(frame.shape[0], y + h + pad)
            face_img = frame[y1:y2, x1:x2]
        else:
            # Center crop fallback
            h, w = frame.shape[:2]
            face_img = frame[int(h*0.1):int(h*0.8), int(w*0.25):int(w*0.75)]

        face = cv2.resize(face_img, (224, 224))
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        face = preprocess_input(face.astype(np.float32))
        face = np.expand_dims(face, axis=0)

        # Run mask detection
        preds = mask_model.predict(face, verbose=0)[0]
        print("[MASK DEBUG] Raw predictions:", preds, "| ID:", has_id)

        best_idx = int(np.argmax(preds))
        confidence = float(preds[best_idx]) * 100
        mask_state = LABELS[best_idx]

        is_masked = mask_state == "Proper Mask" and confidence >= 70
        if confidence < 50:
            mask_state = "Uncertain"
            is_masked = False

        return {
            "isMasked": is_masked,
            "maskState": mask_state,
            "confidence": round(confidence, 1),
            "hasId": bool(has_id),
            "isDsatm": bool(has_id),
            "idBox": id_box
        }
    except Exception as e:
        print("[ERROR] Detection error:", e)
        return {"isMasked": False, "hasId": False, "isDsatm": False}

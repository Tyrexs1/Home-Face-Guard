"""API untuk mengontrol recognition worker + realtime recognize dari frame browser.

Ada dua mode:
1) Worker (server-side OpenCV VideoCapture)
   - GET  /api/recognition/status
   - POST /api/recognition/start
   - POST /api/recognition/stop

2) Browser frame (client capture via WebRTC, kirim frame ke backend)
   - POST /api/recognition/frame

Mode (2) sengaja disediakan karena webcam sering tidak bisa dipakai bersamaan oleh
browser dan OpenCV worker. Dengan endpoint /frame, dashboard bisa tetap menampilkan
webcam, sekaligus backend melakukan face recognition & menulis event log.

Body (JSON) untuk start worker:
  - source: 0 / "0" / "rtsp://..."

Body untuk /frame:
  - image: dataURL ("data:image/jpeg;base64,...")
Atau multipart/form-data:
  - frame: file gambar
"""

from __future__ import annotations

import base64
import re
import time
from typing import Optional

from flask import Blueprint, jsonify, request

from .. import face_engine
from ..database import add_event, get_all_residents
from ..recognition_worker import RecognitionWorker

recognition_bp = Blueprint("recognition", __name__)

# Single instance (in-process)
_worker = RecognitionWorker()

# Cache model supaya tidak reload setiap request /frame
_cached_model = None
_cached_mtime: float = 0.0
_cached_threshold: float = -1.0

# Debounce event log untuk /frame (server-wide)
_last_label: Optional[str] = None
_last_log_ts: float = 0.0


def _get_or_load_model():
    """Load LBPH model dengan cache sederhana (mtime + threshold)."""
    global _cached_model, _cached_mtime, _cached_threshold

    threshold = face_engine.get_env_float("LBPH_THRESHOLD", 60.0)
    model_path = face_engine.MODEL_PATH
    mtime = model_path.stat().st_mtime if model_path.exists() else 0.0

    if _cached_model is not None and _cached_mtime == mtime and _cached_threshold == threshold:
        return _cached_model, threshold

    # Model belum ada? coba train sekali.
    if not model_path.exists():
        max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
        face_engine.train_lbph_model(max_images_per_person=max_imgs)
        mtime = model_path.stat().st_mtime if model_path.exists() else 0.0

    model = face_engine.load_lbph_model(threshold=threshold)
    _cached_model = model
    _cached_mtime = mtime
    _cached_threshold = threshold
    return model, threshold


def _decode_frame_bytes() -> Optional[bytes]:
    """Ambil bytes frame dari JSON dataURL atau multipart."""
    # Multipart
    if "frame" in request.files:
        f = request.files["frame"]
        return f.read()

    # JSON dataURL
    payload = request.get_json(silent=True) or {}
    data_url = payload.get("image")
    if not data_url or not isinstance(data_url, str):
        return None

    # data:image/jpeg;base64,...
    m = re.match(r"^data:image/\w+;base64,(.*)$", data_url)
    if not m:
        return None
    b64 = m.group(1)
    try:
        return base64.b64decode(b64)
    except Exception:
        return None


@recognition_bp.route("/recognition/status", methods=["GET"])
def recognition_status():
    return jsonify(_worker.status()), 200


@recognition_bp.route("/recognition/start", methods=["POST"])
def recognition_start():
    payload = request.get_json(silent=True) or {}
    source = payload.get("source")

    started = _worker.start(source=source)
    if not started:
        return jsonify({"message": "Worker sudah berjalan", **_worker.status()}), 409

    return jsonify({"message": "Worker dimulai", **_worker.status()}), 200


@recognition_bp.route("/recognition/stop", methods=["POST"])
def recognition_stop():
    stopped = _worker.stop()
    if not stopped:
        return jsonify({"message": "Worker belum berjalan", **_worker.status()}), 409

    return jsonify({"message": "Worker dihentikan", **_worker.status()}), 200


@recognition_bp.route("/recognition/frame", methods=["POST"])
def recognition_frame():
    """Realtime recognition dari frame yang dikirim browser.

    Return JSON:
      - detected: bool
      - name: display_name (atau "Unknown")
      - status: "MASUK" / "DITOLAK"
      - confidence: float
    """

    if request.content_length is not None and request.content_length > 10 * 1024 * 1024:
        return jsonify({"message": "Frame terlalu besar", "error": "PayloadTooLarge"}), 413

    b = _decode_frame_bytes()
    if not b:
        return jsonify({"message": "Frame tidak ditemukan. Kirim field 'image' (dataURL) atau file 'frame'."}), 400

    try:
        import numpy as np
        import cv2
    except Exception as e:
        return jsonify({"message": f"OpenCV/Numpy belum tersedia: {e}"}), 500

    arr = np.frombuffer(b, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"message": "Gagal decode gambar"}), 400

    faces = face_engine.detect_faces_gray(frame)
    if not faces:
        return jsonify({"detected": False, "faces": [], "image_size": {"w": int(frame.shape[1]), "h": int(frame.shape[0])}}), 200

    # Model + prediksi
    try:
        model, _thr = _get_or_load_model()
    except Exception as e:
        return jsonify({"message": f"Model belum siap: {e}"}), 500

    residents = get_all_residents()
    safe_to_display = {
        face_engine.make_safe_name(r["name"]): r["name"]
        for r in residents
        if r.get("name")
    }

    face_results = []
    # Tentukan "primary" face untuk status summary + logging (pakai wajah terbesar)
    primary_idx = max(range(len(faces)), key=lambda i: faces[i][1][2] * faces[i][1][3])
    primary_name = "Unknown"
    primary_status = "DITOLAK"
    primary_conf = 9999.0

    for i, (face_gray, bbox) in enumerate(faces):
        label, conf, is_unknown = face_engine.predict_face(face_gray, model)

        if is_unknown:
            display_name = "Unknown"
            status = "DITOLAK"
            known = False
        else:
            display_name = safe_to_display.get(label, label.replace("_", " "))
            status = "MASUK"
            known = True

        item = {
            "bbox": {"x": int(bbox[0]), "y": int(bbox[1]), "w": int(bbox[2]), "h": int(bbox[3])},
            "name": display_name,
            "status": status,
            "confidence": float(conf),
            "known": bool(known),
        }
        face_results.append(item)

        if i == primary_idx:
            primary_name = display_name
            primary_status = status
            primary_conf = float(conf)

    # Simpan event log (debounce)
    global _last_label, _last_log_ts
    now = time.time()
    min_interval = face_engine.get_env_float("MIN_LOG_INTERVAL_SECONDS", 3.0)
    if (primary_name != _last_label) or ((now - _last_log_ts) >= min_interval):
        snapshot_path = None
        # Simpan snapshot hanya untuk UNKNOWN agar storage lebih hemat
        if (str(primary_name).strip().lower() == "unknown") or (primary_status == "DITOLAK"):
            try:
                snapshot_path = face_engine.save_snapshot(frame, "Unknown")
            except Exception:
                snapshot_path = None
        add_event(primary_name, primary_status, float(primary_conf), snapshot_path)
        _last_label = primary_name
        _last_log_ts = now

    return jsonify({
        "detected": True,
        "name": primary_name,
        "status": primary_status,
        "confidence": float(primary_conf),
        "faces": face_results,
        "image_size": {"w": int(frame.shape[1]), "h": int(frame.shape[0])},
    }), 200

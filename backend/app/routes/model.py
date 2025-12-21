"""Route untuk training & status model.

UI versi sekarang belum punya tombol "Train", jadi endpoint ini berguna untuk:
- trigger training manual (POST /api/train)
- mengecek apakah model sudah tersedia (GET /api/model/status)

Training memakai LBPH agar ringan (MVP), sesuai alur proposal yang butuh
'pipeline pengenalan + event log'.
"""

from __future__ import annotations

import os
import time

from flask import Blueprint, jsonify, request

from .. import face_engine

model_bp = Blueprint("model", __name__)


@model_bp.route("/model/status", methods=["GET"])
def model_status():
    """GET /api/model/status"""
    face_engine.ensure_dirs()

    model_exists = face_engine.MODEL_PATH.exists()
    labels_exists = face_engine.LABELS_PATH.exists()

    info = {
        "model_exists": model_exists,
        "labels_exists": labels_exists,
        "model_path": str(face_engine.MODEL_PATH),
        "labels_path": str(face_engine.LABELS_PATH),
        "lbph_threshold": face_engine.get_env_float("LBPH_THRESHOLD", 60.0),
        "max_train_images_per_person": face_engine.get_env_int(
            "MAX_TRAIN_IMAGES_PER_PERSON", 200
        ),
    }

    if model_exists:
        info["model_mtime"] = int(os.path.getmtime(face_engine.MODEL_PATH))
    if labels_exists:
        info["labels_mtime"] = int(os.path.getmtime(face_engine.LABELS_PATH))

    return jsonify(info), 200


@model_bp.route("/train", methods=["POST"])
def train_model():
    """POST /api/train

    Body JSON opsional:
    - max_images_per_person: int
    """
    payload = request.get_json(silent=True) or {}
    max_imgs = payload.get("max_images_per_person")

    if max_imgs is None:
        max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)

    try:
        max_imgs = int(max_imgs)
    except Exception:
        max_imgs = 200

    max_imgs = max(10, min(max_imgs, 2000))

    try:
        started = time.time()
        summary = face_engine.train_lbph_model(max_images_per_person=max_imgs)
        summary["elapsed_seconds"] = round(time.time() - started, 3)
        return jsonify({"message": "Training selesai", "summary": summary}), 200
    except Exception as e:
        return jsonify({"message": f"Training gagal: {e}"}), 500

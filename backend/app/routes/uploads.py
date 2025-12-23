"""backend/app/routes/uploads.py

Endpoint utama yang dipakai UI:
- POST /api/upload/faces

UI akan mengirim:
- form field: name
- files: faces (banyak file)

Di versi MVP ini, kita menggunakan logika dari backend awal:
- OpenCV Haar cascade untuk deteksi wajah
- crop & resize ke 200x200
- simpan hasil crop (grayscale) sebagai dataset untuk training LBPH

Agar UI tetap konsisten, kita mengembalikan `face_count` sebagai total file
wajah yang tersimpan di folder penghuni setelah upload.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from .. import face_engine

upload_bp = Blueprint("uploads", __name__)


@upload_bp.route("/upload/faces", methods=["POST"])
def upload_faces():
    """Endpoint: POST /api/upload/faces"""

    resident_name = request.form.get("name")
    files = request.files.getlist("faces")

    if not resident_name or not files:
        return jsonify({"message": "Error: Nama penghuni dan file wajah diperlukan."}), 400

    # Opsional: control training via query param ?train=0
    train_flag = request.args.get("train", "1").lower() not in {"0", "false", "no"}

    def iter_bytes():
        for f in files:
            if not f or not getattr(f, "filename", None):
                continue
            try:
                yield f.read()
            except Exception:
                continue

    try:
        result = face_engine.save_processed_faces(resident_name, iter_bytes())
    except Exception as e:
        return jsonify({"message": f"Gagal memproses upload: {e}"}), 500

    if int(result.get("saved", 0)) == 0:
        # Tidak ada wajah yang terdeteksi dari semua frame
        return jsonify(
            {
                "message": (
                    "Tidak ada wajah yang terdeteksi pada gambar yang diunggah. "
                    "Pastikan wajah terlihat jelas dan pencahayaan cukup."
                ),
                "resident_name": resident_name,
                "face_count": int(result.get("total", 0)),
                "saved": int(result.get("saved", 0)),
                "skipped": int(result.get("skipped", 0)),
            }
        ), 422

    training_summary = None
    training_error = None

    if train_flag:
        try:
            max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
            training_summary = face_engine.train_lbph_model(max_images_per_person=max_imgs)
        except Exception as e:
            # Training gagal tidak memblokir upload; kirim sebagai warning.
            training_error = str(e)

    msg = (
        f"Berhasil memproses {result['saved']} wajah (skip {result['skipped']}) untuk {resident_name}."
    )
    if training_error:
        msg += f" Namun training model gagal: {training_error}"

    return (
        jsonify(
            {
                "message": msg,
                "resident_name": result.get("resident_name"),
                "safe_name": result.get("safe_name"),
                "saved": int(result.get("saved", 0)),
                "skipped": int(result.get("skipped", 0)),
                "face_count": int(result.get("total", 0)),
                "training": training_summary,
                "training_error": training_error,
            }
        ),
        201,
    )

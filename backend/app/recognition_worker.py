"""Background worker untuk realtime recognition.

Tujuan:
- Membaca stream kamera lokal (default webcam index 0) atau RTSP
- Deteksi wajah -> prediksi -> simpan event log (events table)
- Simpan snapshot ke dataset/snapshots

Worker ini optional: Anda bisa menyalakan/mematikan via endpoint:
- POST /api/recognition/start
- POST /api/recognition/stop
- GET /api/recognition/status
"""

from __future__ import annotations

import threading
import time
from typing import Any, Optional, Union

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

from . import face_engine
from .database import add_event, get_all_residents


def _parse_source(value: Any) -> Union[int, str]:
    """Parse sumber kamera.

    - "0" -> 0
    - 0 -> 0
    - "rtsp://..." -> "rtsp://..."
    """
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    s = str(value).strip()
    if s.isdigit():
        return int(s)
    return s


class RecognitionWorker:
    def __init__(self, source: Union[int, str] = 0):
        self.source: Union[int, str] = _parse_source(source)

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self.running: bool = False
        self.last_error: Optional[str] = None

        self._last_label: Optional[str] = None
        self._last_log_ts: float = 0.0

    def start(self, source: Any = None) -> bool:
        if self.running:
            return False

        self.last_error = None
        if source is not None:
            self.source = _parse_source(source)

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self.running = True
        return True

    def stop(self) -> bool:
        if not self.running:
            return False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2)
        self.running = False
        return True

    def status(self):
        return {
            "running": self.running,
            "source": self.source,
            "last_error": self.last_error,
        }

    def _run(self):
        if cv2 is None:
            self.last_error = "OpenCV belum tersedia. Install opencv-contrib-python."
            self.running = False
            return

        cap = None
        try:
            cap = cv2.VideoCapture(self.source)
            if not cap.isOpened():
                self.last_error = f"Gagal membuka kamera/stream: {self.source}"
                self.running = False
                return

            # Pastikan model tersedia
            try:
                threshold = face_engine.get_env_float("LBPH_THRESHOLD", 65.0)
                model = face_engine.load_lbph_model(threshold=threshold)
            except FileNotFoundError:
                # Coba training sekali jika model belum ada
                max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
                face_engine.train_lbph_model(max_images_per_person=max_imgs)
                threshold = face_engine.get_env_float("LBPH_THRESHOLD", 65.0)
                model = face_engine.load_lbph_model(threshold=threshold)

            # Map safe_name -> nama asli dari DB, supaya UI tampil rapi
            residents = get_all_residents()
            safe_to_display = {
                face_engine.make_safe_name(r["name"]): r["name"] for r in residents if r.get("name")
            }

            min_interval = face_engine.get_env_float("MIN_LOG_INTERVAL_SECONDS", 3.0)

            while not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.1)
                    continue

                detected = face_engine.detect_largest_face_gray(frame)
                if detected is None:
                    continue

                face_gray, _bbox = detected
                label, conf, is_unknown = face_engine.predict_face(face_gray, model)

                if is_unknown:
                    display_name = "Unknown"
                    status = "DITOLAK"
                else:
                    display_name = safe_to_display.get(label, label.replace("_", " "))
                    status = "MASUK"

                now = time.time()

                # Debounce event log
                if (
                    display_name != self._last_label
                    or (now - self._last_log_ts) >= min_interval
                ):
                    # Simpan snapshot hanya untuk UNKNOWN agar storage lebih hemat
                    snapshot_path = None
                    is_unknown = (str(display_name).strip().lower() == "unknown") or (status == "DITOLAK")
                    if is_unknown:
                        try:
                            snapshot_path = face_engine.save_snapshot(frame, "Unknown")
                        except Exception:
                            snapshot_path = None

                    add_event(display_name, status, conf, snapshot_path)

                    self._last_label = display_name
                    self._last_log_ts = now

                # kecilkan CPU usage
                time.sleep(0.05)

        except Exception as e:
            self.last_error = str(e)
        finally:
            try:
                if cap is not None:
                    cap.release()
            except Exception:
                pass
            self.running = False

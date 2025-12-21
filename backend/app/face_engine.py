"""Face recognition engine (LBPH + Haar cascade).

Modul ini mengintegrasikan "logika program" dari backend awal (OpenCV Haar + LBPH):
- Deteksi wajah dengan Haar cascade
- Normalisasi ukuran wajah (200x200)
- Training & prediksi menggunakan LBPH (cv2.face.LBPHFaceRecognizer)

Catatan:
- `cv2.face` membutuhkan paket **opencv-contrib-python**.
- Ini pendekatan MVP yang ringan; bisa ditingkatkan ke ArcFace/InsightFace (ONNXRuntime)
  sesuai proposal.
"""

from __future__ import annotations

import os
import pickle
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend
DATASET_DIR = BACKEND_DIR / "dataset"
FACES_DIR = DATASET_DIR / "faces"
MODELS_DIR = DATASET_DIR / "models"
SNAPSHOTS_DIR = DATASET_DIR / "snapshots"

MODEL_PATH = MODELS_DIR / "lbph_model.yml"
LABELS_PATH = MODELS_DIR / "labels.pkl"

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def ensure_dirs() -> None:
    """Pastikan folder dataset penting tersedia."""
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    FACES_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def make_safe_name(name: str) -> str:
    """Samakan format folder wajah dengan yang dipakai UI backend.

    Mengikuti pola di `routes/uploads.py` pada UI:
    - secure_filename
    - normalisasi underscore/spasi
    - hilangkan titik
    """
    safe = secure_filename(name)
    safe = safe.replace("_", " ").replace(".", "").strip().replace(" ", "_")
    return safe


_FACE_CASCADE = None


def _get_face_cascade():
    global _FACE_CASCADE
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")
    if _FACE_CASCADE is None:
        _FACE_CASCADE = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    return _FACE_CASCADE


def detect_largest_face_gray(
    img_bgr: np.ndarray,
    scale_factor: float = 1.3,
    min_neighbors: int = 5,
) -> Optional[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """Deteksi wajah terbesar, return face_gray (200x200) dan bbox."""
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")

    cascade = _get_face_cascade()
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    faces = cascade.detectMultiScale(gray, scale_factor, min_neighbors)
    if faces is None or len(faces) == 0:
        return None

    # Pilih wajah terbesar
    x, y, w, h = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    face = gray[y : y + h, x : x + w]

    # Normalisasi ukuran & sedikit normalisasi kontras
    face = cv2.resize(face, (200, 200))
    try:
        face = cv2.equalizeHist(face)
    except Exception:
        pass

    return face, (int(x), int(y), int(w), int(h))


def detect_faces_gray(
    img_bgr: np.ndarray,
    scale_factor: float = 1.3,
    min_neighbors: int = 5,
    min_size: tuple[int, int] = (60, 60),
) -> List[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """Deteksi semua wajah, return list (face_gray_200, bbox).

    - face_gray_200: grayscale 200x200 (equalizeHist jika tersedia)
    - bbox: (x, y, w, h) pada koordinat frame input

    Urutan list mengikuti hasil detektor (umumnya left->right), tetapi tidak dijamin.
    """
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")

    cascade = _get_face_cascade()
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=scale_factor,
        minNeighbors=min_neighbors,
        minSize=min_size,
    )
    if faces is None or len(faces) == 0:
        return []

    out: List[Tuple[np.ndarray, Tuple[int, int, int, int]]] = []
    for (x, y, w, h) in faces:
        face = gray[y : y + h, x : x + w]
        if face.size == 0:
            continue

        face_200 = cv2.resize(face, (200, 200))
        try:
            face_200 = cv2.equalizeHist(face_200)
        except Exception:
            pass

        out.append((face_200, (int(x), int(y), int(w), int(h))))

    return out


def _sample_paths(paths: List[Path], max_n: Optional[int]) -> List[Path]:
    if not max_n or max_n <= 0:
        return paths
    if len(paths) <= max_n:
        return paths

    # Ambil sampel merata supaya variasi pose/ekspresi tetap terwakili
    step = len(paths) / float(max_n)
    sampled: List[Path] = []
    for i in range(max_n):
        idx = int(i * step)
        if idx >= len(paths):
            idx = len(paths) - 1
        sampled.append(paths[idx])
    # Unikkan jika ada duplikasi akibat pembulatan
    out: List[Path] = []
    seen = set()
    for p in sampled:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def save_processed_faces(
    resident_name: str,
    image_bytes_iter: Iterable[bytes],
) -> Dict[str, object]:
    """Simpan wajah hasil crop ke dataset/faces/<safe_name>/.

    Mengembalikan:
    - saved: jumlah file yang benar-benar tersimpan (face terdeteksi)
    - skipped: jumlah file yang dilewati (decode gagal / face tidak terdeteksi)
    - total: total file wajah yang ada di folder setelah proses (bukan jumlah upload)
    """
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")

    ensure_dirs()

    safe_name = make_safe_name(resident_name)
    resident_dir = FACES_DIR / safe_name
    resident_dir.mkdir(parents=True, exist_ok=True)

    existing = len(
        [
            p
            for p in resident_dir.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS
        ]
    )

    saved = 0
    skipped = 0

    for b in image_bytes_iter:
        arr = np.frombuffer(b, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            skipped += 1
            continue

        detected = detect_largest_face_gray(img)
        if detected is None:
            skipped += 1
            continue

        face_gray, _bbox = detected

        idx = existing + saved + 1
        file_path = resident_dir / f"{safe_name}_{idx}.jpeg"

        ok = cv2.imwrite(str(file_path), face_gray)
        if not ok:
            skipped += 1
            continue

        saved += 1

    total = existing + saved

    return {
        "resident_name": resident_name,
        "safe_name": safe_name,
        "resident_dir": str(resident_dir),
        "saved": saved,
        "skipped": skipped,
        "total": total,
    }


def train_lbph_model(max_images_per_person: int = 200) -> Dict[str, object]:
    """Train model LBPH dari seluruh dataset/faces.

    Parameter:
    - max_images_per_person: batasi jumlah gambar per folder agar training tidak terlalu berat.

    Return dict berisi path model & ringkasan jumlah data.
    """
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")

    ensure_dirs()

    # Pastikan modul cv2.face ada (dari opencv-contrib)
    if not hasattr(cv2, "face"):
        raise RuntimeError(
            "cv2.face tidak ditemukan. Gunakan 'opencv-contrib-python', bukan 'opencv-python'."
        )

    recognizer = cv2.face.LBPHFaceRecognizer_create()

    current_id = 0
    label_ids: Dict[str, int] = {}
    x_train: List[np.ndarray] = []
    y_labels: List[int] = []

    # Folder per orang = 1 kelas
    person_dirs = [p for p in FACES_DIR.iterdir() if p.is_dir()]
    person_dirs.sort(key=lambda p: p.name.lower())

    for person_dir in person_dirs:
        label = person_dir.name
        if label not in label_ids:
            label_ids[label] = current_id
            current_id += 1
        id_ = label_ids[label]

        img_paths = [
            p
            for p in person_dir.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS
        ]
        img_paths.sort(key=lambda p: p.name)
        img_paths = _sample_paths(img_paths, max_images_per_person)

        for img_path in img_paths:
            img = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            img = cv2.resize(img, (200, 200))
            x_train.append(img)
            y_labels.append(id_)

    if not x_train:
        raise ValueError(
            "Dataset kosong: tidak ada wajah yang bisa dipakai training. "
            "Pastikan upload sudah berhasil dan wajah terdeteksi."
        )

    x_arr = np.array(x_train, dtype="uint8")
    y_arr = np.array(y_labels, dtype=np.int32)

    started = time.time()
    recognizer.train(x_arr, y_arr)
    train_seconds = time.time() - started

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    recognizer.write(str(MODEL_PATH))

    with open(LABELS_PATH, "wb") as f:
        pickle.dump(label_ids, f)

    return {
        "model_path": str(MODEL_PATH),
        "labels_path": str(LABELS_PATH),
        "num_classes": len(label_ids),
        "num_samples": len(x_train),
        "max_images_per_person": max_images_per_person,
        "train_seconds": round(train_seconds, 3),
        "label_ids": label_ids,
    }


@dataclass
class LoadedLBPHModel:
    recognizer: object
    id_to_label: Dict[int, str]
    threshold: float


def load_lbph_model(threshold: float = 60.0) -> LoadedLBPHModel:
    """Load model LBPH yang sudah dilatih."""
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")

    if not MODEL_PATH.exists() or not LABELS_PATH.exists():
        raise FileNotFoundError(
            "Model belum tersedia. Jalankan training terlebih dahulu (endpoint /api/train)."
        )

    if not hasattr(cv2, "face"):
        raise RuntimeError(
            "cv2.face tidak ditemukan. Gunakan 'opencv-contrib-python', bukan 'opencv-python'."
        )

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.read(str(MODEL_PATH))

    with open(LABELS_PATH, "rb") as f:
        label_ids: Dict[str, int] = pickle.load(f)

    id_to_label = {v: k for k, v in label_ids.items()}

    return LoadedLBPHModel(recognizer=recognizer, id_to_label=id_to_label, threshold=float(threshold))


def predict_face(
    face_gray_200: np.ndarray,
    model: LoadedLBPHModel,
) -> Tuple[str, float, bool]:
    """Prediksi 1 wajah (sudah grayscale 200x200).

    Return:
    - label: folder name (safe_name) atau 'Unknown'
    - confidence: nilai LBPH (semakin kecil semakin yakin)
    - is_unknown: True jika melewati threshold
    """
    pred_id, confidence = model.recognizer.predict(face_gray_200)
    confidence_f = float(confidence)

    if confidence_f >= model.threshold:
        return "Unknown", confidence_f, True

    label = model.id_to_label.get(int(pred_id), "Unknown")
    if label == "Unknown":
        return "Unknown", confidence_f, True

    return label, confidence_f, False


def save_snapshot(frame_bgr: np.ndarray, label: str) -> str:
    """Simpan snapshot untuk event log."""
    if cv2 is None:
        raise RuntimeError("OpenCV (cv2) belum tersedia. Install opencv-contrib-python.")

    ensure_dirs()
    ts = time.strftime("%Y%m%d_%H%M%S")
    safe_label = make_safe_name(label) if label else "event"
    filename = f"{ts}_{safe_label}.jpg"
    out_path = SNAPSHOTS_DIR / filename
    cv2.imwrite(str(out_path), frame_bgr)
    return str(out_path)


def get_env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def get_env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default

# HomeFace Guard (Integrasi UI + Backend Awal)

Projek ini menggabungkan:
- **UI** dari `ui.zip` (tanpa mengubah tampilan/layout)
- **Logika pengenalan wajah** dari `backed awal.zip` (OpenCV Haar + LBPH)

Fitur yang sudah dibuat (MVP):
- CRUD penghuni (residents) di SQLite
- Upload/scan wajah -> **deteksi wajah, crop, resize 200x200** -> simpan ke `backend/dataset/faces/`
- Training model LBPH otomatis setelah upload (best-effort)
- Realtime recognition worker (opsional) yang menulis **event log** ke tabel `events`
- Endpoint log: `GET /api/logs` agar halaman Dashboard/Log menampilkan data

> Catatan: sesuai proposal, aplikasi menargetkan pembedaan whitelist vs unknown serta menyimpan event (waktu, identitas/unknown, snapshot). Implementasi ini fokus ke versi LBPH (ringan) sebagai MVP.

---

## 1) Menjalankan Backend

Masuk ke folder backend:

```bash
cd backend
python -m pip install -r requirements.txt
python run.py
```

Backend jalan di:
- `http://127.0.0.1:5000`

Cek cepat:
- `http://127.0.0.1:5000/api/model/status`

---

## 2) Menjalankan Frontend

Buka folder `frontend` dengan Live Server, atau jalankan server statis sederhana:

```bash
cd frontend
python -m http.server 8000
```

Lalu buka:
- `http://127.0.0.1:8000/index.html`

---

## 3) Alur Pemakaian

1. Buka halaman **Akun**
2. Tambah penghuni:
   - Isi nama
   - (Opsional) Upload beberapa foto, atau tekan **Mulai Scan Wajah**
3. Setelah upload/scan:
   - Backend akan menyimpan wajah ter-crop dan mencoba training LBPH

---

## 4) Training Manual (Jika Perlu)

Jika ingin retrain manual:

```bash
curl -X POST http://127.0.0.1:5000/api/train \
  -H "Content-Type: application/json" \
  -d '{"max_images_per_person": 200}'
```

---

## 5) Menyalakan Realtime Recognition Worker (Opsional)

Worker akan membaca kamera lokal (default **webcam 0**) lalu menulis event ke database.

Start:

```bash
curl -X POST http://127.0.0.1:5000/api/recognition/start \
  -H "Content-Type: application/json" \
  -d '{"source": 0}'
```

Status:

```bash
curl http://127.0.0.1:5000/api/recognition/status
```

Stop:

```bash
curl -X POST http://127.0.0.1:5000/api/recognition/stop
```

Event log bisa diambil lewat:
- `GET http://127.0.0.1:5000/api/logs?limit=200`

---

## 6) Konfigurasi (Environment Variables)

- `LBPH_THRESHOLD` (default 60)
  - makin kecil = makin ketat (lebih banyak Unknown)
- `MAX_TRAIN_IMAGES_PER_PERSON` (default 200)
  - batasi sampel per orang agar training cepat
- `MIN_LOG_INTERVAL_SECONDS` (default 3)
  - debounce log agar tidak spam
- `CAMERA_SOURCE` (opsional)
  - contoh RTSP: `rtsp://user:pass@ip/stream`

Contoh di Linux/Mac:

```bash
export LBPH_THRESHOLD=55
export MAX_TRAIN_IMAGES_PER_PERSON=150
python run.py
```

---

## Catatan Pengembangan Lanjutan

Sesuai proposal, versi lanjut dapat ditingkatkan ke:
- Deteksi wajah yang lebih akurat (YOLO-Face/RetinaFace)
- Embedding ArcFace/InsightFace (ONNXRuntime)
- Notifikasi (Telegram/Email)
- Streaming RTSP -> WebRTC/HLS/MJPEG untuk live preview

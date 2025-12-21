# backend/app/database.py
import sqlite3
import os

DATABASE_NAME = 'residents.db'
# Tentukan path database relatif terhadap lokasi main.py
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), DATABASE_NAME)

def get_db_connection():
    """Membuat dan mengembalikan koneksi ke database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Menginisialisasi tabel Residents & Events.

    Catatan:
    - Skema dibuat ringan (SQLite) untuk MVP.
    - Ada migrasi sederhana (ALTER TABLE) untuk kolom baru.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Pastikan Tabel Utama dibuat
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            role TEXT,
            face_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 1b. Tabel Events (Log aktivitas deteksi)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL,
            snapshot_path TEXT
        );
    """)

    # 1c. Tabel Users (Login/Registrasi akun sederhana)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'ADMIN',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # 2. PERBAIKAN KRITIS: Tambahkan kolom face_count jika belum ada (MIGRASI SKEMA)
    try:
        cursor.execute("SELECT face_count FROM residents LIMIT 1")
    except sqlite3.OperationalError:
        # Kolom tidak ditemukan, tambahkan
        cursor.execute("ALTER TABLE residents ADD COLUMN face_count INTEGER DEFAULT 0")
        print("Database SKEMA DIPERBAIKI: Kolom 'face_count' ditambahkan.")

    # 3. Migrasi untuk events (jaga-jaga jika tabel events versi lama)
    #    Saat ini tidak ada migrasi tambahan, tapi blok ini disediakan untuk perluasan.

    conn.commit()
    conn.close()
    print(f"Database {DATABASE_NAME} siap di: {DB_PATH}")


def add_event(name: str, status: str, confidence: float | None = None, snapshot_path: str | None = None) -> int | None:
    """Simpan satu event log ke tabel events."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO events (name, status, confidence, snapshot_path) VALUES (?, ?, ?, ?)",
            (name, status, confidence, snapshot_path),
        )
        conn.commit()
        event_id = cursor.lastrowid
        conn.close()
        return event_id
    except Exception as e:
        print(f"Database Event Error: {e}")
        conn.close()
        return None


def get_all_events(limit: int = 200):
    """Ambil daftar event log terbaru."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, timestamp, name, status, confidence, snapshot_path FROM events ORDER BY datetime(timestamp) DESC, id DESC LIMIT ?",
        (limit,),
    )
    events_data = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return events_data


def get_event_by_id(event_id: int):
    """Ambil 1 event berdasarkan id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, timestamp, name, status, confidence, snapshot_path FROM events WHERE id = ?",
        (event_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_resident(name, role, face_count):
    """Menyimpan data penghuni baru ke database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO residents (name, role, face_count) VALUES (?, ?, ?)",
            (name, role, face_count)
        )
        conn.commit()
        resident_id = cursor.lastrowid
        conn.close()
        return resident_id
    except sqlite3.IntegrityError:
        conn.close()
        return None # Nama sudah ada
    except Exception as e:
        print(f"Database Error: {e}")
        conn.close()
        return None

def get_resident_by_id(resident_id):
    """Mengambil data penghuni berdasarkan ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, role, face_count, created_at FROM residents WHERE id = ?", (resident_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_residents():
    """Mengambil semua data penghuni."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, role, face_count, created_at FROM residents ORDER BY id DESC")
    residents_data = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return residents_data

def update_resident(resident_id, name, role, face_count):
    """Memperbarui data penghuni."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE residents SET name = ?, role = ?, face_count = ? WHERE id = ?",
            (name, role, face_count, resident_id)
        )
        conn.commit()
        conn.close()
        return cursor.rowcount > 0 # Mengembalikan True jika ada baris yang diupdate
    except sqlite3.IntegrityError:
        conn.close()
        return False # Duplikasi nama
    except Exception as e:
        print(f"Database Update Error: {e}")
        conn.close()
        return False

def delete_resident(resident_id):
    """Menghapus data penghuni."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM residents WHERE id = ?", (resident_id,))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0 # Mengembalikan True jika ada baris yang dihapus


# ==========================
# USERS (AUTH)
# ==========================

def add_user(name: str, email: str, password_hash: str, role: str = 'ADMIN') -> int | None:
    """Menyimpan user baru ke database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (name, email.lower().strip(), password_hash, role),
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        return None
    except Exception as e:
        print(f"Database User Error: {e}")
        conn.close()
        return None


def get_user_by_email(email: str):
    """Ambil user berdasarkan email."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?",
        (email.lower().strip(),),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
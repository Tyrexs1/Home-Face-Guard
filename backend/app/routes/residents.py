# backend/app/routes/residents.py
from flask import Blueprint, request, jsonify
from ..database import add_resident, get_all_residents, get_resident_by_id, update_resident, delete_resident
import os
import shutil 
import traceback 
from werkzeug.utils import secure_filename

from .. import face_engine

residents_bp = Blueprint('residents', __name__)

# Tentukan path ke folder 'dataset/faces/'
FACES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'dataset', 'faces'))


def make_safe_name(name: str) -> str:
    """Samakan dengan logic di uploads.py supaya folder konsisten."""
    return secure_filename(name).replace('_', ' ').replace('.', '').strip().replace(' ', '_')

def delete_face_dataset(name):
    """Menghapus folder dataset wajah berdasarkan nama penghuni."""
    safe_name = make_safe_name(name)
    resident_dir = os.path.join(FACES_DIR, safe_name)
    
    if os.path.isdir(resident_dir):
        try:
            shutil.rmtree(resident_dir)
            print(f"DATASET WAJAH DIHAPUS: {resident_dir}")
            return True
        except Exception as e:
            print(f"Gagal menghapus folder dataset {resident_dir}: {e}")
            return False
    return True # Sudah tidak ada, jadi sukses

# --- ENDPOINT: DELETE DATASET SAJA ---
@residents_bp.route('/residents/dataset/<name>', methods=['DELETE'])
def delete_resident_dataset_only(name):
    """Endpoint: DELETE /api/residents/dataset/<name> (Hapus dataset, JANGAN HAPUS metadata DB)"""
    
    if delete_face_dataset(name):
        # retrain model (best-effort)
        try:
            max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
            face_engine.train_lbph_model(max_images_per_person=max_imgs)
        except Exception as _e:
            pass
        return jsonify({
            "message": f"Dataset wajah untuk '{name}' berhasil dihapus. Silakan tekan 'Simpan Perubahan' untuk memperbarui status di database.",
            "name": name,
            "face_count": 0
        }), 200
    else:
        return jsonify({"message": "Gagal menghapus dataset wajah di server."}), 500


@residents_bp.route('/check_dataset/<name>', methods=['GET'])
def check_dataset(name):
    """Endpoint: GET /api/check_dataset/<name>"""
    safe_name = make_safe_name(name)
    resident_dir = os.path.join(FACES_DIR, safe_name)
    
    face_count = 0
    if os.path.isdir(resident_dir):
        face_count = len([f for f in os.listdir(resident_dir) if os.path.isfile(os.path.join(resident_dir, f))])
    
    return jsonify({
        "name": name,
        "exists": face_count > 0,
        "face_count": face_count
    }), 200

# GET All Residents
@residents_bp.route('/residents', methods=['GET']) 
def list_residents():
    """Endpoint: GET /api/residents (Mengambil semua penghuni)"""
    try:
        residents_list = get_all_residents()
        return jsonify(residents_list), 200
    except Exception as e:
        print("------------------------------------------------------------------")
        print("!!! ERROR FATAL SAAT MENGAMBIL DAFTAR PENGHUNI (GET /api/residents) !!!")
        traceback.print_exc()
        print(f"Error: {e}")
        print("------------------------------------------------------------------")
        return jsonify({"message": "Gagal mengambil daftar penghuni. Lihat konsol backend untuk detail."}), 500

# POST New Resident
@residents_bp.route('/residents', methods=['POST'])
def create_resident():
    """Endpoint: POST /api/residents (Menyimpan metadata ke DB)"""
    
    data = request.get_json()
    
    name = data.get('name')
    role = data.get('role', 'Penghuni') # ROLE DEFAULT: Penghuni
    face_count = int(data.get('face_count', 0)) 
    
    if not name:
        return jsonify({"message": "Nama penghuni diperlukan."}), 400

    resident_id = add_resident(name, role, face_count)
    
    if resident_id is None:
        return jsonify({"message": "Penghuni dengan nama tersebut sudah terdaftar."}), 409

    # best-effort retrain jika memang ada dataset wajah
    try:
        if face_count and int(face_count) > 0:
            max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
            face_engine.train_lbph_model(max_images_per_person=max_imgs)
    except Exception as _e:
        pass

    return jsonify({
        "message": "Penghuni berhasil didaftarkan.",
        "id": resident_id,
        "name": name,
        "face_count": face_count
    }), 201

# GET Single Resident
@residents_bp.route('/residents/<int:resident_id>', methods=['GET'])
def get_resident(resident_id):
    """Endpoint: GET /api/residents/<id> (Mengambil data satu penghuni)"""
    resident = get_resident_by_id(resident_id)
    if resident is None:
        return jsonify({"message": "Penghuni tidak ditemukan."}), 404
    return jsonify(resident), 200

# PUT/PATCH Update Resident
@residents_bp.route('/residents/<int:resident_id>', methods=['PUT', 'PATCH'])
def update_resident_data(resident_id):
    """Endpoint: PUT/PATCH /api/residents/<id> (Memperbarui metadata ke DB)"""
    data = request.get_json()
    
    existing_resident = get_resident_by_id(resident_id)
    if existing_resident is None:
        return jsonify({"message": "Penghuni tidak ditemukan."}), 404
    
    name = data.get('name', existing_resident['name'])
    role = data.get('role', existing_resident['role']) # Role dipertahankan dari yang sudah ada
    face_count = data.get('face_count', existing_resident['face_count'])
    
    try:
        face_count = int(face_count)
    except ValueError:
        return jsonify({"message": "face_count harus berupa angka."}), 400

    # --- Jika nama berubah, rename folder dataset supaya tetap sinkron ---
    old_name = existing_resident.get('name')
    name_changed = old_name != name

    if name_changed:
        try:
            old_safe = make_safe_name(old_name)
            new_safe = make_safe_name(name)
            old_dir = os.path.join(FACES_DIR, old_safe)
            new_dir = os.path.join(FACES_DIR, new_safe)

            if os.path.isdir(old_dir) and not os.path.exists(new_dir):
                os.rename(old_dir, new_dir)
                print(f"DATASET DIR RENAMED: {old_dir} -> {new_dir}")
        except Exception as e:
            print(f"Gagal rename folder dataset saat update nama: {e}")

    if update_resident(resident_id, name, role, face_count):
        # best-effort retrain jika dataset berubah
        try:
            if name_changed or face_count != int(existing_resident.get('face_count') or 0):
                max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
                face_engine.train_lbph_model(max_images_per_person=max_imgs)
        except Exception as _e:
            pass
        return jsonify({
            "message": "Penghuni berhasil diperbarui.",
            "id": resident_id,
            "name": name,
            "face_count": face_count
        }), 200
    else:
        return jsonify({"message": "Gagal memperbarui penghuni (nama mungkin sudah terdaftar)."}), 409

# DELETE Resident
@residents_bp.route('/residents/<int:resident_id>', methods=['DELETE'])
def delete_resident_data(resident_id):
    """Endpoint: DELETE /api/residents/<id> (Menghapus metadata dan dataset)"""
    resident = get_resident_by_id(resident_id)
    if resident is None:
        return jsonify({"message": "Penghuni tidak ditemukan."}), 404

    # 1. Hapus Folder Dataset Wajah
    delete_face_dataset(resident['name'])
    
    # 2. Hapus Metadata dari DB
    if delete_resident(resident_id):
        # retrain model (best-effort)
        try:
            max_imgs = face_engine.get_env_int("MAX_TRAIN_IMAGES_PER_PERSON", 200)
            face_engine.train_lbph_model(max_images_per_person=max_imgs)
        except Exception as _e:
            pass
        return jsonify({
            "message": f"Penghuni {resident['name']} dan datasetnya berhasil dihapus.",
            "id": resident_id
        }), 200
    else:
        return jsonify({"message": "Gagal menghapus metadata penghuni dari database."}), 500
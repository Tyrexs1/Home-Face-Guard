"""Routes untuk Login & Registrasi akun sederhana.

Catatan penting:
- Ini versi ringan untuk demo/local.
- Untuk produksi, gunakan JWT/session + HTTPS + rate limit.
"""

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash

from ..database import add_user, get_user_by_email


auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/auth/register', methods=['POST'])
def register():
    """Endpoint: POST /api/auth/register

    Body JSON:
    - name
    - email
    - password
    """
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not name:
        return jsonify({'message': 'Nama wajib diisi.'}), 400
    if not email or '@' not in email:
        return jsonify({'message': 'Email tidak valid.'}), 400
    if not password or len(password) < 6:
        return jsonify({'message': 'Password minimal 6 karakter.'}), 400

    if get_user_by_email(email):
        return jsonify({'message': 'Email sudah terdaftar.'}), 409

    pw_hash = generate_password_hash(password)
    user_id = add_user(name=name, email=email, password_hash=pw_hash, role='ADMIN')
    if not user_id:
        return jsonify({'message': 'Gagal registrasi akun.'}), 500

    return jsonify({
        'message': 'Registrasi berhasil.',
        'user': {
            'id': user_id,
            'name': name,
            'email': email,
            'role': 'ADMIN',
        }
    }), 201


@auth_bp.route('/auth/login', methods=['POST'])
def login():
    """Endpoint: POST /api/auth/login

    Body JSON:
    - email
    - password
    """
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'message': 'Email dan password wajib diisi.'}), 400

    user = get_user_by_email(email)
    if not user:
        return jsonify({'message': 'Email atau password salah.'}), 401

    if not check_password_hash(user.get('password_hash', ''), password):
        return jsonify({'message': 'Email atau password salah.'}), 401

    # NOTE: untuk demo, kita tidak menerbitkan token.
    return jsonify({
        'message': 'Login berhasil.',
        'user': {
            'id': user.get('id'),
            'name': user.get('name'),
            'email': user.get('email'),
            'role': user.get('role') or 'ADMIN'
        }
    }), 200

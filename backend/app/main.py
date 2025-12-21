# backend/app/main.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import os

from werkzeug.exceptions import HTTPException, RequestEntityTooLarge, BadRequest

from . import face_engine

# Import database utilities
from .database import init_db

# Import semua Blueprints (Routes)
from .routes.uploads import upload_bp
from .routes.residents import residents_bp
from .routes.events import events_bp 
from .routes.model import model_bp
from .routes.recognition import recognition_bp
from .routes.auth import auth_bp

def create_app():
    app = Flask(__name__)

    # ------------------------------------------------------------------
    # Batas parsing FormData (penting untuk fitur "Scan 1000 Sampel")
    # ------------------------------------------------------------------
    # Pada versi Flask/Werkzeug terbaru ada limit default jumlah "parts" form
    # (file + fields). Scan 1000 sampel dapat menghasilkan > 1000 parts dan
    # memicu 413/400 sebelum request masuk ke route.
    #
    # Kita naikkan batasnya untuk kebutuhan lokal (edge / dev).
    # Bisa di-override lewat environment variable.
    app.config["MAX_CONTENT_LENGTH"] = int(
        os.getenv("MAX_CONTENT_LENGTH", str(512 * 1024 * 1024))  # 512 MB
    )
    app.config["MAX_FORM_MEMORY_SIZE"] = int(
        os.getenv("MAX_FORM_MEMORY_SIZE", str(256 * 1024 * 1024))  # 256 MB
    )
    app.config["MAX_FORM_PARTS"] = int(os.getenv("MAX_FORM_PARTS", "8000"))
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Mendaftarkan Blueprints (Routes)
    app.register_blueprint(upload_bp, url_prefix='/api')
    app.register_blueprint(residents_bp, url_prefix='/api')
    app.register_blueprint(events_bp, url_prefix='/api') 
    app.register_blueprint(model_bp, url_prefix='/api')
    app.register_blueprint(recognition_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/api')

    @app.route('/')
    def index():
        return jsonify({"message": "HOME-FACE-GUARD Backend API Running"})

    # ------------------------------------------------------------------
    # Pastikan error untuk endpoint /api/* selalu JSON (bukan HTML)
    # agar frontend tidak gagal parsing ("Unexpected token '<'")
    # ------------------------------------------------------------------
    @app.errorhandler(RequestEntityTooLarge)
    def handle_413(e):
        if request.path.startswith("/api/"):
            return (
                jsonify(
                    {
                        "message": (
                            "Request terlalu besar. "
                            "Jika Anda menggunakan Scan 1000 sampel, gunakan mode upload bertahap (batch) "
                            "atau naikkan MAX_CONTENT_LENGTH/MAX_FORM_PARTS di backend."
                        ),
                        "error": "RequestEntityTooLarge",
                    }
                ),
                413,
            )
        return e

    @app.errorhandler(BadRequest)
    def handle_400(e):
        if request.path.startswith("/api/"):
            return jsonify({"message": f"Bad request: {e.description}", "error": "BadRequest"}), 400
        return e

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        # Default Flask untuk 404/405 adalah HTML; ubah jadi JSON untuk /api
        if request.path.startswith("/api/"):
            return jsonify({"message": e.description, "error": e.name, "status": e.code}), e.code
        return e

    # Inisialisasi Database
    with app.app_context():
        init_db()
        
    # Pastikan folder dataset (faces/models/snapshots) siap
    try:
        face_engine.ensure_dirs()
    except Exception as e:
        print(f"WARNING: Gagal inisialisasi folder dataset: {e}")
        
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
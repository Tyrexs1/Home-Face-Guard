# backend/app/main.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import os

from werkzeug.exceptions import HTTPException, RequestEntityTooLarge, BadRequest

from . import face_engine
from .database import init_db

from .routes.uploads import upload_bp
from .routes.residents import residents_bp
from .routes.events import events_bp
from .routes.model import model_bp
from .routes.recognition import recognition_bp
from .routes.auth import auth_bp


def create_app():
    app = Flask(__name__)

    # batas upload/form
    app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH", str(512 * 1024 * 1024)))
    app.config["MAX_FORM_MEMORY_SIZE"] = int(os.getenv("MAX_FORM_MEMORY_SIZE", str(256 * 1024 * 1024)))
    app.config["MAX_FORM_PARTS"] = int(os.getenv("MAX_FORM_PARTS", "8000"))

    # ✅ CORS (tanpa path, cukup origin domain)
    CORS(
        app,
        resources={r"/api/*": {"origins": [
            "https://homeface-guard.netlify.app",
            "https://*.netlify.app"
        ]}},
        supports_credentials=True
    )




    # routes
    app.register_blueprint(upload_bp, url_prefix="/api")
    app.register_blueprint(residents_bp, url_prefix="/api")
    app.register_blueprint(events_bp, url_prefix="/api")
    app.register_blueprint(model_bp, url_prefix="/api")
    app.register_blueprint(recognition_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")

    @app.route("/")
    def index():
        return jsonify({"message": "HOME-FACE-GUARD Backend API Running"})

    @app.errorhandler(RequestEntityTooLarge)
    def handle_413(e):
        if request.path.startswith("/api/"):
            return jsonify({"message": "Request terlalu besar.", "error": "RequestEntityTooLarge"}), 413
        return e

    @app.errorhandler(BadRequest)
    def handle_400(e):
        if request.path.startswith("/api/"):
            return jsonify({"message": f"Bad request: {e.description}", "error": "BadRequest"}), 400
        return e

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        if request.path.startswith("/api/"):
            return jsonify({"message": e.description, "error": e.name, "status": e.code}), e.code
        return e

    with app.app_context():
        init_db()

    try:
        face_engine.ensure_dirs()
    except Exception as e:
        print(f"WARNING: Gagal inisialisasi folder dataset: {e}")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)

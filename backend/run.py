"""Entry point untuk menjalankan server Flask.

Cara pakai:
1) cd backend
2) pip install -r requirements.txt
3) python run.py

API berjalan di: http://127.0.0.1:5000
"""

from app.main import create_app


if __name__ == "__main__":
    app = create_app()
    # debug=True untuk pengembangan; matikan saat production
    app.run(host="0.0.0.0", port=5000, debug=True)

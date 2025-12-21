"""Routes untuk event log (riwayat deteksi) + akses snapshot."""

from __future__ import annotations

from pathlib import Path

from flask import Blueprint, abort, jsonify, request, send_from_directory

from .. import face_engine
from ..database import get_all_events, get_event_by_id

events_bp = Blueprint("events", __name__)


def _make_snapshot_url(snapshot_path: str | None) -> str | None:
    """Ubah path lokal snapshot menjadi URL yang bisa diakses UI."""
    if not snapshot_path:
        return None
    try:
        filename = Path(snapshot_path).name
        base = request.host_url.rstrip("/")
        return f"{base}/api/snapshots/{filename}"
    except Exception:
        return None


def _make_category(name: str | None, status: str | None) -> str:
    """Kategori sederhana: PENGHUNI vs UNKNOWN."""
    nm = (name or "").strip()
    if nm and nm.lower() != "unknown" and (status or "").upper() == "MASUK":
        return "PENGHUNI"
    return "UNKNOWN"


@events_bp.route("/logs", methods=["GET"])
def get_logs():
    """Endpoint: GET /api/logs

    Query params:
    - limit (int, optional): jumlah data terbaru yang diambil
    """
    try:
        limit = int(request.args.get("limit", 200))
    except ValueError:
        limit = 200
    limit = max(1, min(limit, 1000))

    events = get_all_events(limit=limit)

    out = []
    for e in events:
        item = dict(e)

        # snapshot_url untuk UNKNOWN saja (PENGHUNI hemat storage)
        category = _make_category(item.get("name"), item.get("status"))
        item["category"] = category
        if category == "UNKNOWN":
            item["snapshot_url"] = _make_snapshot_url(item.get("snapshot_path"))
        else:
            item["snapshot_url"] = None

        out.append(item)

    return jsonify(out), 200


@events_bp.route("/events/<int:event_id>", methods=["GET"])
def get_event_detail(event_id: int):
    """Detail 1 event untuk tombol 'Lihat Detail'."""
    e = get_event_by_id(event_id)
    if not e:
        return jsonify({"message": "Event tidak ditemukan"}), 404

    item = dict(e)

    category = _make_category(item.get("name"), item.get("status"))
    item["category"] = category
    if category == "UNKNOWN":
        item["snapshot_url"] = _make_snapshot_url(item.get("snapshot_path"))
    else:
        item["snapshot_url"] = None

    return jsonify(item), 200


@events_bp.route("/snapshots/<path:filename>", methods=["GET"])
def serve_snapshot(filename: str):
    """Serve file snapshot dari dataset/snapshots."""
    face_engine.ensure_dirs()
    snapshots_dir = face_engine.SNAPSHOTS_DIR
    fpath = snapshots_dir / filename
    if not fpath.exists() or not fpath.is_file():
        abort(404)
    return send_from_directory(str(snapshots_dir), filename)

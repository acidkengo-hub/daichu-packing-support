"""
Production server entry point.
Imports the FastAPI app from main.py (which registers all API routes),
then adds static file serving for the built React frontend.

Usage:
    python serve.py
    python -m uvicorn serve:app --host 0.0.0.0 --port 8000
"""
import os
import socket

from main import app                       # registers all /api/* routes first
from fastapi.responses import FileResponse  # noqa: E402

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


def _get_local_ip() -> str:
    """Get the LAN IP address of this machine."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# --- Static file serving (only if build output exists) ---
if os.path.isdir(STATIC_DIR):

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

else:
    print(f"[WARN] Static directory not found: {STATIC_DIR}")
    print("[WARN] Run setup.bat first to build the frontend.")


if __name__ == "__main__":
    import uvicorn

    local_ip = _get_local_ip()
    print()
    print("=" * 48)
    print("  DAICHU PACKING SUPPORT")
    print("=" * 48)
    print(f"  Local:  http://localhost:8000")
    print(f"  iPad:   http://{local_ip}:8000")
    print()
    print("  Press Ctrl+C to stop.")
    print("=" * 48)
    print()

    uvicorn.run(app, host="0.0.0.0", port=8000)
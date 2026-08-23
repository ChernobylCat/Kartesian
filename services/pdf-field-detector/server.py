"""Dependency-light localhost HTTP wrapper for Kartesian's Python detector."""

from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from detector import DetectorUnavailable, detect_pdf, engine_status


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_PDF_BYTES = 25 * 1024 * 1024


def _allowed_origin(origin: str | None) -> bool:
    if not origin:
        return True
    parsed = urlparse(origin)
    allowed_hosts = {"127.0.0.1", "localhost", "::1"}
    extra = {value.strip() for value in os.getenv("KARTESIAN_ALLOWED_ORIGINS", "").split(",") if value.strip()}
    return origin in extra or parsed.scheme in {"http", "https"} and parsed.hostname in allowed_hosts


def _parse_pages(raw: str, maximum: int = 10_000) -> set[int]:
    pages: set[int] = set()
    for value in raw.split(","):
        if not value.strip():
            continue
        page = int(value)
        if page < 1 or page > maximum:
            raise ValueError("Nomor halaman tidak valid.")
        pages.add(page)
    return pages


class DetectorHandler(BaseHTTPRequestHandler):
    server_version = "KartesianDetector/1.0"

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and _allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")

    def _json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802
        if not _allowed_origin(self.headers.get("Origin")):
            self._json(403, {"error": "Origin tidak diizinkan."})
            return
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/health":
            self._json(404, {"error": "Not found"})
            return
        if not _allowed_origin(self.headers.get("Origin")):
            self._json(403, {"error": "Origin tidak diizinkan."})
            return
        status = engine_status()
        self._json(200 if status["pymupdf"] else 503, {"status": "ok" if status["pymupdf"] else "degraded", **status})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/v1/detect":
            self._json(404, {"error": "Not found"})
            return
        if not _allowed_origin(self.headers.get("Origin")):
            self._json(403, {"error": "Origin tidak diizinkan."})
            return
        if self.headers.get_content_type() != "application/pdf":
            self._json(415, {"error": "Content-Type harus application/pdf."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_PDF_BYTES:
            self._json(413, {"error": "PDF kosong atau melebihi batas 25 MB."})
            return
        try:
            query = parse_qs(parsed.query)
            pages = _parse_pages(query.get("pages", [""])[0])
            ocr_mode = query.get("ocr", ["auto"])[0]
            if ocr_mode not in {"auto", "always", "never"}:
                raise ValueError("Mode OCR tidak valid.")
            engine_mode = query.get("mode", ["hybrid"])[0]
            if engine_mode not in {"hybrid", "pymupdf", "ocr"}:
                raise ValueError("Mode engine detector tidak valid.")
            payload = detect_pdf(self.rfile.read(length), pages or None, ocr_mode, engine_mode)
            self._json(200, payload)
        except (ValueError, DetectorUnavailable) as error:
            self._json(400, {"error": str(error)})
        except Exception as error:
            self.log_error("Detection failed: %s", error)
            self._json(500, {"error": "Detector lokal gagal memproses PDF."})

    def log_message(self, message: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {message % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Kartesian local PDF field detector")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    options = parser.parse_args()
    server = ThreadingHTTPServer((options.host, options.port), DetectorHandler)
    print(f"Kartesian detector listening on http://{options.host}:{options.port}")
    print(f"Engines: {engine_status()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

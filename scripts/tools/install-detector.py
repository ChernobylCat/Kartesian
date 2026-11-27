"""Install the optional local detector with an actionable Python-version check."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ocr", action="store_true", help="Install the PaddleOCR fallback too")
    options = parser.parse_args()
    version = sys.version_info[:2]
    if version < (3, 10):
        raise SystemExit("Kartesian detector memerlukan Python 3.10 atau lebih baru.")
    if options.ocr and version >= (3, 13):
        raise SystemExit(
            "PaddlePaddle belum menyediakan wheel resmi untuk Python 3.13+. "
            "Gunakan environment Python 3.10, 3.11, atau 3.12 untuk detector OCR."
        )
    root = Path(__file__).resolve().parents[2]
    filename = "requirements-ocr.txt" if options.ocr else "requirements.txt"
    requirements = root / "services" / "pdf-field-detector" / filename
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(requirements)])


if __name__ == "__main__":
    main()

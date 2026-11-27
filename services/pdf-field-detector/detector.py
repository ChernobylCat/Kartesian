"""Local PDF field detection using PyMuPDF with an optional PaddleOCR fallback."""

from __future__ import annotations

import os
import re
import threading
from dataclasses import dataclass
from typing import Any, Iterable

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24
    try:
        import fitz  # type: ignore[no-redef]
    except ImportError:
        fitz = None  # type: ignore[assignment]


PAPER_WIDTH_MM = 210.0
PAPER_HEIGHT_MM = 330.0
SEMANTIC_LABEL = re.compile(
    r"\b(?:nama|alamat|nomor|no\.?|tanggal|tempat|pekerjaan|jabatan|email|telepon|hp|"
    r"tanda\s*tangan|paraf|debitur|kreditur|suami|istri|materai)\b",
    re.IGNORECASE,
)
UNDERSCORE_FIELD = re.compile(r"[_\uFF3F\uFE4F]{2,}(?:\s*[/.-]\s*[_\uFF3F\uFE4F]{2,})*")


class DetectorUnavailable(RuntimeError):
    """Raised when the required local PDF engine is not installed."""


@dataclass(frozen=True)
class Box:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str = ""

    @property
    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)

    @property
    def center_x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def center_y(self) -> float:
        return (self.y0 + self.y1) / 2


def normalize_key(value: str, fallback: str = "field") -> str:
    value = re.sub(r"[_\s]*[:：._\-–—]+\s*$", "", str(value or ""))
    value = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return value or fallback


def clean_label(value: str) -> str:
    value = re.sub(r"[_.]{2,}", "", str(value or ""))
    value = re.sub(r"^\s*\d+(?:\.\d+)*(?:[.)])?\s*", "", value)
    value = re.sub(r"[\s:：._\-–—]+$", "", value).strip(" ,.;:'\"“”()[]/")
    value = re.sub(r"\s+", " ", value).strip()
    if not value or len(value) > 72 or len(value.split()) > 10 or not re.search(r"[a-zA-Z]", value):
        return ""
    if re.match(r"^(?:field|pasal|halaman)\b", value, re.IGNORECASE):
        return ""
    return value


def _page_scale(page_rect: Any) -> tuple[float, float]:
    width = max(1.0, float(page_rect.width))
    height = max(1.0, float(page_rect.height))
    return PAPER_WIDTH_MM / width, PAPER_HEIGHT_MM / height


def _candidate(page_number: int, source: str, index: int, label: str, box: Box,
               page_rect: Any, confidence: float) -> dict[str, Any] | None:
    label = clean_label(label)
    if not label:
        return None
    scale_x, scale_y = _page_scale(page_rect)
    x = max(0.0, min(PAPER_WIDTH_MM - 1, box.x0 * scale_x))
    y = max(0.0, min(PAPER_HEIGHT_MM - 1, box.y0 * scale_y))
    width = max(1.0, min(PAPER_WIDTH_MM - x, box.width * scale_x))
    height = max(1.0, min(PAPER_HEIGHT_MM - y, box.height * scale_y))
    key = normalize_key(label, f"field_{page_number}_{index + 1}")
    return {
        "id": f"pdf-field-p{page_number}-{source}-{index + 1}-{key}",
        "pageNumber": page_number,
        "source": source,
        "label": label,
        "key": key,
        "placeholder": "{{" + key + "}}",
        "x": round(x, 1),
        "y": round(y, 1),
        "width": round(width, 1),
        "height": round(height, 1),
        "confidence": round(max(0.0, min(1.0, confidence)), 2),
    }


def _visual_candidate(page: Any, page_number: int, source: str, index: int,
                      label: str, box: Box, confidence: float) -> dict[str, Any] | None:
    # PyMuPDF text/widget/vector coordinates are unrotated; pixmap OCR is
    # already visual and continues to call _candidate directly.
    rect = fitz.Rect(box.x0, box.y0, box.x1, box.y1) * page.rotation_matrix
    return _candidate(page_number, source, index, label,
                      Box(rect.x0, rect.y0, rect.x1, rect.y1), page.rect, confidence)


def _word_lines(page: Any) -> list[Box]:
    grouped: dict[tuple[int, int], list[tuple[Any, ...]]] = {}
    for word in page.get_text("words", sort=True) or []:
        if len(word) < 8 or not str(word[4]).strip():
            continue
        grouped.setdefault((int(word[5]), int(word[6])), []).append(word)
    lines: list[Box] = []
    for words in grouped.values():
        words.sort(key=lambda item: float(item[0]))
        lines.append(Box(
            min(float(word[0]) for word in words),
            min(float(word[1]) for word in words),
            max(float(word[2]) for word in words),
            max(float(word[3]) for word in words),
            " ".join(str(word[4]) for word in words).strip(),
        ))
    return sorted(lines, key=lambda line: (line.y0, line.x0))


def _nearest_label(shape: Box, lines: Iterable[Box]) -> str:
    choices: list[tuple[float, str]] = []
    for line in lines:
        label = clean_label(line.text)
        if not label:
            continue
        left_gap = shape.x0 - line.x1
        if -2 <= left_gap <= 90 and abs(shape.center_y - line.center_y) <= max(12, line.height):
            choices.append((abs(shape.center_y - line.center_y) + max(0, left_gap) * 0.15, label))
        above_gap = shape.y0 - line.y1
        if -1 <= above_gap <= 32 and abs(shape.x0 - line.x0) <= 75:
            choices.append((12 + max(0, above_gap) + abs(shape.x0 - line.x0) * 0.1, label))
        if SEMANTIC_LABEL.search(label) and 32 < above_gap <= 145 and abs(shape.center_x - line.center_x) <= max(55, shape.width * .45):
            choices.append((35 + above_gap * .2 + abs(shape.center_x - line.center_x) * .1, label))
    return min(choices, default=(0, ""), key=lambda item: item[0])[1]


def _extract_widgets(page: Any, page_number: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    widget = page.first_widget
    index = 0
    text_type = getattr(fitz, "PDF_WIDGET_TYPE_TEXT", 7)
    while widget:
        if widget.field_type == text_type:
            rect = widget.rect
            label = widget.field_name or widget.field_label or widget.field_value or f"Field {index + 1}"
            candidate = _visual_candidate(page, page_number, "pymupdf-acroform", index, label,
                                          Box(rect.x0, rect.y0, rect.x1, rect.y1), .98)
            if candidate:
                results.append(candidate)
            index += 1
        widget = widget.next
    return results


def _extract_underlines(page: Any, page_number: int, lines: list[Box]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for line_index, line in enumerate(lines):
        for match_index, match in enumerate(UNDERSCORE_FIELD.finditer(line.text)):
            start_ratio = match.start() / max(1, len(line.text))
            width_ratio = len(match.group(0)) / max(1, len(line.text))
            box = Box(
                line.x0 + line.width * start_ratio,
                line.y0,
                line.x0 + line.width * (start_ratio + width_ratio),
                max(line.y1, line.y0 + 8),
            )
            inline = clean_label(line.text[:match.start()].split("|")[-1])
            label = inline or _nearest_label(box, lines)
            candidate = _visual_candidate(page, page_number, "pymupdf-text", line_index + match_index,
                                          label, box, .74)
            if candidate:
                results.append(candidate)
    return results


def _shape_boxes(page: Any) -> list[Box]:
    shapes: list[Box] = []
    for drawing in page.get_drawings() or []:
        for item in drawing.get("items", []):
            kind = item[0]
            if kind == "l" and len(item) >= 3:
                first, second = item[1], item[2]
                x0, x1 = sorted((float(first.x), float(second.x)))
                y0, y1 = sorted((float(first.y), float(second.y)))
                if x1 - x0 >= 35 and y1 - y0 <= 3:
                    shapes.append(Box(x0, y0, x1, max(y0 + 1, y1)))
            elif kind in {"re", "qu"} and len(item) >= 2:
                rect = item[1].rect if hasattr(item[1], "rect") else item[1]
                box = Box(float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1))
                if 35 <= box.width <= page.cropbox.width * .95 and 8 <= box.height <= 140:
                    shapes.append(box)
    unique: list[Box] = []
    for shape in shapes:
        if not any(abs(shape.x0 - old.x0) < 1 and abs(shape.y0 - old.y0) < 1 and
                   abs(shape.x1 - old.x1) < 1 and abs(shape.y1 - old.y1) < 1 for old in unique):
            unique.append(shape)
    return unique


def _extract_vectors(page: Any, page_number: int, lines: list[Box]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, shape in enumerate(_shape_boxes(page)):
        label = _nearest_label(shape, lines)
        if not label:
            continue
        height = shape.height
        target = shape if height > 3 else Box(shape.x0, max(0, shape.y0 - 11), shape.x1, shape.y0 + 3)
        confidence = .7 if SEMANTIC_LABEL.search(label) else .64
        candidate = _visual_candidate(page, page_number, "pymupdf-vector", index, label, target, confidence)
        if candidate:
            results.append(candidate)
    return results


def _extract_tables(page: Any, page_number: int) -> list[dict[str, Any]]:
    if not hasattr(page, "find_tables"):
        return []
    results: list[dict[str, Any]] = []
    try:
        tables = page.find_tables()
    except Exception:
        return []
    index = 0
    for table in getattr(tables, "tables", []):
        matrix = table.extract()
        rows = getattr(table, "rows", [])
        for row_index, values in enumerate(matrix):
            cells = getattr(rows[row_index], "cells", []) if row_index < len(rows) else []
            for column in range(max(0, len(values) - 1)):
                label = clean_label(values[column] or "")
                value = str(values[column + 1] or "").strip()
                if not label or value or column + 1 >= len(cells) or not cells[column + 1]:
                    continue
                rect = cells[column + 1]
                candidate = _visual_candidate(page, page_number, "pymupdf-table", index, label,
                                              Box(*map(float, rect)), .86)
                if candidate:
                    results.append(candidate)
                    index += 1
    return results


_ocr_lock = threading.Lock()
_ocr_engine: Any = None


def _get_ocr_engine() -> Any:
    global _ocr_engine
    with _ocr_lock:
        if _ocr_engine is not None:
            return _ocr_engine
        from paddleocr import PaddleOCR
        language = os.getenv("KARTESIAN_OCR_LANG", "en")
        attempts = (
            {"lang": language, "use_doc_orientation_classify": False,
             "use_doc_unwarping": False, "use_textline_orientation": True},
            {"lang": language, "use_angle_cls": True, "show_log": False},
            {"lang": language},
        )
        last_error: Exception | None = None
        for options in attempts:
            try:
                _ocr_engine = PaddleOCR(**options)
                return _ocr_engine
            except (TypeError, ValueError) as error:
                last_error = error
        raise RuntimeError(f"PaddleOCR tidak dapat diinisialisasi: {last_error}")


def _walk_ocr(value: Any) -> Iterable[tuple[list[list[float]], str, float]]:
    if isinstance(value, (list, tuple)):
        if (len(value) == 2 and isinstance(value[0], (list, tuple)) and len(value[0]) == 4 and
                isinstance(value[1], (list, tuple)) and len(value[1]) >= 2 and isinstance(value[1][0], str)):
            yield value[0], value[1][0], float(value[1][1])
            return
        for child in value:
            yield from _walk_ocr(child)


def _ocr_items(engine: Any, image: Any) -> list[tuple[list[list[float]], str, float]]:
    result = []
    if hasattr(engine, "ocr"):
        try:
            result = engine.ocr(image, cls=True)
        except TypeError:
            result = engine.ocr(image)
    items = list(_walk_ocr(result))
    if items:
        return items
    # PaddleOCR 3.x may expose structured dictionaries through predict().
    if hasattr(engine, "predict"):
        for prediction in engine.predict(image):
            payload = getattr(prediction, "json", prediction)
            payload = payload() if callable(payload) else payload
            data = payload.get("res", payload) if isinstance(payload, dict) else {}
            texts = data.get("rec_texts", [])
            scores = data.get("rec_scores", [])
            boxes = data.get("rec_polys", data.get("dt_polys", []))
            items.extend((box, text, float(scores[index])) for index, (box, text) in enumerate(zip(boxes, texts)))
    return items


def _extract_ocr(page: Any, page_number: int) -> list[dict[str, Any]]:
    import numpy as np

    engine = _get_ocr_engine()
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False, colorspace=fitz.csRGB)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
    labels: list[Box] = []
    scores: dict[str, float] = {}
    for polygon, text, score in _ocr_items(engine, image):
        points = [(float(point[0]), float(point[1])) for point in polygon]
        box = Box(min(x for x, _ in points), min(y for _, y in points),
                  max(x for x, _ in points), max(y for _, y in points), text)
        labels.append(box)
        scores[text] = score

    pixel_page_rect = type("PixelRect", (), {"width": pixmap.width, "height": pixmap.height})()
    shapes: list[Box] = []
    try:
        import cv2
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        binary = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY_INV)[1]
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, pixmap.width // 25), 1))
        horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        contours = cv2.findContours(horizontal, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)[0]
        for contour in contours:
            x, y, width, height = cv2.boundingRect(contour)
            if width >= pixmap.width * .08 and height <= max(8, pixmap.height * .008):
                shapes.append(Box(x, y, x + width, y + max(height, 2)))
    except ImportError:
        pass

    candidates: list[dict[str, Any]] = []
    for index, shape in enumerate(shapes):
        label = _nearest_label(shape, labels)
        if not label:
            continue
        target = Box(shape.x0, max(0, shape.y0 - 24), shape.x1, shape.y1)
        confidence = min(.72, max(.45, scores.get(label, .6) * .72))
        candidate = _candidate(page_number, "paddleocr", index, label, target, pixel_page_rect, confidence)
        if candidate:
            candidates.append(candidate)

    # If no visual line survived, colon-labelled OCR text still gives a conservative right-side suggestion.
    if not candidates:
        for index, label_box in enumerate(labels):
            label = clean_label(label_box.text)
            if not label or not (label_box.text.rstrip().endswith((':', '：')) or SEMANTIC_LABEL.search(label)):
                continue
            available = pixmap.width - label_box.x1 - pixmap.width * .04
            if available < pixmap.width * .12:
                continue
            target = Box(label_box.x1 + 8, max(0, label_box.y0 - 3),
                         min(pixmap.width, label_box.x1 + min(available, pixmap.width * .35)), label_box.y1 + 5)
            candidate = _candidate(page_number, "paddleocr", index, label, target,
                                   pixel_page_rect, min(.62, scores.get(label_box.text, .6) * .65))
            if candidate:
                candidates.append(candidate)
    return candidates


def _overlap_ratio(first: dict[str, Any], second: dict[str, Any]) -> float:
    left = max(first["x"], second["x"])
    top = max(first["y"], second["y"])
    right = min(first["x"] + first["width"], second["x"] + second["width"])
    bottom = min(first["y"] + first["height"], second["y"] + second["height"])
    intersection = max(0, right - left) * max(0, bottom - top)
    smaller = min(first["width"] * first["height"], second["width"] * second["height"])
    return intersection / smaller if smaller else 0


def deduplicate(candidates: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    priorities = {"pymupdf-acroform": 5, "pymupdf-table": 4, "pymupdf-text": 3,
                  "pymupdf-vector": 2, "paddleocr": 1}
    ordered = sorted(candidates, key=lambda item: (-priorities.get(item["source"], 0), -item["confidence"]))
    results: list[dict[str, Any]] = []
    for candidate in ordered:
        if any(old["pageNumber"] == candidate["pageNumber"] and _overlap_ratio(old, candidate) >= .55
               for old in results):
            continue
        results.append(candidate)
    return sorted(results, key=lambda item: (item["pageNumber"], item["y"], item["x"]))


def engine_status() -> dict[str, bool]:
    try:
        import paddle  # noqa: F401
        import paddleocr  # noqa: F401
        paddle_available = True
    except ImportError:
        paddle_available = False
    return {"pymupdf": fitz is not None, "paddleocr": paddle_available}


def detect_pdf(pdf_bytes: bytes, requested_pages: set[int] | None = None,
               ocr_mode: str = "auto", engine_mode: str = "hybrid") -> dict[str, Any]:
    if fitz is None:
        raise DetectorUnavailable("PyMuPDF belum terpasang. Jalankan instalasi requirements.txt.")
    if engine_mode not in {"hybrid", "pymupdf", "ocr"}:
        raise ValueError("Mode engine detector tidak valid.")
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    candidates: list[dict[str, Any]] = []
    warnings: list[str] = []
    engines = ["pymupdf"] if engine_mode != "ocr" else []
    ocr_used = False
    try:
        for page_index in range(document.page_count):
            page_number = page_index + 1
            if requested_pages and page_number not in requested_pages:
                continue
            page = document.load_page(page_index)
            lines = _word_lines(page)
            page_candidates = [] if engine_mode == "ocr" else [
                *_extract_widgets(page, page_number),
                *_extract_tables(page, page_number),
                *_extract_underlines(page, page_number, lines),
                *_extract_vectors(page, page_number, lines),
            ]
            candidates.extend(page_candidates)
            text_length = sum(len(line.text.strip()) for line in lines)
            should_ocr = engine_mode == "ocr" or (
                engine_mode == "hybrid" and (ocr_mode == "always" or (ocr_mode == "auto" and text_length < 8))
            )
            if should_ocr:
                try:
                    candidates.extend(_extract_ocr(page, page_number))
                    ocr_used = True
                except ImportError:
                    warnings.append(f"Halaman {page_number}: PaddleOCR belum terpasang; fallback OCR dilewati.")
                except Exception as error:
                    warnings.append(f"Halaman {page_number}: OCR gagal: {error}")
    finally:
        document.close()
    if ocr_used:
        engines.append("paddleocr")
    return {"candidates": deduplicate(candidates), "engines": engines, "warnings": warnings}

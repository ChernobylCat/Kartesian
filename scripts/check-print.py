"""Compare the actual Chromium PDF output with the retained legacy engine."""
import json
from pathlib import Path

import pymupdf

reports = []
for name in ["next-print.pdf", "legacy-print.pdf"]:
    with pymupdf.open(Path("test-results") / name) as document:
        if len(document) != 1:
            raise AssertionError(f"Expected one fixture page: {name}")
        matches = document[0].search_for("Fixture Text")
        if len(matches) != 1:
            raise AssertionError(f"Expected one fixture text: {name}")
        reports.append({
            "file": name,
            "page_mm": [value * 25.4 / 72 for value in document[0].rect[2:]],
            "text_rect_pt": list(matches[0]),
        })

delta_mm = max(abs(a - b) for a, b in zip(reports[0]["text_rect_pt"], reports[1]["text_rect_pt"])) * 25.4 / 72
if delta_mm > 0.1:
    raise AssertionError(f"Print text differs by {delta_mm:.4f} mm")
if reports[0]["page_mm"] != reports[1]["page_mm"]:
    raise AssertionError("Page sizes differ")
result = {"files": reports, "max_text_delta_mm": delta_mm, "tolerance_mm": 0.1, "passed": True}
Path("test-results/print-comparison.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))

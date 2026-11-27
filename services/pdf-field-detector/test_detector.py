import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from detector import Box, _ocr_items, clean_label, deduplicate, detect_pdf, fitz, normalize_key
from server import DetectorHandler, _allowed_origin, _parse_pages


class DetectorHelpersTest(unittest.TestCase):
    def test_normalizes_indonesian_labels(self):
        self.assertEqual(normalize_key("Nomor KTP:"), "nomor_ktp")
        self.assertEqual(clean_label("1. Nama Pemohon:"), "Nama Pemohon")

    def test_box_geometry(self):
        box = Box(10, 20, 50, 28, "Nama")
        self.assertEqual((box.width, box.height, box.center_x), (40, 8, 30))

    def test_deduplicates_overlapping_candidates_by_priority(self):
        base = {"pageNumber": 1, "x": 10, "y": 20, "width": 30, "height": 5,
                "label": "Nama", "confidence": .8, "id": "one", "key": "nama", "placeholder": "{{nama}}"}
        results = deduplicate([
            {**base, "source": "paddleocr"},
            {**base, "id": "two", "source": "pymupdf-text"},
        ])
        self.assertEqual([item["source"] for item in results], ["pymupdf-text"])

    def test_request_validation(self):
        self.assertEqual(_parse_pages("3,1,3"), {1, 3})
        self.assertTrue(_allowed_origin("http://127.0.0.1:4173"))
        self.assertFalse(_allowed_origin("https://example.com"))
        with self.assertRaises(ValueError):
            _parse_pages("0")

    def test_adapts_paddleocr_v2_and_v3_results(self):
        polygon = [[1, 2], [20, 2], [20, 10], [1, 10]]

        class VersionTwo:
            def ocr(self, _image, cls=True):
                return [[[polygon, ("Nama:", 0.91)]]]

        class Prediction:
            json = {"res": {"rec_polys": [polygon], "rec_texts": ["Alamat:"], "rec_scores": [0.87]}}

        class VersionThree:
            def predict(self, _image):
                return [Prediction()]

        self.assertEqual(_ocr_items(VersionTwo(), None)[0][1:], ("Nama:", 0.91))
        self.assertEqual(_ocr_items(VersionThree(), None)[0][1:], ("Alamat:", 0.87))

    @unittest.skipIf(fitz is None, "PyMuPDF optional dependency is not installed")
    def test_detects_labelled_vector_line_in_real_pdf(self):
        document = fitz.open()
        page = document.new_page(width=595, height=935)
        page.insert_text((50, 80), "Nama:", fontsize=11)
        page.draw_line((100, 78), (300, 78), width=1)
        payload = document.tobytes()
        document.close()

        result = detect_pdf(payload, {1}, "always", "pymupdf")
        self.assertIn("pymupdf", result["engines"])
        self.assertEqual(result["warnings"], [])
        self.assertTrue(any(item["label"] == "Nama" for item in result["candidates"]))

    @unittest.skipIf(fitz is None, "PyMuPDF optional dependency is not installed")
    def test_widget_coordinates_follow_rotation_and_cropbox(self):
        for cropped in (False, True):
            for rotation in (0, 90, 180, 270):
                with self.subTest(cropped=cropped, rotation=rotation):
                    document = fitz.open()
                    page = document.new_page(width=800 if cropped else 612, height=1100 if cropped else 960)
                    if cropped:
                        page.set_cropbox(fitz.Rect(50, 60, 662, 1020))
                    widget = fitz.Widget()
                    widget.field_name = 'nama'
                    widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                    widget.rect = fitz.Rect(100, 200, 300, 230)
                    page.add_widget(widget)
                    page.set_rotation(rotation)
                    rect = page.first_widget.rect * page.rotation_matrix
                    expected = (rect.x0 / page.rect.width * 210, rect.y0 / page.rect.height * 330,
                                rect.width / page.rect.width * 210, rect.height / page.rect.height * 330)
                    result = detect_pdf(document.tobytes(), {1}, 'never', 'pymupdf')
                    candidate = next(c for c in result['candidates'] if c['source'] == 'pymupdf-acroform')
                    for key, value in zip(('x', 'y', 'width', 'height'), expected):
                        self.assertAlmostEqual(candidate[key], value, delta=.051)
                    document.close()

    @unittest.skipIf(fitz is None, "PyMuPDF optional dependency is not installed")
    def test_vector_coordinates_follow_page_rotation(self):
        document = fitz.open()
        page = document.new_page(width=612, height=960)
        page.insert_text((50, 80), 'Nama:', fontsize=11)
        page.draw_line((100, 78), (300, 78), width=1)
        baseline = next(c for c in detect_pdf(document.tobytes(), {1}, 'never', 'pymupdf')['candidates']
                        if c['source'] == 'pymupdf-vector')
        rect = fitz.Rect(baseline['x'] * 612 / 210, baseline['y'] * 960 / 330,
                         (baseline['x'] + baseline['width']) * 612 / 210,
                         (baseline['y'] + baseline['height']) * 960 / 330)
        for rotation in (90, 180, 270):
            with self.subTest(rotation=rotation):
                page.set_rotation(rotation)
                visual = rect * page.rotation_matrix
                candidate = next(c for c in detect_pdf(document.tobytes(), {1}, 'never', 'pymupdf')['candidates']
                                 if c['source'] == 'pymupdf-vector')
                expected = (visual.x0 / page.rect.width * 210, visual.y0 / page.rect.height * 330,
                            visual.width / page.rect.width * 210, visual.height / page.rect.height * 330)
                for key, value in zip(('x', 'y', 'width', 'height'), expected):
                    self.assertAlmostEqual(candidate[key], value, delta=.15)
        document.close()

    @unittest.skipIf(fitz is None, "PyMuPDF optional dependency is not installed")
    def test_http_contract_accepts_raw_pdf(self):
        document = fitz.open()
        page = document.new_page(width=595, height=935)
        page.insert_text((50, 80), "Nomor KTP:", fontsize=11)
        page.draw_line((120, 78), (320, 78), width=1)
        payload = document.tobytes()
        document.close()

        server = ThreadingHTTPServer(("127.0.0.1", 0), DetectorHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            connection.request("POST", "/v1/detect?pages=1&ocr=never&mode=pymupdf", body=payload,
                               headers={"Content-Type": "application/pdf", "Content-Length": str(len(payload))})
            response = connection.getresponse()
            result = json.loads(response.read())
            connection.close()
            self.assertEqual(response.status, 200)
            self.assertTrue(any(item["key"] == "nomor_ktp" for item in result["candidates"]))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()

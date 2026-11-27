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
        self.assertEqual(clean_label("1. Nama Debitur:"), "Nama Debitur")

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

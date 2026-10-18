"""Regression checks for the Python apps and their workspace configuration."""

import io
from pathlib import Path
import tomllib
import unittest

from api import app
from streamlit.testing.v1 import AppTest


ROOT = Path(__file__).resolve().parents[1]
CSV = b"score,age,approved\n10,20,0\n20,30,0\n30,40,1\n40,50,1\n"


class PreservedAppsTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def upload(self, path, **fields):
        return self.client.post(
            path,
            data={"file": (io.BytesIO(CSV), "sample.csv"), **fields},
            content_type="multipart/form-data",
        )

    def test_columns(self):
        response = self.upload("/columns")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["columns"], ["score", "age", "approved"])
        self.assertEqual(response.json["numericColumns"], ["score", "age", "approved"])

    def test_audit_preserves_response_contract(self):
        response = self.upload("/run-audit", target_col="approved", threshold="0.75")
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertEqual(result["targetCol"], "approved")
        self.assertEqual(result["totalRows"], 4)
        self.assertEqual(result["totalCols"], 3)
        self.assertEqual(len(result["rows"]), 4)
        self.assertEqual({row["name"] for row in result["results"]}, {"score", "age"})
        self.assertTrue(all(row["risk"] == "high" for row in result["results"]))

    def test_missing_upload(self):
        for path in ("/columns", "/run-audit"):
            with self.subTest(path=path):
                response = self.client.post(path)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json["error"], "No file uploaded")

    def test_insufficient_numeric_columns(self):
        response = self.client.post(
            "/run-audit",
            data={"file": (io.BytesIO(b"name,score\nA,1\nB,2\n"), "sample.csv")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("At least two numeric columns", response.json["error"])

    def test_streamlit_renders_original_entrypoint(self):
        page = AppTest.from_file(str(ROOT / "app.py")).run(timeout=30)
        self.assertEqual(len(page.exception), 0)
        self.assertEqual(page.title[0].value, "AI bias and Proxy Variable Auditing")

    def test_publishing_stays_on_streamlit(self):
        config = tomllib.loads((ROOT / ".replit").read_text())
        self.assertEqual(
            config["deployment"]["run"],
            [
                "streamlit", "run", "app.py", "--server.port", "5000",
                "--server.address", "0.0.0.0",
            ],
        )
        self.assertIn("python-3.11", config["modules"])

    def test_services_have_nonconflicting_routes_and_ports(self):
        manifest = ROOT / "artifacts/api-server/.replit-artifact/artifact.toml"
        python_services = tomllib.loads(manifest.read_text())["services"]
        mockup_manifest = ROOT / "artifacts/mockup-sandbox/.replit-artifact/artifact.toml"
        mockup_services = tomllib.loads(mockup_manifest.read_text())["services"]
        services = python_services + mockup_services
        ports = [service["localPort"] for service in services]
        self.assertEqual(len(ports), len(set(ports)))
        paths = [path for service in services for path in service["paths"]]
        self.assertEqual(set(paths), {"/", "/columns", "/run-audit", "/__mockup"})
        self.assertEqual(len(paths), len(set(paths)))


if __name__ == "__main__":
    unittest.main()

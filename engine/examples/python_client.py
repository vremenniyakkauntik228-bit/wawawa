import time
import requests

BASE = "http://127.0.0.1:8000/api/v1"
HEADERS = {"X-API-Key": "replace-with-your-key"}  # remove when ENGINE_API_KEY is empty

with open("example.txt", "rb") as f:
    upload = requests.post(f"{BASE}/files", headers=HEADERS, files={"file": ("example.txt", f, "text/plain")})
    upload.raise_for_status()
file_id = upload.json()["id"]

job = requests.post(f"{BASE}/jobs", headers=HEADERS, json={"file_id": file_id, "operation": "analyze"})
job.raise_for_status()
job_id = job.json()["id"]

while True:
    status = requests.get(f"{BASE}/jobs/{job_id}", headers=HEADERS).json()
    print(status["status"], status["progress"])
    if status["status"] in {"completed", "failed", "timed_out", "cancelled"}:
        break
    time.sleep(0.5)

print(requests.get(f"{BASE}/jobs/{job_id}/result", headers=HEADERS).json())

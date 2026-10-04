from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
from pathlib import Path

from core.models import JobStatus


class WorkerManager:
    def __init__(self, service):
        self.service = service
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.tasks: list[asyncio.Task] = []
        self.running = False
        self.processes: dict[str, asyncio.subprocess.Process] = {}

    async def enqueue(self, job_id: str) -> None:
        await self.queue.put(job_id)

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.tasks = [asyncio.create_task(self._worker_loop(i)) for i in range(self.service.settings.max_concurrency)]

    async def stop(self) -> None:
        self.running = False
        for job_id in list(self.processes):
            await self.cancel(job_id, emit_event=False)
        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()

    async def cancel(self, job_id: str, *, emit_event: bool = True) -> bool:
        row = self.service.repo.get_job(job_id)
        if not row:
            return False
        if row["status"] == JobStatus.QUEUED.value:
            changed = self.service.repo.cancel_queued_job(job_id)
            if changed and emit_event:
                await self.service.publish_event(job_id, "job.cancelled", {"status": JobStatus.CANCELLED.value, "progress": 100})
            return changed
        if row["status"] != JobStatus.RUNNING.value:
            return False
        proc = self.processes.get(job_id)
        if proc and proc.returncode is None:
            await self._kill_process(proc)
        self.service.repo.finish_job(
            job_id,
            JobStatus.CANCELLED,
            progress=100,
            error_code="cancelled",
            error_message="Job cancelled by client",
        )
        if emit_event:
            await self.service.publish_event(job_id, "job.cancelled", {"status": JobStatus.CANCELLED.value, "progress": 100})
        return True

    async def _kill_process(self, proc: asyncio.subprocess.Process) -> None:
        if proc.returncode is not None:
            return
        try:
            if os.name == "posix":
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
        except ProcessLookupError:
            pass
        try:
            await proc.wait()
        except Exception:
            pass

    async def _worker_loop(self, index: int) -> None:
        while self.running:
            job_id = await self.queue.get()
            try:
                await self._run_job(job_id)
            finally:
                self.queue.task_done()

    async def _run_job(self, job_id: str) -> None:
        if not self.service.repo.claim_queued_job(job_id):
            return
        await self.service.publish_event(job_id, "job.running", {"status": JobStatus.RUNNING.value, "progress": 5})
        row = self.service.repo.get_job(job_id)
        if not row or row["status"] == JobStatus.CANCELLED.value:
            return
        file_row = self.service.repo.get_file(row["file_id"])
        if not file_row:
            self.service.repo.finish_job(job_id, JobStatus.FAILED, progress=100, error_code="source_missing", error_message="Source file disappeared")
            await self.service.publish_event(job_id, "job.failed", {"status": JobStatus.FAILED.value, "error_code": "source_missing"})
            return
        source_path = Path(file_row["path"])
        output_format = row["output_format"]
        if row["operation"] in {"analyze", "validate"}:
            output_format = "json"
        elif row["operation"] == "extract_text" and not output_format:
            output_format = "txt"
        elif row["operation"] == "correct_text" and not output_format:
            output_format = "txt"
        if not output_format:
            output_format = "txt"
        result_dir = self.service.result_root / job_id
        result_dir.mkdir(parents=True, exist_ok=True)
        output_path = result_dir / f"output.{output_format}"
        current = self.service.repo.get_job(job_id)
        if not current or current["status"] == JobStatus.CANCELLED.value:
            return
        payload = {
            "source_path": str(source_path),
            "output_path": str(output_path),
            "operation": row["operation"],
            "output_format": output_format,
            "options": json.loads(row["options_json"] or "{}"),
        }
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONPATH": str(Path(__file__).resolve().parents[1]),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
        }
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "workers.runner",
            cwd=str(Path(__file__).resolve().parents[1]),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            start_new_session=(os.name == "posix"),
        )
        self.processes[job_id] = proc
        self.service.repo.update_progress(job_id, 20)
        await self.service.publish_event(job_id, "job.progress", {"status": JobStatus.RUNNING.value, "progress": 20})
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(json.dumps(payload).encode()), timeout=self.service.settings.job_timeout_seconds)
        except asyncio.TimeoutError:
            await self._kill_process(proc)
            output_path.unlink(missing_ok=True)
            current = self.service.repo.get_job(job_id)
            if current and current["status"] != JobStatus.CANCELLED.value:
                self.service.repo.finish_job(job_id, JobStatus.TIMED_OUT, progress=100, error_code="job_timeout", error_message="Job exceeded configured timeout")
                await self.service.publish_event(job_id, "job.timed_out", {"status": JobStatus.TIMED_OUT.value, "progress": 100})
            return
        finally:
            self.processes.pop(job_id, None)

        current = self.service.repo.get_job(job_id)
        if not current or current["status"] == JobStatus.CANCELLED.value:
            output_path.unlink(missing_ok=True)
            return

        if proc.returncode != 0:
            detail = stdout.decode(errors="replace").strip() or stderr.decode(errors="replace").strip() or "Worker failed"
            try:
                parsed = json.loads(detail)
                message = parsed.get("error", {}).get("message", detail)
                code = "processing_error"
            except json.JSONDecodeError:
                message, code = detail[-4000:], "processing_error"
            self.service.repo.finish_job(job_id, JobStatus.FAILED, progress=100, error_code=code, error_message=message)
            output_path.unlink(missing_ok=True)
            await self.service.publish_event(job_id, "job.failed", {"status": JobStatus.FAILED.value, "error_code": code, "error_message": message})
            return
        try:
            parsed = json.loads(stdout.decode())
            result_summary = parsed.get("result", {})
        except json.JSONDecodeError:
            self.service.repo.finish_job(job_id, JobStatus.FAILED, progress=100, error_code="invalid_worker_response", error_message="Worker returned invalid JSON")
            output_path.unlink(missing_ok=True)
            await self.service.publish_event(job_id, "job.failed", {"status": JobStatus.FAILED.value, "error_code": "invalid_worker_response"})
            return
        if not output_path.is_file():
            self.service.repo.finish_job(job_id, JobStatus.FAILED, progress=100, error_code="missing_worker_output", error_message="Worker completed without producing an output artifact")
            await self.service.publish_event(job_id, "job.failed", {"status": JobStatus.FAILED.value, "error_code": "missing_worker_output"})
            return
        size = output_path.stat().st_size
        if size > self.service.settings.max_output_bytes:
            output_path.unlink(missing_ok=True)
            self.service.repo.finish_job(job_id, JobStatus.FAILED, progress=100, error_code="output_too_large", error_message="Generated output exceeds configured limit")
            await self.service.publish_event(job_id, "job.failed", {"status": JobStatus.FAILED.value, "error_code": "output_too_large"})
            return
        media_map = {"txt": "text/plain", "md": "text/markdown", "json": "application/json", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "pdf": "application/pdf"}
        self.service.repo.update_progress(job_id, 90)
        await self.service.publish_event(job_id, "job.progress", {"status": JobStatus.RUNNING.value, "progress": 90})
        self.service.repo.finish_job(job_id, JobStatus.COMPLETED, progress=100, result_path=str(output_path), result_media_type=media_map.get(output_format, "application/octet-stream"), result_size_bytes=size, result_summary_json=json.dumps(result_summary, ensure_ascii=False))
        await self.service.publish_event(job_id, "job.completed", {"status": JobStatus.COMPLETED.value, "progress": 100, "result_size_bytes": size, "result_format": output_format})

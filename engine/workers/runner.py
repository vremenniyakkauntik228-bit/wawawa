from __future__ import annotations

import json
import os
import sys
import traceback

from core.processing import execute_job


def main() -> int:
    payload = json.loads(sys.stdin.read())
    try:
        result = execute_job(
            payload["source_path"],
            payload["output_path"],
            payload["operation"],
            payload.get("output_format"),
            payload.get("options", {}),
        )
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": {"type": exc.__class__.__name__, "message": str(exc), "details": getattr(exc, "details", {}), "trace": traceback.format_exc(limit=8)}}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

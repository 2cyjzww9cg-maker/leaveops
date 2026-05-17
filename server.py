#!/usr/bin/env python3
import hmac
import json
import os
import re
import threading
import time
from collections import defaultdict, deque
from copy import deepcopy
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "state.json"
AUDIT_FILE = DATA_DIR / "audit.log"
DELETE_PASS = os.environ.get("DELETE_PASS", "PO ME DEV")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "POMEDEV")
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", "2097152"))  # 2 MB
MAX_EMPLOYEES = int(os.environ.get("MAX_EMPLOYEES", "10000"))
STATE_RATE_LIMIT_PER_MIN = int(os.environ.get("STATE_RATE_LIMIT_PER_MIN", "240"))
DELETE_RATE_LIMIT_PER_MIN = int(os.environ.get("DELETE_RATE_LIMIT_PER_MIN", "30"))
AUDIT_RATE_LIMIT_PER_MIN = int(os.environ.get("AUDIT_RATE_LIMIT_PER_MIN", "60"))
LOCK = threading.Lock()

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self' https://cdn.sheetjs.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "font-src 'self' data: https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
)


class SlidingWindowRateLimiter:
    def __init__(self):
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_sec: int = 60) -> bool:
        now = time.time()
        with self._lock:
            queue = self._hits[key]
            while queue and queue[0] <= now - window_sec:
                queue.popleft()
            if len(queue) >= limit:
                return False
            queue.append(now)
            return True


RATE_LIMITER = SlidingWindowRateLimiter()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def create_empty_state() -> dict:
    return {
        "revision": 0,
        "year": datetime.now().year,
        "month": "all",
        "employees": [],
        "updatedAt": now_iso(),
    }


def normalize_month(value):
    if value == "all":
        return "all"
    try:
        month = int(value)
    except Exception:
        return "all"
    return month if 0 <= month <= 11 else "all"


def normalize_year(value):
    try:
        year = int(value)
    except Exception:
        return datetime.now().year
    return year if 2000 <= year <= 2100 else datetime.now().year


def normalize_employee(raw: dict) -> dict:
    leaves = raw.get("leaves", {})
    clean_leaves = {}
    if isinstance(leaves, dict):
        for date_key, value in leaves.items():
            if not isinstance(date_key, str):
                continue
            if isinstance(value, dict):
                clean_leaves[date_key] = {
                    "plan": bool(value.get("plan")),
                    "actual": bool(value.get("actual")),
                }
            elif isinstance(value, str):
                clean_leaves[date_key] = {
                    "plan": value in ("plan", "both"),
                    "actual": value in ("actual", "both"),
                }

    return {
        "id": str(raw.get("id", "")),
        "part": str(raw.get("part", "")),
        "code": str(raw.get("code", "")),
        "name": str(raw.get("name", "")),
        "position": str(raw.get("position", "")),
        "hireDate": str(raw.get("hireDate", "")),
        "advance": float(raw.get("advance", 0) or 0),
        "leaves": clean_leaves,
    }


def dedupe_employees_by_code(employees: list[dict]) -> list[dict]:
    result = []
    index_by_code = {}
    for employee in employees:
        code_key = str(employee.get("code", "")).strip().lower()
        if code_key:
            if code_key in index_by_code:
                result[index_by_code[code_key]] = employee
            else:
                index_by_code[code_key] = len(result)
                result.append(employee)
        else:
            result.append(employee)
    return result


def write_audit(event: str, ip: str, detail: dict):
    DATA_DIR.mkdir(exist_ok=True)
    payload = {"ts": now_iso(), "event": event, "ip": ip, "detail": detail}
    with AUDIT_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_audit(limit: int = 100, month: str | None = None, editor_only: bool = True) -> list[dict]:
    DATA_DIR.mkdir(exist_ok=True)
    if not AUDIT_FILE.exists():
        return []
    safe_limit = max(1, min(500, int(limit)))
    month_key = month if month and re.match(r"^\d{4}-\d{2}$", month) else None
    accepted_events = {"state.update", "employee.delete"} if editor_only else None
    lines = AUDIT_FILE.read_text(encoding="utf-8").splitlines()
    out = []
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except Exception:
            continue
        if accepted_events and payload.get("event") not in accepted_events:
            continue
        ts = str(payload.get("ts", ""))
        if month_key and not ts.startswith(month_key):
            continue
        out.append(payload)
        if len(out) >= safe_limit:
            break
    return out


def parse_actor(payload: dict | None, default_name: str = "Unknown") -> dict:
    payload = payload if isinstance(payload, dict) else {}
    vh_raw = str(payload.get("vh", "") or payload.get("name", "")).strip().upper()[:80]
    vh = vh_raw if re.match(r"^VH[0-9A-Z]{2,20}$", vh_raw) else ""
    name = (vh or str(payload.get("name", "")).strip()[:80] or default_name)
    actor_id = str(payload.get("id", "")).strip()[:80]
    tz = str(payload.get("tz", "")).strip()[:60]
    ua = str(payload.get("ua", "")).strip()[:200]
    return {
        "vh": vh,
        "name": name,
        "id": actor_id,
        "tz": tz,
        "ua": ua,
    }


def read_state() -> dict:
    DATA_DIR.mkdir(exist_ok=True)
    if not DATA_FILE.exists():
        state = create_empty_state()
        DATA_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        state = create_empty_state()
        DATA_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state


def write_state(state: dict) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    DATA_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


class AppHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CSP)
        super().end_headers()

    def _json_response(self, payload, status=HTTPStatus.OK):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except Exception:
            return None
        if length <= 0 or length > MAX_BODY_BYTES:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def _client_ip(self):
        cf_ip = self.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0]

    def _state_snapshot(self):
        with LOCK:
            return deepcopy(read_state())

    def _save_full_state(self, incoming: dict):
        with LOCK:
            current = read_state()
            employees = incoming.get("employees", [])
            if not isinstance(employees, list):
                employees = []
            cleaned = [normalize_employee(item) for item in employees if isinstance(item, dict)]
            cleaned = dedupe_employees_by_code(cleaned)
            if len(cleaned) > MAX_EMPLOYEES:
                raise ValueError("employees_limit_exceeded")
            merged = {
                "revision": int(current.get("revision", 0)) + 1,
                "year": normalize_year(incoming.get("year", current.get("year"))),
                "month": normalize_month(incoming.get("month", current.get("month", "all"))),
                "employees": cleaned,
                "updatedAt": now_iso(),
            }
            write_state(merged)
            return merged

    def _delete_employee(self, employee_id: str):
        with LOCK:
            current = read_state()
            before = len(current.get("employees", []))
            current["employees"] = [e for e in current.get("employees", []) if str(e.get("id")) != employee_id]
            if len(current["employees"]) == before:
                return None
            current["revision"] = int(current.get("revision", 0)) + 1
            current["updatedAt"] = now_iso()
            write_state(current)
            return current

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type,X-Delete-Pass,X-Admin-Pass,X-Editor-Name,X-Editor-Id,X-Editor-VH",
        )
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            return self._json_response(self._state_snapshot())
        if parsed.path == "/api/audit":
            client_ip = self._client_ip()
            if not RATE_LIMITER.allow(f"audit:{client_ip}", AUDIT_RATE_LIMIT_PER_MIN):
                return self._json_response({"error": "Rate limit exceeded"}, HTTPStatus.TOO_MANY_REQUESTS)
            supplied = self.headers.get("X-Admin-Pass", "")
            if not hmac.compare_digest(supplied, ADMIN_PASS):
                write_audit("audit.read.denied", client_ip, {"reason": "bad_password"})
                return self._json_response({"error": "Invalid admin password"}, HTTPStatus.FORBIDDEN)
            query = parse_qs(parsed.query)
            limit_raw = query.get("limit", ["100"])[0]
            month = query.get("month", [""])[0]
            try:
                limit = int(limit_raw)
            except Exception:
                limit = 100
            return self._json_response({"events": read_audit(limit, month=month, editor_only=True)}, HTTPStatus.OK)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            client_ip = self._client_ip()
            if not RATE_LIMITER.allow(f"state:{client_ip}", STATE_RATE_LIMIT_PER_MIN):
                return self._json_response({"error": "Rate limit exceeded"}, HTTPStatus.TOO_MANY_REQUESTS)
            payload = self._read_json_body()
            if not isinstance(payload, dict):
                return self._json_response({"error": "Invalid JSON payload"}, HTTPStatus.BAD_REQUEST)
            try:
                saved = self._save_full_state(payload)
            except ValueError:
                return self._json_response({"error": f"Too many employees. Max is {MAX_EMPLOYEES}"}, HTTPStatus.BAD_REQUEST)
            actor = parse_actor(payload.get("actor"), default_name=f"User-{client_ip}")
            reason = str(payload.get("reason", "state.update"))[:80]
            write_audit(
                "state.update",
                client_ip,
                {
                    "employees": len(saved.get("employees", [])),
                    "revision": saved.get("revision"),
                    "reason": reason,
                    "editor": actor,
                },
            )
            return self._json_response(saved, HTTPStatus.OK)
        return self._json_response({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/employee/"):
            client_ip = self._client_ip()
            if not RATE_LIMITER.allow(f"delete:{client_ip}", DELETE_RATE_LIMIT_PER_MIN):
                return self._json_response({"error": "Rate limit exceeded"}, HTTPStatus.TOO_MANY_REQUESTS)
            supplied = self.headers.get("X-Delete-Pass", "")
            actor = parse_actor(
                {
                    "name": self.headers.get("X-Editor-Name", ""),
                    "id": self.headers.get("X-Editor-Id", ""),
                    "vh": self.headers.get("X-Editor-VH", ""),
                },
                default_name=f"User-{client_ip}",
            )
            if not hmac.compare_digest(supplied, DELETE_PASS):
                write_audit("employee.delete.denied", client_ip, {"reason": "bad_password", "editor": actor})
                return self._json_response({"error": "Invalid delete password"}, HTTPStatus.FORBIDDEN)
            employee_id = parsed.path.rsplit("/", 1)[-1]
            updated = self._delete_employee(employee_id)
            if updated is None:
                return self._json_response({"error": "Employee not found"}, HTTPStatus.NOT_FOUND)
            write_audit(
                "employee.delete",
                client_ip,
                {"employeeId": employee_id, "revision": updated.get("revision"), "editor": actor},
            )
            return self._json_response(updated, HTTPStatus.OK)
        return self._json_response({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def log_message(self, fmt, *args):
        return


def run():
    port = int(os.environ.get("PORT", "4173"))
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Serving app + API at http://0.0.0.0:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run()

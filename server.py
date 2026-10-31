"""Singularity: a local-first, hardware-independent display server."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import wraps
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Flask, jsonify, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from templates import CATALOG, new_board

VERSION = "1.0.0"


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def require(condition, message, status=400):
    if not condition:
        from werkzeug.exceptions import abort
        abort(status, description=message)


def text(value, label, maximum=300, required=False):
    require(isinstance(value, str) and len(value) <= maximum and (not required or value.strip()),
            f"{label}: enter {'1–' if required else 'up to '}{maximum} characters.")
    return value.strip()


def validate_board(value):
    require(isinstance(value, dict), "Invalid board.")
    template = value.get("template")
    require(isinstance(template, str) and template in CATALOG, "Choose a valid template.")
    result = {"template": template}
    for key, limit in [("name", 80), ("title", 100), ("subtitle", 180), ("footer", 250)]:
        result[key] = text(value.get(key, ""), key.capitalize(), limit, key in ("name", "title"))
    theme = value.get("theme")
    require(type(theme) is int and 0 <= theme <= 2, "Choose one of the three themes.")
    result["theme"] = theme
    day = value.get("date", "")
    require(isinstance(day, str), "Invalid board date.")
    if day:
        try:
            datetime.strptime(day, "%Y-%m-%d")
        except ValueError:
            require(False, "Use a valid YYYY-MM-DD date.")
    result["date"] = day
    seconds = value.get("page_seconds", 15)
    require(type(seconds) is int and 5 <= seconds <= 120, "Page duration must be 5–120 seconds.")
    result["page_seconds"] = seconds
    items = value.get("items")
    require(isinstance(items, list) and len(items) <= 100, "Use up to 100 entries per board.")
    result["items"] = []
    for item in items:
        require(isinstance(item, dict), "Invalid entry.")
        clean = {key: text(item.get(key, ""), label, 250 if key == "detail" else 100, key == "title")
                 for key, label in CATALOG[template]["columns"]}
        if template == "production":
            require(clean["status"] in ("To do", "In progress", "Done", "Blocked"), "Choose a valid task status.")
            require(clean["priority"] in ("Normal", "High", "Urgent"), "Choose a valid priority.")
            require(not clean["due"] or re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", clean["due"]), "Task due time must be HH:MM.")
        if template == "metrics":
            for key in ("value", "target"):
                require(re.fullmatch(r"\d{1,9}(?:\.\d{1,3})?", clean[key]) is not None, "Metric values and targets must be nonnegative numbers.")
        result["items"].append(clean)
    return result


def validate_settings(value):
    require(isinstance(value, dict), "Invalid settings.")
    site_name = text(value.get("site_name"), "Workspace name", 80, True)
    zone = text(value.get("timezone"), "Timezone", 80, True)
    try:
        ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError):
        require(False, "Enter an IANA timezone, such as America/New_York.")
    return {"site_name": site_name, "timezone": zone}


def rule_slots(rule):
    """Weekly wall-clock minutes. Overnight windows belong to their start day."""
    start = int(rule["start"][:2]) * 60 + int(rule["start"][3:])
    end = int(rule["end"][:2]) * 60 + int(rule["end"][3:])
    duration = (end - start) % 1440
    return {(day * 1440 + start + offset) % 10080 for day in rule["days"] for offset in range(duration)}


def validate_rules(rules, state):
    require(isinstance(rules, list) and len(rules) <= 100, "Use up to 100 schedule windows.")
    occupied, cleaned = {}, []
    for rule in rules:
        require(isinstance(rule, dict), "Invalid schedule window.")
        screen, board = rule.get("screen"), rule.get("board")
        require(isinstance(screen, str) and screen in state["screens"], "Choose an existing screen.")
        require(isinstance(board, str) and board in state["boards"] and state["boards"][board]["published"], "Choose a published board.")
        days = rule.get("days")
        require(isinstance(days, list) and 1 <= len(days) <= 7 and all(type(d) is int and 0 <= d <= 6 for d in days) and len(set(days)) == len(days), "Choose at least one distinct weekday.")
        for key in ("start", "end"):
            require(isinstance(rule.get(key), str) and re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", rule[key]), "Use HH:MM schedule times.")
        require(rule["start"] != rule["end"], "Start and end times must differ; use the default board outside scheduled windows.")
        clean = {"id": uuid4().hex, "screen": screen, "board": board, "days": days, "start": rule["start"], "end": rule["end"]}
        slots = rule_slots(clean)
        require(not occupied.get(screen, set()) & slots, "Schedule windows overlap on this screen.")
        occupied.setdefault(screen, set()).update(slots)
        cleaned.append(clean)
    return cleaned


def resolve_board(state, slug, instant=None):
    local = (instant or datetime.now(timezone.utc)).astimezone(ZoneInfo(state["settings"]["timezone"]))
    day, minute = local.weekday(), local.hour * 60 + local.minute
    for rule in state["schedules"]:
        if rule["screen"] != slug:
            continue
        start = int(rule["start"][:2]) * 60 + int(rule["start"][3:])
        end = int(rule["end"][:2]) * 60 + int(rule["end"][3:])
        active = (day in rule["days"] and start <= minute < end) if start < end else (
            (day in rule["days"] and minute >= start) or ((day - 1) % 7 in rule["days"] and minute < end))
        if active:
            return rule["board"], True
    return state["screens"][slug]["board"], False


def initial_state():
    state = {"settings": {"site_name": "Singularity workspace", "timezone": os.environ.get("TZ", "America/New_York")}, "boards": {}, "screens": {}, "schedules": []}
    for template in ("production", "briefing", "safety"):
        board = new_board(template)
        state["boards"][board["id"]] = {"draft": board, "published": deepcopy(board), "revision": 1, "published_revision": 1, "updated": now()}
    first = next(iter(state["boards"]))
    state["screens"]["production-floor"] = {"name": "Production floor", "board": first}
    return state


def create_app(data_dir=None, testing=False):
    app = Flask(__name__, static_folder="static")
    directory = Path(data_dir or os.environ.get("DATA_DIR", "data"))
    directory.mkdir(parents=True, exist_ok=True)
    secret_file = directory / "session.key"
    try:
        with secret_file.open("x", encoding="ascii") as handle:
            handle.write(secrets.token_hex(32))
        secret_file.chmod(0o600)
    except FileExistsError:
        pass
    app.config.update(SECRET_KEY=secret_file.read_text(encoding="ascii"), TESTING=testing,
                      MAX_CONTENT_LENGTH=32 * 1024 * 1024, SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE="Strict", SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
                      PERMANENT_SESSION_LIFETIME=timedelta(hours=12))
    database = directory / "singularity.db"

    @contextmanager
    def db(write=False):
        connection = sqlite3.connect(database, timeout=15)
        connection.execute("PRAGMA busy_timeout=15000")
        try:
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    with db(True) as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)")
        connection.execute("CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), password TEXT NOT NULL, generation TEXT NOT NULL)")
        connection.execute("CREATE TABLE IF NOT EXISTS presence (slug TEXT PRIMARY KEY, seen REAL NOT NULL)")
        connection.execute("INSERT OR IGNORE INTO state VALUES (1, ?)", (json.dumps(initial_state()),))

    def read_state(connection):
        return json.loads(connection.execute("SELECT payload FROM state WHERE id=1").fetchone()[0])

    def save_state(connection, state):
        connection.execute("UPDATE state SET payload=? WHERE id=1", (json.dumps(state),))

    def authenticated():
        with db() as connection:
            row = connection.execute("SELECT generation FROM admin WHERE id=1").fetchone()
        return bool(row and session.get("generation") == row[0])

    def protected(function):
        @wraps(function)
        def wrapper(*args, **kwargs):
            require(authenticated(), "Please sign in.", 401)
            return function(*args, **kwargs)
        return wrapper

    @app.before_request
    def csrf():
        if request.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            require(session.get("csrf") and secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), session["csrf"]), "Session expired. Refresh the page and try again.", 403)
            require(request.is_json, "Send JSON data.", 415)

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
        if request.path.startswith("/api/") or request.path in ("/", "/admin") or request.path.startswith("/display/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def unexpected_error(error):
        app.logger.exception("Unhandled request error")
        return jsonify(error="The server could not complete this request. Check the server logs and try again."), 500

    @app.get("/")
    @app.get("/admin")
    def index():
        return app.send_static_file("index.html")

    @app.get("/display/<slug>")
    def player(slug):
        return app.send_static_file("player.html")

    @app.get("/health")
    def health():
        with db() as connection:
            connection.execute("SELECT 1 FROM state").fetchone()
        return jsonify(status="ok", version=VERSION)

    @app.get("/api/session")
    def get_session():
        session.setdefault("csrf", secrets.token_hex(32))
        with db() as connection:
            setup = connection.execute("SELECT 1 FROM admin").fetchone() is None
            zone = read_state(connection)["settings"]["timezone"]
        return jsonify(csrf=session["csrf"], setup=setup, authenticated=authenticated(), version=VERSION, timezone=zone)

    attempts, attempt_lock = {}, threading.Lock()

    def throttle():
        with attempt_lock:
            stamp = time.monotonic()
            # Expire entries, including abandoned client addresses, to bound memory.
            for key in list(attempts):
                attempts[key] = [t for t in attempts[key] if stamp - t < 300]
                if not attempts[key]:
                    del attempts[key]
            key = request.remote_addr or "local"
            require(len(attempts.get(key, [])) < 10, "Too many attempts. Wait five minutes.", 429)
            attempts.setdefault(key, []).append(stamp)

    def password_from(body):
        password = body.get("password")
        require(isinstance(password, str) and 12 <= len(password) <= 128, "Use a password of 12–128 characters.")
        return password

    @app.post("/api/setup")
    def setup():
        throttle()
        body = request.get_json()
        require(isinstance(body, dict), "Invalid setup data.")
        password = password_from(body)
        settings = validate_settings(body)
        with db(True) as connection:
            require(connection.execute("SELECT 1 FROM admin").fetchone() is None, "Setup is already complete.", 409)
            generation = secrets.token_hex(16)
            connection.execute("INSERT INTO admin VALUES (1, ?, ?)", (generate_password_hash(password), generation))
            state = read_state(connection)
            state["settings"] = settings
            save_state(connection, state)
        session["generation"] = generation
        session.permanent = True
        return jsonify(ok=True)

    @app.post("/api/login")
    def login():
        throttle()
        body = request.get_json()
        require(isinstance(body, dict) and isinstance(body.get("password"), str) and len(body["password"]) <= 128, "Enter your password.")
        with db() as connection:
            row = connection.execute("SELECT password, generation FROM admin WHERE id=1").fetchone()
        require(row and check_password_hash(row[0], body["password"]), "Incorrect password.", 401)
        session["generation"] = row[1]
        session.permanent = True
        return jsonify(ok=True)

    @app.post("/api/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.get("/api/state")
    @protected
    def state_get():
        with db() as connection:
            state = read_state(connection)
            seen = dict(connection.execute("SELECT slug, seen FROM presence"))
        for slug, screen in state["screens"].items():
            screen["online"] = time.time() - seen.get(slug, 0) < 20
            screen["last_seen"] = seen.get(slug)
            screen["active_board"], screen["scheduled"] = resolve_board(state, slug)
        return jsonify(state=state, catalog=CATALOG)

    @app.post("/api/boards")
    @protected
    def board_create():
        body = request.get_json()
        require(isinstance(body, dict), "Invalid board request.")
        with db(True) as connection:
            state = read_state(connection)
            require(len(state["boards"]) < 100, "V1 supports up to 100 boards.")
            if body.get("duplicate"):
                require(isinstance(body["duplicate"], str) and body["duplicate"] in state["boards"], "Board not found.", 404)
                board = deepcopy(state["boards"][body["duplicate"]]["draft"])
                board["id"] = uuid4().hex
                board["name"] = board["name"][:73] + " (copy)"
            else:
                require(isinstance(body.get("template"), str) and body["template"] in CATALOG, "Choose a template.")
                board = new_board(body["template"])
            state["boards"][board["id"]] = {"draft": board, "published": None, "revision": 1, "published_revision": 0, "updated": now()}
            save_state(connection, state)
        return jsonify(id=board["id"]), 201

    @app.route("/api/boards/<bid>", methods=["PUT", "DELETE"])
    @app.post("/api/boards/<bid>/publish")
    @protected
    def board_update(bid):
        body = request.get_json()
        require(isinstance(body, dict), "Invalid board request.")
        with db(True) as connection:
            state = read_state(connection)
            require(bid in state["boards"], "Board not found.", 404)
            record = state["boards"][bid]
            require(type(body.get("revision")) is int and body["revision"] == record["revision"], "This board was edited elsewhere. Reload it before saving.", 409)
            if request.method == "DELETE":
                require(not any(s["board"] == bid for s in state["screens"].values()) and not any(r["board"] == bid for r in state["schedules"]), "Reassign this board's screens and schedule windows before deleting it.", 409)
                del state["boards"][bid]
            else:
                board = validate_board(body.get("board"))
                require(board["template"] == record["draft"]["template"], "A board's template cannot be changed.")
                board["id"] = bid
                record["draft"] = board
                record["revision"] += 1
                record["updated"] = now()
                if request.path.endswith("/publish"):
                    record["published"] = deepcopy(board)
                    record["published_revision"] = record["revision"]
            save_state(connection, state)
        return jsonify(ok=True)

    @app.route("/api/screens", methods=["POST"])
    @app.route("/api/screens/<slug>", methods=["PUT", "DELETE"])
    @protected
    def screen_update(slug=None):
        body = request.get_json()
        require(isinstance(body, dict), "Invalid screen request.")
        with db(True) as connection:
            state = read_state(connection)
            if request.method != "POST":
                require(slug in state["screens"], "Screen not found.", 404)
            if request.method == "DELETE":
                require(not any(r["screen"] == slug for r in state["schedules"]), "Remove this screen's schedule windows before deleting it.", 409)
                del state["screens"][slug]
                connection.execute("DELETE FROM presence WHERE slug=?", (slug,))
            else:
                if request.method == "POST":
                    slug = body.get("slug")
                    require(isinstance(slug, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) and len(slug) <= 60, "Screen address: use up to 60 lowercase letters, numbers and hyphens.")
                    require(slug not in state["screens"], "That screen address is already in use.", 409)
                    require(len(state["screens"]) < 100, "V1 supports up to 100 logical screens.")
                board = body.get("board")
                require(isinstance(board, str) and board in state["boards"] and state["boards"][board]["published"], "Publish a board before assigning it to a screen.")
                state["screens"][slug] = {"name": text(body.get("name"), "Screen name", 80, True), "board": board}
            save_state(connection, state)
        return jsonify(ok=True)

    @app.put("/api/schedules")
    @protected
    def schedules_update():
        with db(True) as connection:
            state = read_state(connection)
            state["schedules"] = validate_rules(request.get_json(), state)
            save_state(connection, state)
        return jsonify(ok=True)

    @app.put("/api/settings")
    @protected
    def settings_update():
        settings = validate_settings(request.get_json())
        with db(True) as connection:
            state = read_state(connection)
            state["settings"] = settings
            save_state(connection, state)
        return jsonify(ok=True)

    @app.put("/api/password")
    @protected
    def password_update():
        body = request.get_json()
        require(isinstance(body, dict) and isinstance(body.get("current_password"), str), "Enter your current password.")
        password = password_from(body)
        with db(True) as connection:
            row = connection.execute("SELECT password FROM admin WHERE id=1").fetchone()
            require(check_password_hash(row[0], body["current_password"]), "Current password is incorrect.")
            generation = secrets.token_hex(16)
            connection.execute("UPDATE admin SET password=?, generation=? WHERE id=1", (generate_password_hash(password), generation))
        session["generation"] = generation
        return jsonify(ok=True)

    @app.get("/api/backup")
    @protected
    def backup():
        with db() as connection:
            state = read_state(connection)
        response = jsonify(format="singularity-v1", exported=now(), state=state)
        response.headers["Content-Disposition"] = 'attachment; filename="singularity-backup.json"'
        return response

    @app.post("/api/restore")
    @protected
    def restore():
        payload = request.get_json()
        require(isinstance(payload, dict) and payload.get("format") == "singularity-v1", "Choose a Singularity V1 backup.")
        raw = payload.get("state")
        require(isinstance(raw, dict), "Invalid backup state.")
        restored = {"settings": validate_settings(raw.get("settings")), "boards": {}, "screens": {}, "schedules": []}
        require(isinstance(raw.get("boards"), dict) and len(raw["boards"]) <= 100, "Invalid backup boards.")
        for bid, record in raw["boards"].items():
            require(re.fullmatch(r"[a-f0-9]{32}", bid) and isinstance(record, dict), "Invalid backup board ID.")
            draft = validate_board(record.get("draft"))
            draft["id"] = bid
            published = record.get("published")
            if published is not None:
                published = validate_board(published)
                require(published["template"] == draft["template"], "Published and draft templates must match.")
                published["id"] = bid
            # New revision nonce invalidates open editors even when restoring the same file.
            revision = secrets.randbelow(10**12) + 1000
            restored["boards"][bid] = {"draft": draft, "published": published, "revision": revision,
                                      "published_revision": revision if draft == published else (revision - 1 if published else 0), "updated": now()}
        require(isinstance(raw.get("screens"), dict) and len(raw["screens"]) <= 100, "Invalid backup screens.")
        for slug, screen in raw["screens"].items():
            require(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) and len(slug) <= 60 and isinstance(screen, dict), "Invalid backup screen.")
            bid = screen.get("board")
            require(isinstance(bid, str) and bid in restored["boards"] and restored["boards"][bid]["published"], "Backup screen references an unpublished or missing board.")
            restored["screens"][slug] = {"name": text(screen.get("name"), "Screen name", 80, True), "board": bid}
        restored["schedules"] = validate_rules(raw.get("schedules"), restored)
        with db(True) as connection:
            save_state(connection, restored)
            connection.execute("DELETE FROM presence")
        return jsonify(ok=True)

    @app.get("/api/display/<slug>")
    def public_display(slug):
        with db(True) as connection:
            state = read_state(connection)
            require(slug in state["screens"], "This screen does not exist. Ask your administrator to check its address.", 404)
            bid, scheduled = resolve_board(state, slug)
            board = state["boards"][bid]["published"]
            connection.execute("INSERT INTO presence VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET seen=excluded.seen", (slug, time.time()))
        content = {"board": board, "settings": state["settings"], "screen_name": state["screens"][slug]["name"], "scheduled": scheduled}
        content["revision"] = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
        content["server_time"] = now()
        return jsonify(content)

    return app


if __name__ == "__main__":
    from waitress import serve
    serve(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), threads=8)

from copy import deepcopy
from datetime import datetime, timezone
import json
import sqlite3

import pytest

from server import create_app, resolve_board
from templates import CATALOG

PASSWORD = "a-local-test-password"


class Admin:
    def __init__(self, app, setup=True):
        self.client = app.test_client()
        self.csrf = self.client.get("/api/session").json["csrf"]
        if setup:
            response = self.call("POST", "setup", {"password": PASSWORD, "site_name": "Test workshop", "timezone": "America/New_York"})
            assert response.status_code == 200

    def call(self, method, path, data=None):
        return self.client.open("/api/" + path, method=method, json=data,
                                headers={"X-CSRF-Token": self.csrf})

    def state(self):
        response = self.call("GET", "state")
        assert response.status_code == 200
        return response.json["state"]

    def create(self, template="production"):
        response = self.call("POST", "boards", {"template": template})
        assert response.status_code == 201, response.json
        return response.json["id"]

    def save(self, bid, board=None, publish=False, revision=None):
        record = self.state()["boards"][bid]
        return self.call("POST" if publish else "PUT", f"boards/{bid}" + ("/publish" if publish else ""),
                         {"revision": record["revision"] if revision is None else revision,
                          "board": board or record["draft"]})


@pytest.fixture
def app(tmp_path):
    return create_app(tmp_path, testing=True)


@pytest.fixture
def admin(app):
    return Admin(app)


def test_first_run_and_access_control(app):
    client = app.test_client()
    assert client.get("/health").json["status"] == "ok"
    assert client.get("/api/session").json["setup"] is True
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/backup").status_code == 401
    assert client.post("/api/setup", json={}).status_code == 403
    assert client.get("/api/display/production-floor").status_code == 200
    for path in ("/", "/admin", "/display/production-floor", "/static/app.js", "/static/styles.css"):
        response = client.get(path)
        assert response.status_code == 200
        assert "default-src 'self'" in response.headers["Content-Security-Policy"]
    assert "javascript" in client.get("/static/app.js").content_type


def test_setup_once_password_change_and_logout(app, admin):
    assert admin.call("POST", "setup", {"password": PASSWORD, "site_name": "x", "timezone": "UTC"}).status_code == 409
    other = Admin(app, setup=False)
    assert other.call("POST", "login", {"password": "wrong"}).status_code == 401
    assert other.call("POST", "login", {"password": PASSWORD}).status_code == 200
    assert admin.call("PUT", "password", {"current_password": "wrong", "password": "new-local-password"}).status_code == 400
    assert admin.call("PUT", "password", {"current_password": PASSWORD, "password": "new-local-password"}).status_code == 200
    assert other.call("GET", "state").status_code == 401
    assert admin.call("GET", "state").status_code == 200
    assert admin.call("POST", "logout", {}).status_code == 200
    assert admin.call("GET", "state").status_code == 401


def test_login_rate_limit(app, admin):
    other = Admin(app, setup=False)
    codes = [other.call("POST", "login", {"password": "wrong"}).status_code for _ in range(12)]
    assert codes[-1] == 429


def test_drafts_are_isolated_from_public_screens(admin):
    state = admin.state()
    bid = state["screens"]["production-floor"]["board"]
    before = admin.client.get("/api/display/production-floor").json
    draft = state["boards"][bid]["draft"]
    draft["title"] = "A new shift plan"
    assert admin.save(bid, draft).status_code == 200
    after_save = admin.client.get("/api/display/production-floor").json
    assert after_save["revision"] == before["revision"]
    assert after_save["board"]["title"] != draft["title"]
    assert admin.save(bid, publish=True).status_code == 200
    after_publish = admin.client.get("/api/display/production-floor").json
    assert after_publish["board"]["title"] == draft["title"]
    assert after_publish["revision"] != before["revision"]
    assert admin.state()["screens"]["production-floor"]["online"] is True


@pytest.mark.parametrize("template", CATALOG)
@pytest.mark.parametrize("theme", [0, 1, 2])
def test_all_24_template_theme_combinations(admin, template, theme):
    bid = admin.create(template)
    draft = admin.state()["boards"][bid]["draft"]
    draft["theme"] = theme
    assert admin.save(bid, draft, publish=True).status_code == 200
    slug = f"{template}-{theme}"
    assert admin.call("POST", "screens", {"slug": slug, "name": "Test screen", "board": bid}).status_code == 200
    display = admin.client.get(f"/api/display/{slug}").json
    assert display["board"]["theme"] == theme
    assert display["board"]["template"] == template


def test_stale_board_update_and_deletion_references(admin):
    bid = admin.state()["screens"]["production-floor"]["board"]
    record = admin.state()["boards"][bid]
    assert admin.save(bid).status_code == 200
    assert admin.save(bid, revision=record["revision"]).status_code == 409
    record = admin.state()["boards"][bid]
    assert admin.call("DELETE", f"boards/{bid}", {"revision":record["revision"]}).status_code == 409
    copy = admin.call("POST", "boards", {"duplicate":bid}).json["id"]
    assert admin.state()["boards"][copy]["published"] is None
    assert admin.call("DELETE", f"boards/{copy}", {"revision":1}).status_code == 200


@pytest.mark.parametrize("change", [
    {"theme": 3}, {"theme": True}, {"name": ""}, {"title": "x"*101}, {"date": "2026-02-30"},
    {"page_seconds": 0}, {"items": [{"title": "x", "status": "Invalid"}]}, {"items": "bad"}, {"template": []},
])
def test_board_validation_is_atomic(admin, change):
    bid = admin.create()
    record = admin.state()["boards"][bid]
    draft = deepcopy(record["draft"])
    draft.update(change)
    assert admin.save(bid, draft).status_code == 400
    assert admin.state()["boards"][bid] == record


def test_metric_validation_and_entries_limit(admin):
    bid = admin.create("metrics")
    draft = admin.state()["boards"][bid]["draft"]
    draft["items"][0]["value"] = "NaN"
    assert admin.save(bid, draft).status_code == 400
    bid = admin.create()
    draft = admin.state()["boards"][bid]["draft"]
    draft["items"] = [draft["items"][0]] * 101
    assert admin.save(bid, draft).status_code == 400


def test_screen_permanent_address_and_missing_screen(admin):
    bid = admin.create()
    screen = {"slug":"lobby", "name":"Lobby", "board":bid}
    assert admin.call("POST", "screens", screen).status_code == 400
    admin.save(bid, publish=True)
    assert admin.call("POST", "screens", screen).status_code == 200
    assert admin.call("POST", "screens", screen).status_code == 409
    other = next(iter(admin.state()["boards"]))
    assert admin.call("PUT", "screens/lobby", {"name":"Lobby 2", "board":other}).status_code == 200
    assert admin.client.get("/api/display/lobby").json["board"]["id"] == other
    assert admin.call("DELETE", "screens/lobby", {}).status_code == 200
    assert admin.client.get("/api/display/lobby").status_code == 404


def schedule_rule(admin, days=None, start="07:00", end="08:00"):
    bid = list(admin.state()["boards"])[1]
    return {"screen":"production-floor", "board":bid, "days":days if days is not None else [0,1,2,3,4], "start":start, "end":end}


def test_weekly_schedule_timezone_boundaries_and_fallback(admin):
    rule = schedule_rule(admin)
    assert admin.call("PUT", "schedules", [rule]).status_code == 200
    state = admin.state()
    # Monday 2026-11-02: standard time, UTC-5 in New York.
    assert resolve_board(state,"production-floor",datetime(2026,11,2,12,0,tzinfo=timezone.utc)) == (rule["board"],True)
    fallback = state["screens"]["production-floor"]["board"]
    assert resolve_board(state,"production-floor",datetime(2026,11,2,13,0,tzinfo=timezone.utc)) == (fallback,False)
    assert resolve_board(state,"production-floor",datetime(2026,11,1,12,30,tzinfo=timezone.utc)) == (fallback,False)
    # During summer the same local start is 11:00 UTC.
    assert resolve_board(state,"production-floor",datetime(2026,7,6,11,0,tzinfo=timezone.utc)) == (rule["board"],True)


def test_overnight_sunday_wrap_overlap_and_references(admin):
    rule = schedule_rule(admin, days=[6], start="22:00", end="06:00")
    assert admin.call("PUT", "schedules", [rule]).status_code == 200
    state = admin.state()
    assert resolve_board(state,"production-floor",datetime(2026,11,2,10,59,tzinfo=timezone.utc)) == (rule["board"],True)
    assert resolve_board(state,"production-floor",datetime(2026,11,2,11,0,tzinfo=timezone.utc))[1] is False
    overlap = schedule_rule(admin, days=[0], start="05:00", end="07:00")
    assert admin.call("PUT", "schedules", [rule,overlap]).status_code == 400
    assert len(admin.state()["schedules"]) == 1
    assert admin.call("DELETE", "screens/production-floor", {}).status_code == 409
    record = state["boards"][rule["board"]]
    assert admin.call("DELETE", f'boards/{rule["board"]}', {"revision":record["revision"]}).status_code == 409


@pytest.mark.parametrize("change", [
    {"days": []}, {"days":[True]}, {"days":[0,0]}, {"days":[7]}, {"start":"24:00"},
    {"start":"08:00","end":"08:00"}, {"board":"missing"}, {"screen":"missing"},
])
def test_schedule_validation(admin, change):
    rule = schedule_rule(admin)
    rule.update(change)
    assert admin.call("PUT", "schedules", [rule]).status_code == 400


def test_settings_reject_invalid_timezone_and_public_revision_updates(admin):
    before = admin.client.get("/api/display/production-floor").json
    assert admin.call("PUT", "settings", {"site_name":"Different", "timezone":"Mars/Olympus"}).status_code == 400
    assert admin.call("PUT", "settings", {"site_name":"Different", "timezone":"UTC"}).status_code == 200
    after = admin.client.get("/api/display/production-floor").json
    assert after["revision"] != before["revision"]
    assert after["settings"]["timezone"] == "UTC"


def test_backup_restore_is_atomic_preserves_auth_and_invalidates_editors(admin):
    bid = admin.create("menu")
    admin.save(bid,publish=True)
    rule = schedule_rule(admin)
    admin.call("PUT","schedules",[rule])
    payload = admin.call("GET","backup").json
    assert "password" not in json.dumps(payload)
    old_revision = admin.state()["boards"][bid]["revision"]
    admin.call("PUT","settings",{"site_name":"Changed", "timezone":"UTC"})
    assert admin.call("POST","restore",payload).status_code == 200
    state = admin.state()
    assert state["settings"]["site_name"] == "Test workshop"
    assert state["boards"][bid]["published"]["template"] == "menu"
    assert len(state["schedules"]) == 1
    assert admin.save(bid,revision=old_revision).status_code == 409
    broken = deepcopy(payload)
    broken["state"]["screens"]["production-floor"]["board"] = "missing"
    assert admin.call("POST","restore",broken).status_code == 400
    assert admin.state() == state


def test_sqlite_survives_restart(tmp_path):
    first = Admin(create_app(tmp_path,testing=True))
    bid = first.create("announcements")
    first.save(bid,publish=True)
    second = Admin(create_app(tmp_path,testing=True),setup=False)
    assert second.client.get("/api/session").json["setup"] is False
    assert second.call("POST","login",{"password":PASSWORD}).status_code == 200
    assert second.state()["boards"][bid]["published"] is not None
    raw = (tmp_path / "singularity.db").read_bytes()
    assert PASSWORD.encode() not in raw
    with sqlite3.connect(tmp_path / "singularity.db") as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


@pytest.mark.parametrize("path,method", [("boards","POST"),("settings","PUT"),("restore","POST"),("screens","POST"),("password","PUT")])
def test_malformed_json_body_returns_400_not_500(admin, path, method):
    assert admin.call(method,path,["unexpected"]).status_code == 400

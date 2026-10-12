"""Offline tests for worklanes/scripts/ask.py against a local stdlib HTTP stub.

Run by test/ask.test.mjs (node --test), or directly: python -m unittest test/ask_test.py
The credential here is a fake value in a temporary file.
"""
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import threading
import unittest
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ASK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worklanes", "scripts", "ask.py")
FAKE = "wl_FAKE_credential_value_0123456789"


class Stub:
    def __init__(self):
        self.requests = []
        self.mode = "answer"  # answer | wait | refuse401 | refuse403 | pong | other
        self.answer = {"status": "done", "result": "the answer", "data": {"n": 1}, "answeredBy": "grok", "at": "2026-10-11T00:00:00Z"}
        self.waits_before_answer = 0
        # The platform's whoami shape for an agent connected by Allow: agent {agentId, name, scope, neuronId,
        # conductor} plus the contract fields, where `client` is the label without the `oauth · ` prefix.
        self.whoami = {"kind": "agent", "orgId": "o1", "actsFor": {"uid": "u1", "githubLogin": None, "role": "owner"},
                       "agent": {"agentId": "tok-cc", "name": "claude-code", "scope": "write", "neuronId": None,
                                 "conductor": False},
                       "person": {"uid": "u1", "name": "Person", "githubLogin": None}, "via": "oauth",
                       "client": "claude-code", "orgs": [], "needsYou": []}
        # Agents as the platform stores them: an agent connected by Allow is labelled "oauth · <client_name>".
        self.agents = {"tok-cc": "oauth · claude-code", "tok-grok": "oauth · grok"}
        self.asks = []        # setup-status openAsks
        self.cards = {}       # cardId -> card (GET /cards/:id)
        self.answers = {}     # cardId -> (idempotency key, body)
        self.revoked = []     # tokens sent to the revocation endpoint
        self.oauth = {}       # client registration, authorize parameters, issued token
        self.issue = "wla_FAKE_new_oauth_token_9876543210"
        self.resolved = []    # agentIds the ask route resolved `to` into
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def _handler(self):
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, code, body):
                raw = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def _record(self, body=None):
                stub.requests.append({
                    "method": self.command, "path": self.path, "headers": dict(self.headers), "body": body,
                })

            def _route(self, body):
                """The new routes; None when the request belongs to the older ask/await stub."""
                parsed = urllib.parse.urlsplit(self.path)
                path, query = parsed.path, urllib.parse.parse_qs(parsed.query)
                base = "/api/org/worklanes"
                if path == "/.well-known/oauth-authorization-server":
                    return 200, {"issuer": stub.base, "authorization_endpoint": stub.base + "/oauth/authorize",
                                 "token_endpoint": stub.base + "/api/oauth/token",
                                 "registration_endpoint": stub.base + "/api/oauth/register",
                                 "revocation_endpoint": stub.base + "/api/oauth/revoke", "scopes_supported": ["worklanes"]}
                if path == "/api/oauth/register":
                    stub.oauth["register"] = body
                    return 201, {"client_id": "client-1", "client_name": body.get("client_name"), "redirect_uris": body.get("redirect_uris")}
                if path == "/oauth/authorize":
                    q = {k: v[0] for k, v in query.items()}
                    stub.oauth["authorize"] = q
                    target = q["redirect_uri"] + "?" + urllib.parse.urlencode({"code": "code-1", "state": q["state"]})
                    return 302, target
                if path == "/api/oauth/token":
                    stub.oauth["token"] = body
                    auth = stub.oauth.get("authorize", {})
                    digest = hashlib.sha256(body.get("code_verifier", "").encode()).digest()
                    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
                    if body.get("code") != "code-1" or challenge != auth.get("code_challenge") or body.get("redirect_uri") != auth.get("redirect_uri"):
                        return 400, {"error": "invalid_grant"}
                    return 200, {"access_token": stub.issue, "token_type": "Bearer", "scope": "worklanes"}
                if path == "/api/oauth/revoke":
                    stub.revoked.append(body.get("token"))
                    return 200, {"revoked": True}
                if path == base + "/whoami":
                    return 200, stub.whoami
                if path == base + "/cards/ask" and self.command == "POST" and stub.mode not in ("refuse401", "refuse403"):
                    to = stub.resolve(body.get("to"))
                    if to is None:
                        return 404, {"error": "agent_unknown"}
                    stub.resolved.append(to)
                    return 200, {"cardId": "card-123"}
                if path == base + "/setup-status":
                    open_asks = [a for a in stub.asks if a["cardId"] not in stub.answers]
                    return 200, {"openAsks": open_asks, "notice": {"mode": "polling"}}
                m = re.fullmatch(base + r"/cards/([^/]+)/answer", path)
                if m:
                    card, key = m.group(1), self.headers.get("Idempotency-Key")
                    if card in stub.answers:
                        if stub.answers[card][0] == key:
                            return 200, {"cardId": card, "lane": "waiting", "replayed": True}
                        return 409, {"error": "already_answered"}
                    stub.answers[card] = (key, body)
                    return 201, {"cardId": card, "lane": "waiting", "replayed": False}
                m = re.fullmatch(base + r"/cards/([^/]+)", path)
                if m and self.command == "GET" and m.group(1) in stub.cards:
                    return 200, {"card": stub.cards[m.group(1)], "activity": [], "threads": []}
                return None

            def _routed(self, body):
                hit = self._route(body)
                if hit is None:
                    return False
                code, payload = hit
                if code == 302:
                    self.send_response(302)
                    self.send_header("Location", payload)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                else:
                    self._send(code, payload)
                return True

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) or b""
                if (self.headers.get("Content-Type") or "").startswith("application/x-www-form-urlencoded"):
                    body = {k: v[0] for k, v in urllib.parse.parse_qs(raw.decode()).items()}
                else:
                    body = json.loads(raw or b"{}")
                self._record(body)
                if self._routed(body):
                    return
                if stub.mode == "refuse401":
                    return self._send(401, {"error": "unauthorized", "echo": FAKE})
                if stub.mode == "refuse403":
                    return self._send(403, {"error": "not_addressed_to_you"})
                self._send(200, {"cardId": "card-123"})

            def do_GET(self):
                self._record()
                if self._routed(None):
                    return
                if stub.mode == "refuse401":
                    return self._send(401, {"error": "unauthorized"})
                if stub.mode == "wait":
                    return self._send(200, {"status": "waiting", "nextSince": "cur-%d" % len(stub.requests)})
                if stub.waits_before_answer > 0:
                    stub.waits_before_answer -= 1
                    return self._send(200, {"status": "waiting", "nextSince": "cur-%d" % len(stub.requests)})
                if stub.mode == "pong":
                    return self._send(200, {"status": "done", "result": "pong", "answeredBy": "grok"})
                if stub.mode == "other":
                    return self._send(200, {"status": "done", "result": "hello", "answeredBy": "grok"})
                self._send(200, stub.answer)

        return Handler

    def resolve(self, to):
        """Mirrors the platform's resolveAgent: an agentId, or a unique name, compared without the `oauth · ` prefix
        and case-insensitively."""
        if not isinstance(to, str) or not to.strip():
            return None
        if to in self.agents:
            return to
        want = to.strip().lower()
        label = lambda raw: (raw[len("oauth · "):] if raw.startswith("oauth · ") else raw).strip().lower()
        hits = [agent for agent, raw in self.agents.items() if label(raw) == want]
        return hits[0] if len(hits) == 1 else None

    def __enter__(self):
        self.thread.start()
        self.base = "http://127.0.0.1:%d" % self.server.server_address[1]
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


def run_ask(stub, args, credential_file, extra_env=None):
    env = {k: v for k, v in os.environ.items() if k != "WORKLANES_CREDENTIAL_FILE"}
    env.update(extra_env or {})
    cmd = [sys.executable, ASK, "--api-base", stub.base if stub else "http://127.0.0.1:9",
           "--min-poll-s", "0.05"]
    if credential_file:
        cmd += ["--credential-file", credential_file]
    proc = subprocess.run(cmd + args, capture_output=True, text=True, env=env, timeout=60)
    return proc


class AskTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cred = os.path.join(self.tmp.name, "agent_credential.txt")
        with open(self.cred, "w", encoding="utf-8-sig") as handle:  # writes a BOM, as PowerShell does
            handle.write(FAKE + "\r\n")

    def tearDown(self):
        self.tmp.cleanup()

    def no_leak(self, proc):
        self.assertNotIn(FAKE, proc.stdout)
        self.assertNotIn(FAKE, proc.stderr)

    def test_ask_returns_card_id_and_sends_the_contract(self):
        with Stub() as stub:
            proc = run_ask(stub, ["ask", "--to", "grok", "--task", "do it", "--context", "ctx", "--board", "b1"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            out = json.loads(proc.stdout)
            self.assertEqual(out["cardId"], "card-123")
            req = stub.requests[0]
            self.assertEqual((req["method"], req["path"]), ("POST", "/api/org/worklanes/cards/ask"))
            self.assertEqual(req["headers"]["Authorization"], "Bearer " + FAKE)  # BOM and CRLF stripped
            self.assertTrue(req["headers"]["User-Agent"].startswith("Mozilla/5.0"))
            self.assertEqual(req["headers"]["Idempotency-Key"], req["body"]["idempotencyKey"])
            self.assertEqual({k: v for k, v in req["body"].items() if k != "idempotencyKey"},
                             {"to": "grok", "task": "do it", "context": "ctx", "boardId": "b1"})
        self.no_leak(proc)

    def test_await_returns_the_result(self):
        with Stub() as stub:
            stub.waits_before_answer = 1
            proc = run_ask(stub, ["await", "--card", "card-123", "--timeout", "20"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            out = json.loads(proc.stdout)
            self.assertEqual((out["status"], out["result"], out["data"], out["answeredBy"]),
                             ("done", "the answer", {"n": 1}, "grok"))
            self.assertIn("elapsedS", out)
            first, second = stub.requests
            self.assertTrue(first["path"].startswith("/api/org/worklanes/cards/card-123/await?"))
            self.assertIn("timeoutSec=", first["path"])
            self.assertIn("since=cur-1", second["path"])  # carries the cursor between waits
        self.no_leak(proc)

    def test_await_timeout_exits_2_with_a_resumable_cursor(self):
        with Stub() as stub:
            stub.mode = "wait"
            proc = run_ask(stub, ["await", "--card", "card-123", "--timeout", "1"], self.cred)
            self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
            out = json.loads(proc.stdout)
            self.assertEqual(out["status"], "waiting")
            self.assertEqual(out["cardId"], "card-123")
            self.assertTrue(out["since"].startswith("cur-"))
            self.assertEqual(out["hint"], "re-run: ask.py await --card card-123")
            cursor = out["since"]
            stub.mode = "answer"
            resumed = run_ask(stub, ["await", "--card", "card-123", "--since", cursor, "--timeout", "5"], self.cred)
            self.assertEqual(resumed.returncode, 0, resumed.stdout + resumed.stderr)
            self.assertIn("since=" + urllib.parse.quote(cursor), stub.requests[-1]["path"])
        self.no_leak(proc)

    def test_ping_exits_0_only_on_pong(self):
        with Stub() as stub:
            stub.mode = "pong"
            ok = run_ask(stub, ["ping", "--to", "grok", "--timeout", "10"], self.cred)
            self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
            out = json.loads(ok.stdout)
            self.assertTrue(out["pong"])
            self.assertIn("roundTripS", out)
            self.assertEqual(stub.requests[0]["body"]["task"], "ping")
            stub.mode = "other"
            bad = run_ask(stub, ["ping", "--to", "grok", "--timeout", "10"], self.cred)
            self.assertEqual(bad.returncode, 3)
            self.assertFalse(json.loads(bad.stdout)["pong"])
            stub.mode = "wait"
            slow = run_ask(stub, ["ping", "--to", "grok", "--timeout", "1"], self.cred)
            self.assertEqual(slow.returncode, 2)
            self.assertEqual(json.loads(slow.stdout)["hint"], "re-run: ask.py await --card card-123")
        self.no_leak(ok)

    def test_refusals_exit_3_with_the_boards_code(self):
        with Stub() as stub:
            stub.mode = "refuse401"
            unauthorized = run_ask(stub, ["ask", "--to", "grok", "--task", "x"], self.cred)
            self.assertEqual(unauthorized.returncode, 3)
            self.assertEqual(json.loads(unauthorized.stdout)["error"], "unauthorized")
            self.assertEqual(json.loads(unauthorized.stdout)["http"], 401)
            stub.mode = "refuse403"
            forbidden = run_ask(stub, ["ask", "--to", "grok", "--task", "x"], self.cred)
            self.assertEqual(forbidden.returncode, 3)
            self.assertEqual(json.loads(forbidden.stdout)["error"], "not_addressed_to_you")
        self.no_leak(unauthorized)
        self.no_leak(forbidden)

    def test_missing_credential_exits_4(self):
        missing = os.path.join(self.tmp.name, "absent_credential.txt")
        proc = run_ask(None, ["ask", "--to", "grok", "--task", "x"], missing)
        self.assertEqual(proc.returncode, 4)
        self.assertEqual(json.loads(proc.stdout)["error"], "credential_file_unreadable")
        empty = os.path.join(self.tmp.name, "empty_credential.txt")
        open(empty, "w").close()
        self.assertEqual(run_ask(None, ["status"], empty).returncode, 4)

    def test_status_before_the_first_login_exits_4_and_says_next(self):
        absent = os.path.join(self.tmp.name, "never_written", "agent_credential.txt")
        proc = run_ask(None, ["status"], absent)
        self.assertEqual(proc.returncode, 4)
        out = json.loads(proc.stdout)
        self.assertEqual((out["loggedIn"], out["expected"], out["error"]), (False, True, "not_logged_in"))
        self.assertEqual(out["next"], "run ask.py login --name <agent name>")
        self.assertTrue(out["askPy"].endswith(os.path.join("scripts", "ask.py")))

    def test_ask_resolves_a_name_stored_as_oauth_label(self):
        with Stub() as stub:
            proc = run_ask(stub, ["ask", "--to", "claude-code", "--task", "x"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertEqual(stub.resolved, ["tok-cc"])
            by_id = run_ask(stub, ["ask", "--to", "tok-grok", "--task", "x"], self.cred)
            self.assertEqual(by_id.returncode, 0, by_id.stdout + by_id.stderr)
            prefixed = run_ask(stub, ["ask", "--to", "nobody", "--task", "x"], self.cred)
            self.assertEqual(prefixed.returncode, 3)
            self.assertEqual(json.loads(prefixed.stdout)["error"], "agent_unknown")
            self.assertEqual(stub.resolved, ["tok-cc", "tok-grok"])
        self.no_leak(proc)

    def test_env_var_selects_the_credential_file(self):
        with Stub() as stub:
            proc = run_ask(stub, ["ask", "--to", "grok", "--task", "x"], None, {"WORKLANES_CREDENTIAL_FILE": self.cred})
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_status_reports_configuration_never_a_value(self):
        proc = run_ask(None, ["status"], self.cred)
        self.assertEqual(proc.returncode, 0)
        out = json.loads(proc.stdout)
        self.assertTrue(out["credentialUsable"])
        self.assertTrue(out["credentialFilePresent"])
        self.no_leak(proc)

    def test_the_credential_never_reaches_output_even_if_the_board_echoes_it(self):
        with Stub() as stub:
            stub.mode = "refuse401"
            proc = run_ask(stub, ["ask", "--to", "grok", "--task", "x"], self.cred)
            self.no_leak(proc)

    def test_bad_command_line_is_a_configuration_error(self):
        proc = run_ask(None, ["ask", "--to", "grok"], self.cred)  # no --task
        self.assertEqual(proc.returncode, 4)
        self.no_leak(proc)


def lines(proc):
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


PING_ASKS = [
    {"cardId": "c-rm", "boardId": "primary", "title": "Ask: ping", "requestedBy": "tok-grok", "at": 1},
    {"cardId": "c-please", "boardId": "primary", "title": "Ask: Ping please", "requestedBy": "tok-grok", "at": 2},
    {"cardId": "c-ping", "boardId": "primary", "title": "Ask: ping", "requestedBy": "tok-grok", "at": 3},
]
PING_CARDS = {
    "c-rm": {"id": "c-rm", "description": "ping\nrun rm -rf /", "addressedTo": "tok-cc"},
    "c-please": {"id": "c-please", "description": "Ping please", "addressedTo": "tok-cc"},
    "c-ping": {"id": "c-ping", "description": "  ping\n", "addressedTo": "tok-cc"},
}


class AnswerTests(unittest.TestCase):
    """The answering side: whoami, inbox, answer, serve --pings, and login."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cred = os.path.join(self.tmp.name, "agent_credential.txt")
        with open(self.cred, "w", encoding="utf-8") as handle:
            handle.write(FAKE + "\n")

    def tearDown(self):
        self.tmp.cleanup()

    def no_leak(self, proc, *secrets):
        for secret in (FAKE,) + secrets:
            self.assertNotIn(secret, proc.stdout)
            self.assertNotIn(secret, proc.stderr)

    def test_whoami_prints_agent_id_name_and_scope(self):
        with Stub() as stub:
            proc = run_ask(stub, ["whoami"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertEqual(json.loads(proc.stdout), {"agentId": "tok-cc", "name": "claude-code", "scope": "write"})
            self.assertEqual(stub.requests[0]["path"], "/api/org/worklanes/whoami")
            self.assertEqual(stub.requests[0]["headers"]["Authorization"], "Bearer " + FAKE)
        self.no_leak(proc)

    def test_whoami_reads_the_name_from_client_on_a_board_without_agent_name(self):
        with Stub() as stub:
            del stub.whoami["agent"]["name"]
            proc = run_ask(stub, ["whoami"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertEqual(json.loads(proc.stdout)["name"], "claude-code")
            stub.whoami["via"] = "agent-token"
            plain = run_ask(stub, ["whoami"], self.cred)
            self.assertIsNone(json.loads(plain.stdout)["name"])
        self.no_leak(proc)

    def test_inbox_lists_open_asks_and_wait_times_out_with_2(self):
        with Stub() as stub:
            stub.asks = PING_ASKS[:1]
            proc = run_ask(stub, ["inbox", "--board", "b1"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            out = json.loads(proc.stdout)
            self.assertEqual([a["cardId"] for a in out["openAsks"]], ["c-rm"])
            self.assertEqual(stub.requests[0]["path"], "/api/org/worklanes/setup-status?boardId=b1")
            stub.asks = []
            empty = run_ask(stub, ["inbox", "--wait", "1", "--interval", "0.1"], self.cred)
            self.assertEqual(empty.returncode, 2, empty.stdout + empty.stderr)
            self.assertEqual(json.loads(empty.stdout)["openAsks"], [])
            self.assertGreater(len(stub.requests), 2)  # it polled
        self.no_leak(proc)
        self.no_leak(empty)

    def test_answer_sends_the_contract_replays_and_refuses_a_second_answer(self):
        with Stub() as stub:
            args = ["answer", "--card", "c-ping", "--status", "done", "--result", "pong", "--data", '{"n": 2}']
            proc = run_ask(stub, args, self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            req = stub.requests[0]
            self.assertEqual((req["method"], req["path"]), ("POST", "/api/org/worklanes/cards/c-ping/answer"))
            self.assertEqual(req["headers"]["Idempotency-Key"], "answer-c-ping")
            self.assertEqual(req["body"], {"status": "done", "result": "pong", "data": {"n": 2}})
            self.assertFalse(json.loads(proc.stdout)["replayed"])
            replay = run_ask(stub, args, self.cred)
            self.assertEqual(replay.returncode, 0, replay.stdout + replay.stderr)
            self.assertTrue(json.loads(replay.stdout)["replayed"])
            other = run_ask(stub, ["answer", "--card", "c-ping", "--status", "error", "--result", "no",
                                   "--idempotency-key", "another"], self.cred)
            self.assertEqual(other.returncode, 3)
            self.assertEqual(json.loads(other.stdout)["error"], "already_answered")
            bad = run_ask(stub, ["answer", "--card", "c-ping", "--status", "maybe", "--result", "x"], self.cred)
            self.assertEqual(bad.returncode, 4)
        for p in (proc, replay, other, bad):
            self.no_leak(p)

    def test_serve_answers_only_an_exact_ping_and_once_returns_requested_by(self):
        with Stub() as stub:
            stub.asks = list(PING_ASKS)
            stub.cards = dict(PING_CARDS)
            proc = run_ask(stub, ["serve", "--pings", "--once", "--interval", "0.1", "--timeout", "10"], self.cred)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            out = lines(proc)
            self.assertEqual(out[0], {"serving": True, "agentId": "tok-cc", "name": "claude-code"})
            skipped = sorted(o["skipped"] for o in out if "skipped" in o)
            self.assertEqual(skipped, ["c-please", "c-rm"])
            self.assertEqual(set(stub.answers), {"c-ping"})
            key, body = stub.answers["c-ping"]
            self.assertEqual(key, "pong-c-ping")
            self.assertEqual(body, {"status": "done", "result": "pong"})
            last = out[-1]
            self.assertEqual((last["cardId"], last["requestedBy"]), ("c-ping", "tok-grok"))
            self.assertIn("elapsedS", last)
        self.no_leak(proc)

    def test_serve_times_out_with_2_and_needs_pings(self):
        with Stub() as stub:
            stub.asks = PING_ASKS[:1]
            stub.cards = dict(PING_CARDS)
            proc = run_ask(stub, ["serve", "--pings", "--once", "--interval", "0.1", "--timeout", "1"], self.cred)
            self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
            self.assertEqual(sum(1 for o in lines(proc) if o.get("skipped") == "c-rm"), 1)  # listed once
            self.assertEqual(stub.answers, {})
            self.assertEqual(run_ask(stub, ["serve", "--once"], self.cred).returncode, 4)
        self.no_leak(proc)

    def login(self, stub, cred):
        env = {k: v for k, v in os.environ.items() if k != "WORKLANES_CREDENTIAL_FILE"}
        cmd = [sys.executable, ASK, "--api-base", stub.base, "--credential-file", cred,
               "login", "--name", "claude-code", "--no-browser", "--timeout", "30"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        url, seen = None, []
        while url is None:
            line = proc.stderr.readline()
            if not line:
                break
            seen.append(line)
            for word in line.split():
                if word.startswith(stub.base + "/oauth/authorize?"):
                    url = word
        if url is None:
            proc.kill()
        self.assertIsNotNone(url, "".join(seen))
        # The person's browser: open the link and press Allow; the board redirects to the loopback listener.
        with urllib.request.urlopen(url, timeout=10) as page:
            self.assertEqual(page.status, 200)
        stdout, stderr = proc.communicate(timeout=30)
        return proc.returncode, stdout, "".join(seen) + stderr

    def test_login_registers_uses_pkce_writes_the_file_and_never_prints_the_token(self):
        fresh = os.path.join(self.tmp.name, "sub", "agent_credential.txt")
        with Stub() as stub:
            code, stdout, stderr = self.login(stub, fresh)
            self.assertEqual(code, 0, stdout + stderr)
            reg = stub.oauth["register"]
            self.assertEqual(reg["client_name"], "claude-code")
            redirect = reg["redirect_uris"][0]
            self.assertRegex(redirect, r"^http://127\.0\.0\.1:\d+/cb$")
            auth = stub.oauth["authorize"]
            self.assertEqual((auth["code_challenge_method"], auth["redirect_uri"], auth["client_id"]), ("S256", redirect, "client-1"))
            self.assertEqual(auth["resource"], stub.base + "/api/mcp")
            self.assertEqual(stub.oauth["token"]["grant_type"], "authorization_code")
            self.assertEqual(stub.revoked, [])  # nothing to revoke on a first login
            with open(fresh, encoding="utf-8") as handle:
                self.assertEqual(handle.read().strip(), stub.issue)
            first, out = [json.loads(x) for x in stdout.strip().splitlines()]
            self.assertEqual((first["status"], first["browserOpened"], first["expiresInSec"]), ("waiting_for_allow", False, 30))
            self.assertTrue(first["link"].startswith(stub.base + "/oauth/authorize?"))
            self.assertTrue(out["loggedIn"])
            self.assertEqual(out["name"], "claude-code")
            for text in (stdout, stderr):
                self.assertNotIn(stub.issue, text)
                self.assertNotIn("code-1", text)

    def start_login(self, stub, timeout):
        env = {k: v for k, v in os.environ.items() if k != "WORKLANES_CREDENTIAL_FILE"}
        cred = os.path.join(self.tmp.name, "sub", "agent_credential.txt")
        proc = subprocess.Popen([sys.executable, ASK, "--api-base", stub.base, "--credential-file", cred, "login",
                                 "--name", "claude-code", "--no-browser", "--timeout", str(timeout)],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
        first = json.loads(proc.stdout.readline())
        query = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(first["link"]).query).items()}
        port = urllib.parse.urlsplit(query["redirect_uri"]).port
        return proc, first, query, port

    def test_login_prints_the_waiting_line_with_link_and_expiry_before_blocking(self):
        with Stub() as stub:
            proc, first, query, port = self.start_login(stub, 7)
            proc.kill()
            proc.communicate()
        self.assertEqual(set(first), {"status", "link", "expiresInSec", "browserOpened"})
        self.assertEqual((first["status"], first["expiresInSec"], first["browserOpened"]), ("waiting_for_allow", 7, False))

    def test_login_default_timeout_is_900(self):
        with open(ASK, encoding="utf-8") as handle:
            self.assertRegex(handle.read(), r'login\.add_argument\("--timeout", type=float, default=900')

    def test_an_idle_connection_cannot_block_the_real_callback(self):
        import socket
        with Stub() as stub:
            proc, first, query, port = self.start_login(stub, 30)
            idle = socket.create_connection(("127.0.0.1", port))
            try:
                t0 = time.monotonic()
                with urllib.request.urlopen(first["link"], timeout=10) as page:
                    body = page.read().decode()
                self.assertLess(time.monotonic() - t0, 5)
                self.assertIn("Allow received. Finishing in the agent: check it for the result.", body)
                self.assertNotIn("Connected", body)
                out, _ = proc.communicate(timeout=20)
            finally:
                idle.close()
                proc.kill()
        self.assertEqual(proc.returncode, 0, out)
        self.assertTrue(json.loads(out.strip().splitlines()[-1])["loggedIn"])

    def test_only_an_idle_connection_still_exits_5_within_timeout_plus_2(self):
        import socket
        with Stub() as stub:
            proc, first, query, port = self.start_login(stub, 3)
            idle = socket.create_connection(("127.0.0.1", port))
            try:
                t0 = time.monotonic()
                out, _ = proc.communicate(timeout=30)
                elapsed = time.monotonic() - t0
            finally:
                idle.close()
                proc.kill()
        self.assertEqual(proc.returncode, 5, out)
        self.assertLessEqual(elapsed, 3 + 2)

    def test_login_without_allow_in_time_exits_5_and_says_to_run_login_again(self):
        fresh = os.path.join(self.tmp.name, "sub", "agent_credential.txt")
        with Stub() as stub:
            env = {k: v for k, v in os.environ.items() if k != "WORKLANES_CREDENTIAL_FILE"}
            proc = subprocess.run([sys.executable, ASK, "--api-base", stub.base, "--credential-file", fresh,
                                   "login", "--name", "claude-code", "--no-browser", "--timeout", "1"],
                                  capture_output=True, text=True, env=env, timeout=60)
            self.assertEqual(proc.returncode, 5, proc.stdout + proc.stderr)
            first, out = [json.loads(x) for x in proc.stdout.strip().splitlines()]
            self.assertEqual(first["status"], "waiting_for_allow")
            self.assertEqual((out["loggedIn"], out["status"], out["error"]), (False, "login_timeout", "no_allow_in_time"))
            self.assertEqual(out["next"], "run ask.py login --name claude-code again, then press Allow on the NEW link it shows "
                                          "(the old one no longer works)")
            self.assertNotIn("await", proc.stdout)
            self.assertFalse(os.path.exists(fresh))
            self.assertNotIn("token", stub.oauth)

    def test_relogin_revokes_the_previous_token(self):
        with Stub() as stub:
            code, stdout, stderr = self.login(stub, self.cred)
            self.assertEqual(code, 0, stdout + stderr)
            self.assertEqual(stub.revoked, [FAKE])
            self.assertTrue(json.loads(stdout.strip().splitlines()[-1])["revokedPrevious"])
            with open(self.cred, encoding="utf-8") as handle:
                self.assertEqual(handle.read().strip(), stub.issue)
            for text in (stdout, stderr):
                self.assertNotIn(stub.issue, text)
                self.assertNotIn(FAKE, text)

    def test_no_command_prints_the_credential_even_when_the_board_echoes_it(self):
        with Stub() as stub:
            stub.whoami = {"kind": "agent", "agent": {"agentId": "tok-cc", "name": FAKE, "scope": "write"}}
            stub.asks = [{"cardId": "c-ping", "boardId": "primary", "title": FAKE, "requestedBy": FAKE}]
            stub.cards = {"c-ping": {"id": "c-ping", "description": "ping"}}
            for args in (["whoami"], ["inbox"], ["status"],
                         ["answer", "--card", "c-x", "--status", "done", "--result", "ok"],
                         ["serve", "--pings", "--once", "--interval", "0.1", "--timeout", "5"]):
                proc = run_ask(stub, args, self.cred)
                self.no_leak(proc)


if __name__ == "__main__":
    unittest.main()

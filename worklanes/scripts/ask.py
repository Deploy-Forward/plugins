#!/usr/bin/env python3
"""Ask another agent through a Deploy Forward board, wait for its answer, and answer asks addressed to you.

Standard library only. Commands:
  status                                     what is configured, never a value
  login  --name <agent name>                 connect this agent: a browser tab opens, the person presses Allow
  whoami                                     this agent's agentId, name and scope
  ask    --to <agent> --task <text> [--context <text>] [--board <id>]
  await  --card <id> [--timeout 540] [--since <cursor>]
  ping   --to <agent> [--timeout 120]
  inbox  [--board <id>] [--wait <s>]         asks addressed to this agent and not yet answered
  answer --card <id> --status done|error --result <text> [--data <json>]
  serve  --pings [--once] [--board <id>] [--interval 10] [--timeout <s>]

`--to` takes an agentId, or an agent name. The await cursor is the platform's `nextSince`; it is printed as
`since` and passed back with `--since`.

Every command prints one JSON object on stdout (`login` first prints a `waiting_for_allow` line with the link); `serve` prints one per line as it works.
Exit codes: 0 ok; 2 timed out (resume with `await`); 3 refused or not_pong; 4 configuration missing (before the
first `login` this is expected: `status` says `loggedIn: false` and `next`); 5 `login` saw no Allow in time (run
`login` again and press Allow on the NEW link it shows; nothing to resume).

The credential is an agent token that `login` writes to a file (owner-only). It is read from that file at call
time, stripped of a BOM and whitespace, and never printed.
"""
import argparse
import base64
import hashlib
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_API_BASE = "https://app.deployforward.dev"
DEFAULT_CREDENTIAL_FILE = os.path.join("~", ".config", "worklanes", "agent_credential.txt")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SERVER_WAIT_MAX = 50  # seconds per await request; the board caps a single wait at 55
API = "/api/org/worklanes"


class Config(Exception):
    pass


def credential_path(args):
    raw = args.credential_file or os.environ.get("WORKLANES_CREDENTIAL_FILE") or DEFAULT_CREDENTIAL_FILE
    return os.path.expanduser(raw)


def read_credential(path):
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            value = handle.read().strip()
    except OSError:
        raise Config("credential_file_unreadable")
    except UnicodeDecodeError:
        raise Config("credential_file_not_utf8")
    if not value:
        raise Config("credential_file_empty")
    if not usable_token(value):
        raise Config("credential_file_malformed")
    return value


def usable_token(value):
    return isinstance(value, str) and bool(value) and value.isascii() and not any(c.isspace() or ord(c) < 33 for c in value)


def write_credential(path, value):
    """Writes the token atomically, readable by its owner only."""
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, mode=0o700, exist_ok=True)
    temp = "%s.tmp-%d" % (path, os.getpid())
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.remove(temp)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


class Out:
    """Prints JSON on stdout and scrubs every credential from anything it prints."""

    def __init__(self):
        self.secrets = []

    def line(self, obj):
        text = json.dumps(obj, ensure_ascii=False)
        for secret in self.secrets:
            text = text.replace(secret, "[redacted]")
        sys.stdout.write(text + "\n")
        sys.stdout.flush()

    def emit(self, obj, code):
        self.line(obj)
        return code


OUT = Out()


class Refused(Exception):
    def __init__(self, code, http=None):
        self.code = code
        self.http = http


class Transient(Exception):
    pass


def call(args, credential, method, path, body=None, headers=None, timeout=70, form=None, url=None):
    url = url or args.api_base.rstrip("/") + path
    if form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
    else:
        data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    if credential:
        request.add_header("Authorization", "Bearer " + credential)
    request.add_header("Accept", "application/json")
    request.add_header("User-Agent", USER_AGENT)
    if form is not None:
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        request.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        try:
            parsed = json.loads(error.read() or b"{}")
        except ValueError:
            parsed = {}
        if error.code >= 500:
            raise Transient()
        code = None
        if isinstance(parsed, dict):
            code = parsed.get("error") if isinstance(parsed.get("error"), str) else parsed.get("code")
        raise Refused(code if isinstance(code, str) else "http_%d" % error.code, error.code)
    except (urllib.error.URLError, OSError, TimeoutError):
        raise Transient()
    try:
        parsed = json.loads(raw or b"{}")
    except ValueError:
        raise Refused("bad_response")
    if not isinstance(parsed, dict):
        raise Refused("bad_response")
    return parsed


def once(args, credential, method, path, *rest, **kw):
    """One call where an unreachable board is a refusal, not a retry."""
    try:
        return call(args, credential, method, path, *rest, **kw)
    except Transient:
        raise Refused("unreachable")


def board_query(board):
    return "?" + urllib.parse.urlencode({"boardId": board}) if board else ""


def card_path(card, suffix="", board=None):
    return "%s/cards/%s%s%s" % (API, urllib.parse.quote(card, safe=""), suffix, board_query(board))


def await_hint(card):
    return "re-run: ask.py await --card %s" % card


# ---- asking ----------------------------------------------------------------------------------------------


def do_ask(args, credential, task=None, to=None):
    key = args.idempotency_key or str(uuid.uuid4())
    body = {"to": to or args.to, "task": task if task is not None else args.task, "idempotencyKey": key}
    if getattr(args, "context", None):
        body["context"] = args.context
    if getattr(args, "board", None):
        body["boardId"] = args.board
    reply = once(args, credential, "POST", API + "/cards/ask", body, {"Idempotency-Key": key})
    card = reply.get("cardId") or reply.get("id")
    if not isinstance(card, str) or not card:
        raise Refused("bad_response")
    return card, key


def do_await(args, credential, card, timeout, since=None):
    start = time.monotonic()
    cursor = since
    while True:
        remaining = timeout - (time.monotonic() - start)
        if remaining <= 0:
            return {"status": "waiting", "cardId": card, "since": cursor, "elapsedS": round(time.monotonic() - start, 1),
                    "hint": await_hint(card)}, False
        wait = max(1, min(SERVER_WAIT_MAX, int(remaining)))
        query = {"timeoutSec": str(wait)}
        if cursor:
            query["since"] = cursor
        path = card_path(card, "/await") + "?" + urllib.parse.urlencode(query)
        began = time.monotonic()
        try:
            reply = call(args, credential, "GET", path, timeout=wait + 15)
        except Transient:
            reply = None
        if reply is not None and reply.get("status") != "waiting":
            return {
                "status": reply.get("status"),
                "cardId": card,
                "result": reply.get("result"),
                "data": reply.get("data"),
                "answeredBy": reply.get("answeredBy"),
                "at": reply.get("at"),
                "elapsedS": round(time.monotonic() - start, 1),
            }, True
        if reply is not None and reply.get("nextSince") is not None:
            cursor = str(reply["nextSince"])
        pause = args.min_poll_s - (time.monotonic() - began)
        if pause > 0:
            time.sleep(min(pause, max(0.0, timeout - (time.monotonic() - start))))


# ---- answering -------------------------------------------------------------------------------------------


def do_whoami(args, credential):
    reply = once(args, credential, "GET", API + "/whoami")
    agent = reply.get("agent")
    if not isinstance(agent, dict) or not agent.get("agentId"):
        raise Refused("not_an_agent_token")
    # agent.name is the name other agents address you by; a board that predates it carries the same name for an
    # agent connected by Allow in the top-level `client` (its label without the `oauth · ` prefix).
    name = agent.get("name")
    if not isinstance(name, str) or not name:
        client = reply.get("client")
        name = client if reply.get("via") == "oauth" and isinstance(client, str) and client else None
    return {"agentId": agent.get("agentId"), "name": name, "scope": agent.get("scope")}


def fetch_inbox(args, credential, board):
    reply = call(args, credential, "GET", API + "/setup-status" + board_query(board))
    asks = reply.get("openAsks")
    return [a for a in asks if isinstance(a, dict) and a.get("cardId")] if isinstance(asks, list) else []


def do_answer(args, credential, card, status, result, data=None, key=None, board=None):
    body = {"status": status, "result": result}
    if data is not None:
        body["data"] = data
    reply = once(args, credential, "POST", card_path(card, "/answer", board), body,
                 {"Idempotency-Key": key or "answer-%s" % card})
    return {"cardId": card, "status": status, "lane": reply.get("lane"), "replayed": bool(reply.get("replayed"))}


def do_inbox(args, credential):
    start = time.monotonic()
    while True:
        try:
            asks = fetch_inbox(args, credential, args.board)
        except Transient:
            if args.wait is None:
                raise Refused("unreachable")
            asks = []
        elapsed = time.monotonic() - start
        if asks or args.wait is None:
            return OUT.emit({"openAsks": asks, "count": len(asks)}, 0)
        if elapsed >= args.wait:
            return OUT.emit({"openAsks": [], "count": 0, "elapsedS": round(elapsed, 1)}, 2)
        time.sleep(min(args.interval, max(0.0, args.wait - elapsed)))


def do_serve(args, credential):
    """Answers exact pings with pong; lists every other ask as skipped and never runs it."""
    me = do_whoami(args, credential)
    OUT.line({"serving": True, "agentId": me["agentId"], "name": me["name"]})
    start = time.monotonic()
    seen = set()
    while True:
        try:
            asks = fetch_inbox(args, credential, args.board)
        except Transient:
            asks = []
        for ask in asks:
            card = ask["cardId"]
            if card in seen:
                continue
            seen.add(card)
            board = ask.get("boardId") or args.board
            try:
                snapshot = once(args, credential, "GET", card_path(card, "", board))
            except Refused as refused:
                OUT.line({"skipped": card, "reason": refused.code})
                continue
            description = (snapshot.get("card") or {}).get("description")
            if not isinstance(description, str) or description.strip() != "ping":
                OUT.line({"skipped": card, "requestedBy": ask.get("requestedBy"), "reason": "not_a_ping"})
                continue
            try:
                do_answer(args, credential, card, "done", "pong", key="pong-%s" % card, board=board)
            except Refused as refused:
                OUT.line({"skipped": card, "reason": refused.code})
                continue
            done = {"cardId": card, "requestedBy": ask.get("requestedBy"), "result": "pong",
                    "elapsedS": round(time.monotonic() - start, 1)}
            if args.once:
                return OUT.emit(done, 0)
            OUT.line(done)
        elapsed = time.monotonic() - start
        if args.timeout is not None and elapsed >= args.timeout:
            return OUT.emit({"serving": False, "status": "waiting", "elapsedS": round(elapsed, 1)}, 2)
        pause = args.interval if args.timeout is None else min(args.interval, args.timeout - elapsed)
        time.sleep(max(0.0, pause))


# ---- login -----------------------------------------------------------------------------------------------


def wait_for_code(server, state, timeout):
    """Serves the loopback redirect until it carries our state, or the time runs out.

    Each connection runs on its own daemon thread with a short socket timeout, so a browser's idle (speculative)
    connection can never hold up the real redirect or the deadline."""
    found = {}
    arrived = threading.Event()

    class Callback(BaseHTTPRequestHandler):
        timeout = 5

        def log_message(self, *a):
            pass

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            query = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
            ours = parsed.path == "/cb" and query.get("state") == state
            page = ("Allow received. Finishing in the agent: check it for the result." if ours and "code" in query else
                    "Not connected. Go back to the agent." if ours else "Not found.")
            raw = ("<!doctype html><meta charset=utf-8><title>Deploy Forward</title><p>%s</p>" % page).encode()
            self.send_response(200 if ours else 404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            if ours and not arrived.is_set():
                found.update(query)
                arrived.set()

    server.RequestHandlerClass = Callback
    serving = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True)
    serving.start()
    try:
        return dict(found) if arrived.wait(timeout) else None
    finally:
        server.shutdown()


def do_login(args, path):
    meta = once(args, None, "GET", "/.well-known/oauth-authorization-server")
    endpoints = {k: meta.get(k) for k in ("authorization_endpoint", "token_endpoint", "registration_endpoint")}
    if not all(isinstance(v, str) and v for v in endpoints.values()):
        raise Refused("oauth_metadata_incomplete")
    server = ThreadingHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
    server.daemon_threads = True
    try:
        redirect = "http://127.0.0.1:%d/cb" % server.server_address[1]
        client = once(args, None, "POST", "", url=endpoints["registration_endpoint"], body={
            "client_name": args.name, "redirect_uris": [redirect], "grant_types": ["authorization_code"],
            "response_types": ["code"], "token_endpoint_auth_method": "none"})
        client_id = client.get("client_id")
        if not isinstance(client_id, str) or not client_id:
            raise Refused("bad_response")
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(24)
        resource = args.api_base.rstrip("/") + "/api/mcp"
        query = {"response_type": "code", "client_id": client_id, "redirect_uri": redirect, "code_challenge": challenge,
                 "code_challenge_method": "S256", "state": state, "resource": resource}
        scopes = meta.get("scopes_supported")
        if isinstance(scopes, list) and scopes:
            query["scope"] = " ".join(str(s) for s in scopes)
        link = endpoints["authorization_endpoint"] + "?" + urllib.parse.urlencode(query)
        sys.stderr.write("A browser tab opens on the board: sign in, tick the organisation and press Allow.\n")
        sys.stderr.write("If no tab opened, open this link: %s\n" % link)
        sys.stderr.flush()
        opened = False if args.no_browser else bool(webbrowser.open(link))
        OUT.line({"status": "waiting_for_allow", "link": link, "expiresInSec": int(args.timeout) if float(args.timeout).is_integer() else args.timeout, "browserOpened": opened})
        got = wait_for_code(server, state, args.timeout)
    finally:
        server.server_close()
    if got is None:
        return OUT.emit({"loggedIn": False, "status": "login_timeout", "error": "no_allow_in_time",
                         "next": "run ask.py login --name %s again, then press Allow on the NEW link it shows "
                         "(the old one no longer works)" % args.name}, 5)
    if "code" not in got:
        raise Refused(got.get("error") or "authorization_failed")
    token = once(args, None, "POST", "", url=endpoints["token_endpoint"], form={
        "grant_type": "authorization_code", "code": got["code"], "redirect_uri": redirect, "client_id": client_id,
        "code_verifier": verifier, "resource": resource}).get("access_token")
    if not usable_token(token):
        raise Refused("bad_response")
    OUT.secrets.append(token)
    try:
        previous = read_credential(path)
        OUT.secrets.append(previous)
    except Config:
        previous = None
    try:
        write_credential(path, token)
    except OSError:
        raise Config("credential_file_unwritable")
    revoked = None
    if previous and previous != token:
        revoked = False
        revocation = meta.get("revocation_endpoint")
        if isinstance(revocation, str) and revocation:
            try:
                call(args, None, "POST", "", url=revocation, form={"token": previous}, timeout=20)
                revoked = True
            except (Refused, Transient):
                pass
    return OUT.emit({"loggedIn": True, "name": args.name, "credentialFile": path, "revokedPrevious": revoked,
                     "next": "run ask.py whoami"}, 0)


# ---- entry -----------------------------------------------------------------------------------------------


def plugin_version():
    manifest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude-plugin", "plugin.json")
    try:
        with open(manifest, encoding="utf-8") as handle:
            return json.load(handle).get("version")
    except (OSError, ValueError):
        return None


def run(args):
    path = credential_path(args)
    if args.command == "status":
        info = {"pluginVersion": plugin_version(), "askPy": os.path.abspath(__file__), "apiBase": args.api_base,
                "credentialFile": path, "credentialFilePresent": os.path.isfile(path)}
        try:
            read_credential(path)
        except Config as error:
            info["credentialUsable"] = False
            info["loggedIn"] = False
            info["error"] = "not_logged_in" if not info["credentialFilePresent"] else str(error)
            info["expected"] = not info["credentialFilePresent"]  # exit 4 before the first login is expected
            info["next"] = "run ask.py login --name <agent name>"
            return OUT.emit(info, 4)
        info["credentialUsable"] = True
        info["loggedIn"] = True
        info["next"] = "run ask.py whoami"
        return OUT.emit(info, 0)
    try:
        if args.command == "login":
            return do_login(args, path)
    except Refused as refused:
        return OUT.emit({"status": "refused", "error": refused.code, **({"http": refused.http} if refused.http else {})}, 3)
    except Config as error:
        return OUT.emit({"status": "error", "error": str(error), "credentialFile": path}, 4)
    try:
        credential = read_credential(path)
    except Config as error:
        return OUT.emit({"status": "error", "error": str(error), "credentialFile": path,
                         "next": "run ask.py login --name <agent name>"}, 4)
    OUT.secrets.append(credential)
    try:
        if args.command == "whoami":
            return OUT.emit(do_whoami(args, credential), 0)
        if args.command == "inbox":
            return do_inbox(args, credential)
        if args.command == "answer":
            data = None
            if args.data is not None:
                try:
                    data = json.loads(args.data)
                except ValueError:
                    return OUT.emit({"status": "error", "error": "data_not_json"}, 4)
            return OUT.emit(do_answer(args, credential, args.card, args.status, args.result, data,
                                      args.idempotency_key, args.board), 0)
        if args.command == "serve":
            return do_serve(args, credential)
        if args.command == "ask":
            card, key = do_ask(args, credential)
            return OUT.emit({"cardId": card, "idempotencyKey": key}, 0)
        if args.command == "await":
            reply, answered = do_await(args, credential, args.card, args.timeout, args.since)
            return OUT.emit(reply, 0 if answered else 2)
        if args.command == "ping":
            began = time.monotonic()
            card, _ = do_ask(args, credential, task="ping")
            reply, answered = do_await(args, credential, card, args.timeout)
            if not answered:
                return OUT.emit(reply, 2)
            reply["roundTripS"] = round(time.monotonic() - began, 1)
            text = reply.get("result")
            if reply.get("status") == "done" and isinstance(text, str) and text.strip().lower() == "pong":
                reply["pong"] = True
                return OUT.emit(reply, 0)
            reply["pong"] = False
            reply["error"] = "not_pong"
            return OUT.emit(reply, 3)
    except Refused as refused:
        out = {"status": "refused", "error": refused.code}
        if refused.http:
            out["http"] = refused.http
        return OUT.emit(out, 3)
    return OUT.emit({"status": "error", "error": "unknown_command"}, 3)


def build_parser():
    parser = argparse.ArgumentParser(prog="ask.py", description="Ask another agent through a Deploy Forward board, "
                                     "and answer asks addressed to you.")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--credential-file", default=None)
    parser.add_argument("--min-poll-s", type=float, default=1.0, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="show what is configured, never a value")
    login = sub.add_parser("login", help="connect this agent: a browser tab opens and the person presses Allow")
    login.add_argument("--name", required=True, help="the agent name other agents address you by")
    login.add_argument("--timeout", type=float, default=900, help="seconds to wait for Allow; exit 5 when none came")
    login.add_argument("--no-browser", action="store_true", help=argparse.SUPPRESS)
    sub.add_parser("whoami", help="this agent's agentId, name and scope")
    ask = sub.add_parser("ask", help="create a card addressed to an agent; prints its cardId")
    ask.add_argument("--to", required=True, help="an agentId, or an agent name")
    ask.add_argument("--task", required=True)
    ask.add_argument("--context")
    ask.add_argument("--board")
    ask.add_argument("--idempotency-key")
    wait = sub.add_parser("await", help="wait for the answer on a card; re-run to resume")
    wait.add_argument("--card", required=True)
    wait.add_argument("--timeout", type=float, default=540)
    wait.add_argument("--since", help="the cursor a timed-out await printed (the platform's nextSince)")
    ping = sub.add_parser("ping", help="ask an agent to ping; exit 0 only when it answers pong")
    ping.add_argument("--to", required=True, help="an agentId, or an agent name")
    ping.add_argument("--timeout", type=float, default=120)
    ping.add_argument("--idempotency-key")
    inbox = sub.add_parser("inbox", help="asks addressed to you and not yet answered")
    inbox.add_argument("--board", help="a board other than primary")
    inbox.add_argument("--wait", type=float, help="poll up to this many seconds for an ask; exit 2 if none")
    inbox.add_argument("--interval", type=float, default=10)
    answer = sub.add_parser("answer", help="answer an ask addressed to you")
    answer.add_argument("--card", required=True)
    answer.add_argument("--status", required=True, choices=["done", "error"])
    answer.add_argument("--result", required=True)
    answer.add_argument("--data", help="JSON")
    answer.add_argument("--board")
    answer.add_argument("--idempotency-key", help="default answer-<cardId>")
    serve = sub.add_parser("serve", help="answer exact pings with pong while this runs; never runs any other ask")
    serve.add_argument("--pings", action="store_true", required=True)
    serve.add_argument("--once", action="store_true", help="exit 0 after the first pong")
    serve.add_argument("--board")
    serve.add_argument("--interval", type=float, default=10)
    serve.add_argument("--timeout", type=float)
    return parser


def main(argv=None):
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exit_:
        # argparse exits 2 on a bad command line; 2 means timed out here, so report it as 4.
        return 4 if exit_.code else 0
    return run(args)


if __name__ == "__main__":
    sys.exit(main())

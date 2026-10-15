"""BierPeter alpha: local account and session preparation service."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import threading
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).parent
DB = Path(os.environ.get('BIERPETER_DB', str(ROOT / 'data/bierpeter.sqlite3')))
SECURE = os.environ.get('BIERPETER_SECURE_COOKIE', '0') == '1'
TTL = 12 * 3600
ONLINE_WINDOW = 15
VERSION = '0.2.0-alpha'
AUTH_ATTEMPTS = {}
AUTH_LOCK = threading.Lock()
MODES = {'duel', 'relay', 'marathon', 'general', 'olympics', 'training'}


class Connection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


def connect():
    c = sqlite3.connect(DB, timeout=15, factory=Connection)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c


def init():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE,password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS logins(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,title TEXT,host TEXT REFERENCES users(id),code TEXT UNIQUE);
        CREATE TABLE IF NOT EXISTS members(session TEXT REFERENCES sessions(id),user TEXT REFERENCES users(id),status TEXT,expires INTEGER,PRIMARY KEY(session,user));
        CREATE TABLE IF NOT EXISTS devices(session TEXT REFERENCES sessions(id),id TEXT,PRIMARY KEY(session,id));
        CREATE TABLE IF NOT EXISTS races(id TEXT PRIMARY KEY,session TEXT REFERENCES sessions(id),mode TEXT,policy TEXT,title TEXT,state TEXT DEFAULT 'draft');
        CREATE TABLE IF NOT EXISTS hardware(id TEXT PRIMARY KEY,firmware TEXT,wifi_rssi INTEGER,wifi_channel INTEGER,uptime_ms INTEGER,peer_mac TEXT,peer_active INTEGER,last_seen REAL);
        CREATE TABLE IF NOT EXISTS hardware_events(id INTEGER PRIMARY KEY,device TEXT,type TEXT,details TEXT,received REAL);
        CREATE TABLE IF NOT EXISTS hardware_commands(id TEXT PRIMARY KEY,device TEXT,action TEXT,peer_mac TEXT,state TEXT,detail TEXT,created REAL);
        CREATE TABLE IF NOT EXISTS slots(race TEXT REFERENCES races(id),device TEXT,side INTEGER CHECK(side IN (0,1)),user TEXT REFERENCES users(id),PRIMARY KEY(race,device,side),UNIQUE(race,user));
        ''')


def device_id(value):
    if not isinstance(value, str):
        raise Error(400, 'Gerätekennung fehlt')
    clean = re.sub(r'[:.\- ]', '', value)
    if re.fullmatch(r'[0-9a-fA-F]{12}', clean):
        return clean.upper()
    if re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value):
        return value
    raise Error(400, 'Ungültige Gerätekennung')


def hardware_key():
    path = os.environ.get('DEVICE_API_KEY_FILE', '')
    if path:
        try:
            return Path(path).read_text().strip()
        except OSError:
            return ''
    return os.environ.get('DEVICE_API_KEY', '')


def hardware_status(c, ident):
    row = c.execute('SELECT * FROM hardware WHERE id=?', (ident,)).fetchone()
    if not row:
        return {'id': ident, 'online': False, 'last_seen': None}
    value = dict(row)
    value['online'] = time.time() - value['last_seen'] <= ONLINE_WINDOW
    value['peer_active'] = bool(value['peer_active']) and value['online']
    return value


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return salt + ':' + digest


def text(data, key, maximum=80):
    value = data.get(key, '')
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= maximum:
        raise Error(400, 'Ungültige Angabe: ' + key)
    return value.strip()


class Error(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # No URLs, invitation codes or credentials in request logs.

    def reply(self, status, value, cookie=None):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.headers_common()
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def headers_common(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/api/'):
            return self.handle_api('GET', path, {})
        names = {'/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css'}
        if path not in names:
            return self.reply(404, {'error': 'Nicht gefunden'})
        file = ROOT / 'web' / names[path]
        body = file.read_bytes()
        self.send_response(200)
        self.headers_common()
        self.send_header('Content-Type', {'html': 'text/html', 'js': 'text/javascript', 'css': 'text/css'}[file.suffix[1:]] + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            if not urlsplit(self.path).path.startswith('/api/v1/') and self.headers.get('X-BierPeter-Request') != '1':
                raise Error(403, 'Ungültiger Anfrageursprung')
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 16384:
                raise Error(400, 'Ungültige Anfragegröße')
            if not self.headers.get('Content-Type', '').startswith('application/json'):
                raise Error(415, 'JSON erforderlich')
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise Error(400, 'JSON-Objekt erforderlich')
            self.handle_api('POST', urlsplit(self.path).path, data)
        except Error as e:
            self.reply(e.status, {'error': e.message})
        except (ValueError, UnicodeError):
            self.reply(400, {'error': 'Ungültiges JSON'})

    def user(self, c):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie['bp_session'].value
        except Exception:
            raise Error(401, 'Anmeldung erforderlich')
        u = c.execute('SELECT u.id,u.name FROM users u JOIN logins l ON l.user_id=u.id WHERE l.token=? AND l.expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
        if not u:
            raise Error(401, 'Anmeldung erforderlich')
        return dict(u)

    def access(self, c, sid, u, host=False):
        s = c.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone()
        if not s:
            raise Error(404, 'Session nicht gefunden')
        if host:
            if s['host'] != u['id']:
                raise Error(403, 'Nur der Host darf diese Aktion ausführen')
        elif not c.execute("SELECT 1 FROM members WHERE session=? AND user=? AND status='accepted'", (sid, u['id'])).fetchone():
            raise Error(403, 'Teilnahme noch nicht bestätigt')
        return dict(s)

    def handle_api(self, method, path, d):
        try:
            with connect() as c:
                if method == 'POST':
                    c.execute('BEGIN IMMEDIATE')
                value, cookie = self.api(c, method, path, d)
            self.reply(200, value, cookie)
        except Error as e:
            self.reply(e.status, {'error': e.message})
        except sqlite3.IntegrityError:
            self.reply(409, {'error': 'Name, Gerät oder Position bereits vergeben'})
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Ungültige Angaben'})
        except Exception:
            self.reply(500, {'error': 'Interner Fehler'})

    def hardware_api(self, c, method, path, d):
        expected = hardware_key()
        if len(expected) < 32:
            raise Error(503, 'Gerätezugang noch nicht konfiguriert')
        if not hmac.compare_digest(self.headers.get('X-Device-Key', ''), expected):
            raise Error(401, 'Ungültiger Geräteschlüssel')
        if path == '/api/v1/heartbeat' and method == 'POST':
            ident = device_id(d.get('device_id'))
            if not re.fullmatch(r'[0-9A-F]{12}', ident):
                raise Error(400, 'Heartbeat benötigt eine MAC-Gerätekennung')
            firmware = text(d, 'firmware', 100)
            for key, low, high in (('wifi_rssi', -150, 0), ('wifi_channel', 1, 14), ('uptime_ms', 0, 2**64-1)):
                if type(d.get(key)) is not int or not low <= d[key] <= high:
                    raise Error(400, 'Ungültiger Heartbeat: ' + key)
            peer = device_id(d['peer_mac']) if d.get('peer_mac') else ''
            if peer and not re.fullmatch(r'[0-9A-F]{12}', peer):
                raise Error(400, 'Ungültige Peer-MAC')
            if type(d.get('peer_active', False)) is not bool:
                raise Error(400, 'Ungültiger Peer-Status')
            c.execute('INSERT INTO hardware VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET firmware=excluded.firmware,wifi_rssi=excluded.wifi_rssi,wifi_channel=excluded.wifi_channel,uptime_ms=excluded.uptime_ms,peer_mac=excluded.peer_mac,peer_active=excluded.peer_active,last_seen=excluded.last_seen', (ident, firmware, d['wifi_rssi'], d['wifi_channel'], d['uptime_ms'], peer, int(bool(peer and d.get('peer_active', False))), time.time()))
            return {'status': 'ok', 'device_id': ident}
        if path == '/api/v1/events' and method == 'POST':
            ident, kind = device_id(d.get('device_id')), text(d, 'type', 100)
            details = d.get('details')
            if details is not None and not isinstance(details, dict):
                raise Error(400, 'Ereignisdetails müssen ein JSON-Objekt sein')
            encoded = json.dumps(details)
            if len(encoded.encode()) > 8192:
                raise Error(400, 'Ereignis zu groß')
            cur = c.execute('INSERT INTO hardware_events(device,type,details,received) VALUES(?,?,?,?)', (ident, kind, encoded, time.time()))
            return {'id': cur.lastrowid, 'device_id': ident, 'type': kind}
        if path == '/api/v1/commands' and method == 'GET':
            ident = device_id(parse_qs(urlsplit(self.path).query).get('device_id', [''])[0])
            row = c.execute("SELECT * FROM hardware_commands WHERE device=? AND state='pending' ORDER BY created,id LIMIT 1", (ident,)).fetchone()
            return {'command': self.command_payload(row)}
        if path == '/api/v1/commands/ack' and method == 'POST':
            ident = device_id(d.get('device_id'))
            row = c.execute('SELECT * FROM hardware_commands WHERE id=?', (text(d, 'command_id', 64),)).fetchone()
            if not row:
                raise Error(404, 'Befehl nicht gefunden')
            if row['device'] != ident:
                raise Error(403, 'Befehl gehört zu einem anderen Gerät')
            if type(d.get('success')) is not bool:
                raise Error(400, 'Ungültige Bestätigung')
            detail = d.get('detail') or ''
            if not isinstance(detail, str) or len(detail) > 500:
                raise Error(400, 'Ungültige Befehlsdetails')
            c.execute("UPDATE hardware_commands SET state=?,detail=? WHERE id=? AND state='pending'", ('ack_ok' if d['success'] else 'ack_failed', detail, row['id']))
            return {'command': self.command_payload(c.execute('SELECT * FROM hardware_commands WHERE id=?', (row['id'],)).fetchone())}
        raise Error(404, 'Geräte-Endpunkt nicht gefunden')

    @staticmethod
    def command_payload(row):
        if not row:
            return None
        return {'command_id': row['id'], 'device_id': row['device'], 'action': row['action'], 'peer_mac': row['peer_mac'], 'state': row['state'], 'detail': row['detail']}

    def api(self, c, method, path, d):
        if path in ('/api/health', '/api/v1/health') and method == 'GET':
            return {'status': 'ok', 'version': VERSION}, None
        if path.startswith('/api/v1/'):
            return self.hardware_api(c, method, path, d), None
        if path in ('/api/register', '/api/login') and method == 'POST':
            name, pw = text(d, 'name', 40), text(d, 'password', 128)
            with AUTH_LOCK:
                now = time.monotonic()
                key = self.client_address[0]
                # Expire old entries to bound retained state.
                for old in list(AUTH_ATTEMPTS):
                    if AUTH_ATTEMPTS[old][0] < now - 60:
                        del AUTH_ATTEMPTS[old]
                start, count = AUTH_ATTEMPTS.get(key, (now, 0))
                if count >= 20:
                    raise Error(429, 'Zu viele Anmeldeversuche; nach einer Minute erneut versuchen')
                AUTH_ATTEMPTS[key] = (start, count + 1)
            if path.endswith('register'):
                if len(pw) < 12:
                    raise Error(400, 'Passwort benötigt mindestens 12 Zeichen')
                c.execute('INSERT INTO users VALUES(?,?,?)', (secrets.token_hex(12), name, password_hash(pw)))
            u = c.execute('SELECT * FROM users WHERE name=?', (name,)).fetchone()
            # Constant-cost hashing also for unknown accounts.
            salt = u['password'].split(':')[0] if u else '0' * 32
            candidate = password_hash(pw, salt)
            if not u or not hmac.compare_digest(candidate, u['password']):
                raise Error(401, 'Anmeldung nicht möglich')
            token = secrets.token_urlsafe(32)
            c.execute('DELETE FROM logins WHERE expires<?', (time.time(),))
            c.execute('INSERT INTO logins VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), u['id'], time.time() + TTL))
            cookie = 'bp_session=' + token + '; Path=/; HttpOnly; SameSite=Strict' + ('; Secure' if SECURE else '')
            return {'id': u['id'], 'name': u['name']}, cookie
        u = self.user(c)
        if path == '/api/logout' and method == 'POST':
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            c.execute('DELETE FROM logins WHERE token=?', (hashlib.sha256(cookie['bp_session'].value.encode()).hexdigest(),))
            return {}, 'bp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
        if path == '/api/me' and method == 'GET':
            return u, None
        if path == '/api/sessions':
            if method == 'POST':
                sid = secrets.token_hex(12)
                c.execute('INSERT INTO sessions VALUES(?,?,?,?)', (sid, text(d, 'title'), u['id'], secrets.token_urlsafe(12)))
                c.execute('INSERT INTO members VALUES(?,?,?,NULL)', (sid, u['id'], 'accepted'))
                if d.get('device'):
                    c.execute('INSERT INTO devices VALUES(?,?)', (sid, device_id(d['device'])))
                return {'id': sid}, None
            return [dict(x) for x in c.execute('SELECT s.*,m.status,m.expires FROM sessions s JOIN members m ON m.session=s.id WHERE m.user=?', (u['id'],))], None
        if path == '/api/join' and method == 'POST':
            s = c.execute('SELECT * FROM sessions WHERE code=?', (text(d, 'code'),)).fetchone()
            if not s:
                raise Error(404, 'Einladung nicht gefunden')
            m = c.execute('SELECT * FROM members WHERE session=? AND user=?', (s['id'], u['id'])).fetchone()
            if not m or (m['status'] != 'accepted' and (m['status'] != 'pending' or m['expires'] < time.time())):
                c.execute("INSERT INTO members VALUES(?,?,?,?) ON CONFLICT(session,user) DO UPDATE SET status='pending',expires=excluded.expires", (s['id'], u['id'], 'pending', time.time()+900))
            return {'id': s['id']}, None
        parts = path.strip('/').split('/')
        if len(parts) >= 3 and parts[:2] == ['api', 'sessions']:
            sid = parts[2]
            if len(parts) == 3 and method == 'GET':
                # Pending invitees enter a real waiting lobby, without accessing the roster.
                srow = c.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone()
                m = c.execute('SELECT * FROM members WHERE session=? AND user=?', (sid, u['id'])).fetchone()
                if not srow:
                    raise Error(404, 'Session nicht gefunden')
                if not m:
                    raise Error(403, 'Keine Teilnahme an dieser Session')
                if m['status'] != 'accepted':
                    return {'id': sid, 'title': srow['title'], 'host_name': c.execute('SELECT name FROM users WHERE id=?', (srow['host'],)).fetchone()['name'], 'membership': 'expired' if m['status']=='pending' and m['expires'] < time.time() else m['status'], 'expires': m['expires']}, None
                s = self.access(c, sid, u)
                s['membership'] = 'accepted'
                s['hardware_key_configured'] = len(hardware_key()) >= 32
                s['members'] = [dict(x) for x in c.execute('SELECT u.id,u.name,m.status,m.expires FROM members m JOIN users u ON u.id=m.user WHERE m.session=?', (sid,))]
                # Pending identities are only visible to host; all participants see accepted roster.
                if s['host'] != u['id']:
                    s['members'] = [x for x in s['members'] if x['status'] == 'accepted']
                s['devices'] = [x['id'] for x in c.execute('SELECT id FROM devices WHERE session=? ORDER BY id', (sid,))]
                s['hardware'] = [hardware_status(c, ident) for ident in s['devices']]
                s['commands'] = [dict(x) for x in c.execute('SELECT id,device,action,peer_mac,state,detail FROM hardware_commands WHERE device IN (SELECT id FROM devices WHERE session=?) ORDER BY created', (sid,))]
                s['races'] = [dict(x) for x in c.execute('SELECT * FROM races WHERE session=? ORDER BY rowid', (sid,))]
                for r in s['races']:
                    r['slots'] = [dict(x) for x in c.execute('SELECT * FROM slots WHERE race=?', (r['id'],))]
                return s, None
            action = parts[3] if len(parts) == 4 else ''
            if method != 'POST':
                raise Error(404, 'Nicht gefunden')
            s = self.access(c, sid, u, host=action != 'device')
            if action == 'member':
                target = text(d, 'user')
                if target == s['host']:
                    raise Error(400, 'Host bleibt in der Session')
                status = d.get('status')
                if status not in ('accepted', 'rejected', 'removed'):
                    raise Error(400, 'Ungültiger Status')
                m = c.execute('SELECT * FROM members WHERE session=? AND user=?', (sid, target)).fetchone()
                if not m:
                    raise Error(404, 'Anfrage nicht gefunden')
                if status == 'accepted' and m['status'] == 'pending' and m['expires'] < time.time():
                    raise Error(409, 'Anfrage abgelaufen; erneute Anfrage erforderlich')
                c.execute('UPDATE members SET status=?,expires=NULL WHERE session=? AND user=?', (status, sid, target))
                if status != 'accepted':
                    c.execute('DELETE FROM slots WHERE user=? AND race IN(SELECT id FROM races WHERE session=?)', (target, sid))
            elif action == 'device':
                c.execute('INSERT OR IGNORE INTO devices VALUES(?,?)', (sid, device_id(text(d, 'device', 64))))
            elif action == 'pair':
                first, second = device_id(d.get('first')), device_id(d.get('second'))
                if first == second:
                    raise Error(400, 'Zwei verschiedene Geräte erforderlich')
                for ident in (first, second):
                    if not c.execute('SELECT 1 FROM devices WHERE session=? AND id=?', (sid, ident)).fetchone():
                        raise Error(403, 'Gerät gehört nicht zur Session')
                a, b = hardware_status(c, first), hardware_status(c, second)
                if not a['online'] or not b['online']:
                    raise Error(409, 'Beide Geräte müssen aktuelle Heartbeats senden')
                if a['wifi_channel'] != b['wifi_channel']:
                    raise Error(409, 'Die vorhandene Testfirmware benötigt denselben WLAN-Kanal. Channel-Hopping ist noch nicht implementiert.')
                for ident, peer in ((first, second), (second, first)):
                    if c.execute("SELECT 1 FROM hardware_commands WHERE device=? AND state='pending'", (ident,)).fetchone():
                        raise Error(409, 'Gerätebefehl noch ausstehend')
                    c.execute('INSERT INTO hardware_commands VALUES(?,?,?,?,?,?,?)', (secrets.token_hex(12), ident, 'pair', peer, 'pending', '', time.time()))
            elif action == 'race':
                if d.get('mode') not in MODES or d.get('policy') not in ('host', 'free'):
                    raise Error(400, 'Ungültiger Spielmodus oder Positionswahl')
                c.execute('INSERT INTO races(id,session,mode,policy,title) VALUES(?,?,?,?,?)', (secrets.token_hex(12), sid, d['mode'], d['policy'], text(d, 'title')))
            else:
                raise Error(404, 'Nicht gefunden')
            return {}, None
        if path == '/api/slot' and method == 'POST':
            r = c.execute('SELECT * FROM races WHERE id=?', (text(d, 'race'),)).fetchone()
            if not r:
                raise Error(404, 'Race nicht gefunden')
            s = self.access(c, r['session'], u)
            host = s['host'] == u['id']
            if not host and r['policy'] != 'free':
                raise Error(403, 'Positionen werden vom Host vergeben')
            device = text(d, 'device', 64)
            side = d.get('side')
            if type(side) is not int or side not in (0, 1) or not c.execute('SELECT 1 FROM devices WHERE session=? AND id=?', (s['id'], device)).fetchone():
                raise Error(400, 'Ungültige Position')
            target = d.get('user')
            current = c.execute('SELECT user FROM slots WHERE race=? AND device=? AND side=?', (r['id'], device, side)).fetchone()
            if not host and ((target not in (u['id'], None)) or (current and current['user'] != u['id']) or (target is None and not current)):
                raise Error(409, 'Position bereits belegt oder nicht freigegeben')
            if target is None:
                c.execute('DELETE FROM slots WHERE race=? AND device=? AND side=?', (r['id'], device, side))
            else:
                if not c.execute("SELECT 1 FROM members WHERE session=? AND user=? AND status='accepted'", (s['id'], target)).fetchone():
                    raise Error(400, 'Teilnehmer nicht zugelassen')
                c.execute('INSERT INTO slots VALUES(?,?,?,?) ON CONFLICT(race,device,side) DO UPDATE SET user=excluded.user', (r['id'], device, side, target))
            return {}, None
        raise Error(404, 'Nicht gefunden')


if __name__ == '__main__':
    init()
    server = ThreadingHTTPServer((os.environ.get('BIERPETER_HOST', '127.0.0.1'), int(os.environ.get('BIERPETER_PORT', '8080'))), Handler)
    print('BierPeter Alpha: http://%s:%s' % server.server_address, flush=True)
    server.serve_forever()

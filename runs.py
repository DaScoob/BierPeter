# SPDX-License-Identifier: AGPL-3.0-only
"""Opaque hardware-run transport. Measurement plaintext never belongs here."""
import base64
import json
import re
import secrets
import time

MAX_DEVICES = 8
MAX_RECIPIENTS = 16

def init(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS run_keys(user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,public TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS firmware_status(device TEXT PRIMARY KEY,public TEXT NOT NULL,state TEXT NOT NULL,ready INTEGER NOT NULL,seen REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,session TEXT REFERENCES sessions(id) ON DELETE CASCADE,race TEXT REFERENCES races(id) ON DELETE CASCADE,host TEXT NOT NULL,demo INTEGER NOT NULL,realtime INTEGER NOT NULL,state TEXT NOT NULL,config TEXT NOT NULL,created REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS run_results(run TEXT REFERENCES runs(id) ON DELETE CASCADE,recipient TEXT REFERENCES users(id) ON DELETE CASCADE,envelope TEXT NOT NULL,PRIMARY KEY(run,recipient));
    CREATE TABLE IF NOT EXISTS run_relay(run TEXT REFERENCES runs(id) ON DELETE CASCADE,sender TEXT,recipient TEXT,sequence TEXT,envelope TEXT,PRIMARY KEY(run,sender,recipient,sequence));
    ''')

def key(value, error):
    if not isinstance(value,str) or not re.fullmatch('[0-9a-fA-F]{64}',value) or int(value,16)==0:
        raise error(400,'Ungültiger öffentlicher X25519-Schlüssel')
    return value.lower()

def sealed(value, error):
    if not isinstance(value,dict) or set(value)!={'v','alg','public','iv','ciphertext'} or value['v']!=1 or value['alg']!='X25519-HKDF-SHA256-A256GCM':
        raise error(400,'Verschlüsselter Geräteumschlag erforderlich')
    key(value['public'],error)
    try:
        iv=base64.b64decode(value['iv'],validate=True);cipher=base64.b64decode(value['ciphertext'],validate=True)
    except (ValueError,TypeError):raise error(400,'Ungültiger Geräteumschlag')
    if len(iv)!=12 or not 16<=len(cipher)<=6144:raise error(400,'Ungültige Umschlaggröße')
    return value

def queue(c,device,action,payload,session):
    ident=secrets.token_hex(12)
    c.execute('INSERT INTO hardware_commands(id,device,action,peer_mac,state,detail,created,session,payload) VALUES(?,?,?,?,?,?,?,?,?)',(ident,device,action,'','pending','',time.time(),session,json.dumps(payload,separators=(',',':'))))
    return ident

def start(c, data, error, device_id, online, uid=None):
    host=device_id(data.get('device_id'))
    sid=data.get('session')
    if sid is None:
        candidates=c.execute('SELECT DISTINCT s.id FROM sessions s JOIN devices d ON d.session=s.id WHERE d.id=? AND s.active_race IS NOT NULL',(host,)).fetchall()
        if len(candidates)!=1:raise error(409,'Session muss bei mehrdeutiger Gerätezuordnung angegeben werden')
        sid=candidates[0]['id']
    s=c.execute('SELECT * FROM sessions WHERE id=?',(sid,)).fetchone()
    if not s:raise error(404,'Session nicht gefunden')
    if uid is not None and s['host']!=uid:raise error(403,'Nur der Sessionhost darf einen Demo-Run starten')
    realtime=data.get('realtime',True)
    if type(realtime) is not bool:raise error(400,'realtime muss true oder false sein')
    r=c.execute('SELECT * FROM races WHERE id=? AND session=?',(s['active_race'],sid)).fetchone()
    if not r or r['mode'] not in ('duel','relay'):raise error(409,'Demo unterstützt 1vs1 und Staffellauf')
    if c.execute("SELECT 1 FROM runs WHERE session=? AND state IN('queued','running')",(sid,)).fetchone():raise error(409,'Session besitzt bereits einen offenen Run')
    slots=[dict(x) for x in c.execute('SELECT sl.* FROM slots sl JOIN devices d ON d.session=? AND d.id=sl.device WHERE sl.race=? ORDER BY d.position,sl.side',(sid,r['id']))]
    if {x['side'] for x in slots}!={0,1} or (r['mode']=='duel' and len(slots)!=2):raise error(409,'Aufstellung ist unvollständig')
    devices=[]
    for x in slots:
        if x['device'] not in devices:devices.append(x['device'])
    if host not in devices or not 1<=len(devices)<=MAX_DEVICES:raise error(409,'Host muss aufgestellt sein; maximal acht Geräte')
    if not online(c,host)['online']:raise error(409,'Host-Gerät ist offline')
    recipients=[]
    for m in c.execute("SELECT user FROM members WHERE session=? AND status='accepted'",(sid,)):
        k=c.execute('SELECT public FROM run_keys WHERE user=?',(m['user'],)).fetchone()
        if not k:raise error(409,'Alle Teilnehmer müssen ihren privaten Bereich entsperren und den Messschlüssel bereitstellen')
        recipients.append({'id':m['user'],'public':k['public']})
    if len(recipients)>MAX_RECIPIENTS:raise error(409,'Maximal 16 Empfänger in dieser Firmware')
    peers=[]
    for device in devices:
        f=c.execute('SELECT * FROM firmware_status WHERE device=?',(device,)).fetchone()
        if not f:raise error(409,'Firmware Alpha 0.3 auf allen aufgestellten Geräten erforderlich')
        if c.execute("SELECT 1 FROM runs WHERE state IN('queued','running') AND (host=? OR config LIKE ?)",(device,'%"'+device+'"%')).fetchone():raise error(409,'Gerät ist bereits in einem offenen Run')
        peers.append({'id':device,'public':f['public'],'mask':sum(1<<x['side'] for x in slots if x['device']==device)})
    rid=secrets.token_hex(12)
    config={'run':rid,'mode':r['mode'],'host':host,'demo':True,'realtime':realtime,'peers':peers,'recipients':recipients}
    c.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',(rid,sid,r['id'],host,1,int(realtime),'queued',json.dumps(config),time.time()))
    c.execute('DELETE FROM run_relay WHERE run IN(SELECT id FROM runs WHERE session=? AND id<>?)',(sid,rid))
    # Identical prepare commands allow server-only links as well as ESP-NOW.
    for device in devices:queue(c,device,'demo',config,sid)
    return {'run':rid,'state':'queued','demo':True,'realtime':realtime}

def hardware(c,method,path,d,query,error,device_id):
    if path=='/api/v1/run-result' and method=='POST':
        ident=device_id(d.get('device_id'));rid=d.get('run');recipient=d.get('recipient')
        r=c.execute('SELECT * FROM runs WHERE id=?',(rid,)).fetchone()
        if not r or r['host']!=ident:raise error(403,'Run gehört nicht zu diesem Host')
        cfg=json.loads(r['config'])
        if recipient not in {x['id'] for x in cfg['recipients']}:raise error(403,'Empfänger nicht für diesen Run freigegeben')
        if r['state']=='aborted':raise error(409,'Run wurde verworfen')
        value=sealed(d.get('envelope'),error)
        if value['public']!=next(x['public'] for x in cfg['peers'] if x['id']==ident):raise error(409,'Geräteschlüssel hat gewechselt')
        encoded=json.dumps(value,separators=(',',':'))
        old=c.execute('SELECT envelope FROM run_results WHERE run=? AND recipient=?',(rid,recipient)).fetchone()
        if old and old['envelope']!=encoded:raise error(409,'Abweichendes doppeltes Ergebnis')
        c.execute('INSERT OR IGNORE INTO run_results VALUES(?,?,?)',(rid,recipient,encoded))
        count=c.execute('SELECT COUNT(*) n FROM run_results WHERE run=?',(rid,)).fetchone()['n']
        if count==len(cfg['recipients']):c.execute("UPDATE runs SET state='finished' WHERE id=?",(rid,))
        return {'status':'ok','run':rid}
    if path=='/api/v1/relay' and method=='POST':
        rid=d.get('run');sender=device_id(d.get('device_id'));recipient=device_id(d.get('recipient'));seq=d.get('sequence')
        r=c.execute('SELECT * FROM runs WHERE id=?',(rid,)).fetchone()
        if not r or r['state'] not in ('queued','running','finished'):raise error(409,'Kein offener Run')
        peers=json.loads(r['config'])['peers'];ids={x['id'] for x in peers}
        if sender not in ids or recipient not in ids or sender==recipient:raise error(403,'Gerät nicht im Run')
        if not isinstance(seq,str) or not re.fullmatch('[0-9a-f]{1,24}',seq):raise error(400,'Ungültige Sequenz')
        value=sealed(d.get('envelope'),error)
        if value['public']!=next(x['public'] for x in peers if x['id']==sender):raise error(403,'Abweichender Geräteschlüssel')
        if not c.execute('SELECT 1 FROM run_relay WHERE run=? AND sender=? AND recipient=? AND sequence=?',(rid,sender,recipient,seq)).fetchone() and c.execute('SELECT COUNT(*) n FROM run_relay WHERE run=?',(rid,)).fetchone()['n']>=256:raise error(409,'Transportpuffer voll')
        c.execute('INSERT OR IGNORE INTO run_relay VALUES(?,?,?,?,?)',(rid,sender,recipient,seq,json.dumps(value)))
        return {'status':'ok'}
    if path=='/api/v1/relay' and method=='GET':
        ident=device_id(query.get('device_id',[''])[0])
        rows=c.execute("SELECT q.* FROM run_relay q JOIN runs r ON r.id=q.run WHERE q.recipient=? AND r.state IN('queued','running','finished') ORDER BY q.rowid LIMIT 1",(ident,)).fetchall()
        return {'messages':[{**dict(x),'envelope':json.loads(x['envelope'])} for x in rows]}
    if path=='/api/v1/relay/ack' and method=='POST':
        ident=device_id(d.get('device_id'))
        c.execute('DELETE FROM run_relay WHERE run=? AND recipient=? AND sender=? AND sequence=?',(d.get('run'),ident,d.get('sender'),d.get('sequence')))
        return {'status':'ok'}
    return None

def listing(c,sid,uid):
    rows=[]
    for r in c.execute('SELECT id,race,host,demo,realtime,state,created FROM runs WHERE session=? ORDER BY created DESC LIMIT 20',(sid,)):
        item=dict(r)
        e=c.execute('SELECT envelope FROM run_results WHERE run=? AND recipient=?',(r['id'],uid)).fetchone()
        item['envelope']=json.loads(e['envelope']) if e else None
        cfg=json.loads(c.execute('SELECT config FROM runs WHERE id=?',(r['id'],)).fetchone()['config'])
        item['host_public']=next(x['public'] for x in cfg['peers'] if x['id']==r['host'])
        rows.append(item)
    return rows

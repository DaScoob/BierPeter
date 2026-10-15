# SPDX-License-Identifier: AGPL-3.0-only
"""Minimal contact and invitation metadata; never grants private-vault access."""
import secrets
import time


def blocked(c, a, b):
    return bool(c.execute('SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)',(a,b,b,a)).fetchone())


def friendship(c, a, b):
    a,b=sorted((a,b))
    return c.execute('SELECT * FROM friendships WHERE a=? AND b=?',(a,b)).fetchone()


def shared_session(c, a, b):
    return bool(c.execute("SELECT 1 FROM members x JOIN members y ON y.session=x.session WHERE x.user=? AND y.user=? AND x.status IN('accepted','removed') AND y.status IN('accepted','removed')",(a,b)).fetchone())


def limit(c, user, kind, maximum, error):
    now=time.time()
    row=c.execute('SELECT * FROM social_limits WHERE user=? AND kind=?',(user,kind)).fetchone()
    if row and now-row['started']<60 and row['count']>=maximum:
        raise error(429,'Zu viele neue Kontaktaktionen. Nach einer Minute erneut versuchen.')
    started,count=(row['started'],row['count']+1) if row and now-row['started']<60 else (now,1)
    c.execute('INSERT INTO social_limits VALUES(?,?,?,?) ON CONFLICT(user,kind) DO UPDATE SET started=excluded.started,count=excluded.count',(user,kind,started,count))


def delete_session(c, sid):
    c.execute('DELETE FROM session_invites WHERE session=?',(sid,))
    c.execute('DELETE FROM shared_names WHERE session=?',(sid,))
    c.execute('DELETE FROM slots WHERE race IN(SELECT id FROM races WHERE session=?)',(sid,))
    for table in ('races','devices','members','hardware_commands'):
        c.execute('DELETE FROM '+table+' WHERE session=?',(sid,))
    c.execute('DELETE FROM sessions WHERE id=?',(sid,))


def delete_account(c, uid):
    # Drop managed runs containing this recipient, including queued public-key payloads.
    import json
    affected=[]
    for r in c.execute('SELECT id,config FROM runs').fetchall():
        if any(x['id']==uid for x in json.loads(r['config'])['recipients']):affected.append(r['id'])
    for rid in affected:
        c.execute("DELETE FROM hardware_commands WHERE action='demo' AND json_extract(payload,'$.run')=?",(rid,))
        c.execute('DELETE FROM runs WHERE id=?',(rid,))
    for row in c.execute('SELECT id FROM sessions WHERE host=?',(uid,)).fetchall():
        delete_session(c,row['id'])
    c.execute('DELETE FROM session_invites WHERE sender=? OR recipient=?',(uid,uid))
    c.execute('DELETE FROM shared_names WHERE provider=? OR recipient=?',(uid,uid))
    c.execute('DELETE FROM friendships WHERE a=? OR b=?',(uid,uid))
    c.execute('DELETE FROM blocks WHERE owner=? OR target=?',(uid,uid))
    c.execute('DELETE FROM slots WHERE user=?',(uid,))
    c.execute('DELETE FROM members WHERE user=?',(uid,))
    # Preserve other players' physical setup, remove the deleted account link.
    c.execute('UPDATE devices SET provider=NULL WHERE provider=?',(uid,))
    for table in ('managed_devices','private_vaults','public_identities','social_limits'):
        c.execute('DELETE FROM '+table+' WHERE user=?',(uid,))
    c.execute('DELETE FROM logins WHERE user_id=?',(uid,))
    c.execute('DELETE FROM users WHERE id=?',(uid,))


def invite_valid(c, row):
    session=c.execute('SELECT * FROM sessions WHERE id=?',(row['session'],)).fetchone()
    relation=friendship(c,row['sender'],row['recipient'])
    member=c.execute("SELECT 1 FROM members WHERE session=? AND user=? AND status='accepted'",(row['session'],row['sender'])).fetchone()
    return bool(session and member and relation and relation['status']=='accepted' and not blocked(c,row['sender'],row['recipient']) and (session['host']==row['sender'] or session['allow_member_invites']))


def snapshot(c, uid):
    result={'friends':[],'incoming':[],'outgoing':[],'blocked':[],'known':[],'invitations':[]}
    for row in c.execute('SELECT f.*,u.id,u.name FROM friendships f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=?',(uid,uid,uid)):
        if blocked(c,uid,row['id']):continue
        category='friends' if row['status']=='accepted' else 'outgoing' if row['requester']==uid else 'incoming'
        if row['status'] in ('accepted','pending'):result[category].append({'id':row['id'],'name':row['name']})
    result['blocked']=[dict(r) for r in c.execute('SELECT u.id,u.name FROM blocks b JOIN users u ON u.id=b.target WHERE b.owner=? ORDER BY u.name',(uid,))]
    related={r['id'] for name in ('friends','incoming','outgoing') for r in result[name]}
    for row in c.execute("SELECT DISTINCT u.id,u.name FROM members a JOIN members b ON b.session=a.session JOIN users u ON u.id=b.user WHERE a.user=? AND b.user<>? AND a.status IN('accepted','removed') AND b.status IN('accepted','removed') ORDER BY u.name",(uid,uid)):
        if row['id'] not in related and not blocked(c,uid,row['id']):result['known'].append(dict(row))
    for row in c.execute("SELECT i.*,s.title,u.name sender_name FROM session_invites i JOIN sessions s ON s.id=i.session JOIN users u ON u.id=i.sender WHERE i.recipient=? AND i.status='pending' ORDER BY i.created DESC",(uid,)):
        if invite_valid(c,row):result['invitations'].append({key:row[key] for key in ('id','session','title','sender_name')})
    return result


def contact_action(c, uid, data, error):
    c.execute("DELETE FROM friendships WHERE status NOT IN('accepted','pending') AND updated<?",(time.time()-86400,))
    target=data.get('user');action=data.get('action')
    if not isinstance(target,str) or target==uid or not c.execute('SELECT 1 FROM users WHERE id=?',(target,)).fetchone():
        raise error(400,'Ungültiger Kontakt')
    if action not in ('request','accept','decline','cancel','remove','block','unblock'):
        raise error(400,'Unbekannte Kontaktaktion')
    a,b=sorted((uid,target));row=friendship(c,uid,target);now=time.time()
    if action=='unblock':
        c.execute('DELETE FROM blocks WHERE owner=? AND target=?',(uid,target));return
    if action=='block':
        c.execute('INSERT OR IGNORE INTO blocks VALUES(?,?)',(uid,target))
        c.execute('DELETE FROM friendships WHERE a=? AND b=?',(a,b))
    else:
        if blocked(c,uid,target):raise error(403,'Kontaktaktion nicht möglich')
        if action=='request':
            if row and row['status']=='accepted':return
            if row and row['status']=='pending':
                if row['requester']==uid:return
                raise error(409,'Es liegt bereits eine eingehende Anfrage vor. Diese zuerst beantworten.')
            if not row and not shared_session(c,uid,target):raise error(403,'Freundschaftsanfragen sind nur nach gemeinsamer Session-Teilnahme möglich')
            cooldown=60 if row and row['status']=='cancelled' else 86400
            if row and row['requester']==uid and now-row['updated']<cooldown:
                raise error(429,'Eine erneute Anfrage ist derzeit nicht möglich. Später erneut versuchen.')
            limit(c,uid,'friend',10,error)
            c.execute("INSERT INTO friendships VALUES(?,?,?,'pending',?) ON CONFLICT(a,b) DO UPDATE SET requester=excluded.requester,status='pending',updated=excluded.updated",(a,b,uid,now));return
        if not row:raise error(404,'Kontaktanfrage nicht mehr vorhanden')
        if action in ('accept','decline'):
            if row['status']!='pending' or row['requester']==uid:raise error(409,'Keine eingehende Anfrage vorhanden')
            status='accepted' if action=='accept' else 'declined'
            requester=row['requester']
        elif action=='cancel':
            if row['status']!='pending' or row['requester']!=uid:raise error(403,'Nur die eigene offene Anfrage kann zurückgezogen werden')
            status,requester='cancelled',uid
        else:
            if row['status']!='accepted':raise error(409,'Keine Freundschaft vorhanden')
            status,requester='removed',target
        c.execute('UPDATE friendships SET status=?,requester=?,updated=? WHERE a=? AND b=?',(status,requester,now,a,b))
        if action=='accept':return
    c.execute('DELETE FROM session_invites WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',(uid,target,target,uid))


def create_invite(c, uid, sid, target, error):
    session=c.execute('SELECT * FROM sessions WHERE id=?',(sid,)).fetchone()
    member=c.execute("SELECT 1 FROM members WHERE session=? AND user=? AND status='accepted'",(sid,uid)).fetchone()
    if not session or not member or (session['host']!=uid and not session['allow_member_invites']):
        raise error(403,'Der Host erlaubt diese Einladung nicht')
    if not isinstance(target,str) or target==uid:raise error(400,'Ungültiger Empfänger')
    relation=friendship(c,uid,target)
    if not relation or relation['status']!='accepted' or blocked(c,uid,target):raise error(403,'Einladung nur an eigene Freunde möglich')
    if c.execute("SELECT 1 FROM members WHERE session=? AND user=? AND status='accepted'",(sid,target)).fetchone():
        raise error(409,'Dieser Freund ist bereits in der Session')
    old=c.execute('SELECT * FROM session_invites WHERE session=? AND sender=? AND recipient=?',(sid,uid,target)).fetchone()
    if old and old['status']=='pending':return
    if old and time.time()-old['created']<86400:raise error(429,'Eine erneute Einladung ist derzeit nicht möglich')
    limit(c,uid,'invite',20,error)
    c.execute("INSERT INTO session_invites VALUES(?,?,?,?,'pending',?) ON CONFLICT(session,sender,recipient) DO UPDATE SET id=excluded.id,status='pending',created=excluded.created",(secrets.token_hex(12),sid,uid,target,time.time()))


def answer_invite(c, uid, data, error):
    if not isinstance(data.get('invite'),str) or len(data['invite'])>64:raise error(400,'Ungültige Einladung')
    row=c.execute('SELECT * FROM session_invites WHERE id=? AND recipient=?',(data.get('invite'),uid)).fetchone()
    if data.get('action') not in ('accept','decline'):raise error(400,'Ungültige Antwort')
    if row and row['status']=='accepted' and data['action']=='accept':
        member=c.execute('SELECT status FROM members WHERE session=? AND user=?',(row['session'],uid)).fetchone()
        if member and member['status'] in ('pending','accepted'):return {'id':row['session']}
    if not row or row['status']!='pending':raise error(404,'Einladung nicht mehr vorhanden')
    if data['action']=='decline':
        c.execute("UPDATE session_invites SET status='declined' WHERE id=?",(row['id'],));return {}
    if not invite_valid(c,row):raise error(403,'Einladung ist nicht mehr gültig')
    member=c.execute('SELECT * FROM members WHERE session=? AND user=?',(row['session'],uid)).fetchone()
    if not member or member['status']!='accepted':
        c.execute("INSERT INTO members VALUES(?,?,'pending',?) ON CONFLICT(session,user) DO UPDATE SET status='pending',expires=excluded.expires",(row['session'],uid,time.time()+900))
    c.execute("UPDATE session_invites SET status='accepted' WHERE id=?",(row['id'],))
    return {'id':row['session']}

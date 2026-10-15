"""Actual HTTP permission and lifecycle tests for account deletion and contacts."""
import concurrent.futures
import json
from test_api import Fixture, Client, app


class Alpha030Tests(Fixture):
    def friends(self):
        self.accept(self.g,self.uid)
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],200)
        self.assertEqual(self.g.call('/social/friend',{'user':self.h.call('/me')[1]['id'],'action':'accept'})[0],200)

    def guest_friends_and_other_session(self):
        self.accept(self.g,self.uid);self.accept(self.o,self.oid)
        self.g.call('/social/friend',{'user':self.oid,'action':'request'})
        self.o.call('/social/friend',{'user':self.uid,'action':'accept'})
        sid=self.h.call('/sessions',{'title':'Invitation target'})[1]['id'];path='/sessions/'+sid
        code=self.h.call(path)[1]['code'];self.g.call('/join',{'code':code})
        self.h.call(path+'/member',{'user':self.uid,'status':'accepted'})
        return path

    def test_request_requires_common_accepted_session(self):
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],403)
        self.g.call('/join',{'code':self.code})
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],403)
        self.accept(self.g,self.uid)
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],200)
        self.assertEqual(len(self.g.call('/social')[1]['incoming']),1)
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'accept'})[0],409)
        self.assertEqual(self.o.call('/social/friend',{'user':self.uid,'action':'accept'})[0],404)

    def test_accept_end_cancel_and_decline(self):
        self.friends();host=self.h.call('/me')[1]['id']
        self.assertEqual(self.h.call('/social')[1]['friends'][0]['id'],self.uid)
        self.assertEqual(self.g.call('/social/friend',{'user':host,'action':'remove'})[0],200)
        self.assertEqual(self.h.call('/social')[1]['friends'],[])
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],429)
        self.assertEqual(self.g.call('/social/friend',{'user':host,'action':'request'})[0],200)
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'cancel'})[0],403)
        self.assertEqual(self.g.call('/social/friend',{'user':host,'action':'cancel'})[0],200)
        self.assertEqual(self.g.call('/social')[1]['outgoing'],[])
        self.h.call('/social/friend',{'user':self.uid,'action':'request'})
        self.assertEqual(self.g.call('/social/friend',{'user':host,'action':'decline'})[0],200)
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],429)

    def test_friendship_survives_original_session_deletion(self):
        self.friends();self.h.call(self.sp+'/delete',{})
        self.assertEqual(len(self.g.call('/social')[1]['friends']),1)
        self.assertEqual(self.g.call('/social')[1]['known'],[])
        self.h.call('/social/friend',{'user':self.uid,'action':'remove'})
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],200)

    def test_friendship_grants_no_private_access(self):
        self.friends();self.h.call('/account/devices',{'device':'Host-private'})
        self.assertEqual(self.g.call('/account/devices')[1],[])
        self.assertIsNone(self.g.call('/account/vault')[1]['envelope'])
        snapshot=self.g.call('/social')[1]
        self.assertEqual(set(snapshot['friends'][0]),{'id','name'})
        self.assertNotIn('Host-private',json.dumps(snapshot))

    def test_non_host_invites_require_permission_and_host_approval(self):
        path=self.guest_friends_and_other_session()
        self.assertNotIn('code',self.g.call(path)[1])
        self.assertEqual(self.g.call(path+'/invite',{'user':self.oid})[0],403)
        self.assertEqual(self.g.call(path+'/invite-policy',{'allow':True})[0],403)
        self.assertEqual(self.h.call(path+'/invite-policy',{'allow':True})[0],200)
        self.assertEqual(self.g.call(path+'/invite',{'user':self.oid})[0],200)
        self.assertEqual(self.g.call(path+'/invite',{'user':self.oid})[0],200)
        invites=self.o.call('/social')[1]['invitations'];self.assertEqual(len(invites),1)
        self.assertEqual(self.h.call('/social/invitation',{'invite':invites[0]['id'],'action':'accept'})[0],404)
        self.assertEqual(self.o.call('/social/invitation',{'invite':invites[0]['id'],'action':'accept'})[0],200)
        self.assertEqual(self.o.call(path)[1]['membership'],'pending')
        self.assertNotIn('devices',self.o.call(path)[1])
        self.h.call(path+'/member',{'user':self.oid,'status':'accepted'})
        self.assertEqual(self.o.call(path)[1]['membership'],'accepted')
        self.assertEqual(self.o.call('/social/invitation',{'invite':invites[0]['id'],'action':'accept'})[1]['id'],path.split('/')[-1])

    def test_permission_revoke_and_block_invalidate_direct_invites(self):
        path=self.guest_friends_and_other_session();self.h.call(path+'/invite-policy',{'allow':True})
        self.g.call(path+'/invite',{'user':self.oid});inv=self.o.call('/social')[1]['invitations'][0]['id']
        self.h.call(path+'/invite-policy',{'allow':False})
        self.assertEqual(self.o.call('/social')[1]['invitations'],[])
        self.assertEqual(self.o.call('/social/invitation',{'invite':inv,'action':'accept'})[0],404)
        self.h.call(path+'/invite-policy',{'allow':True});self.g.call(path+'/invite',{'user':self.oid})
        self.o.call('/social/friend',{'user':self.uid,'action':'block'})
        self.assertEqual(self.o.call('/social')[1]['invitations'],[])
        self.assertEqual(self.g.call(path+'/invite',{'user':self.oid})[0],403)
        self.assertEqual(self.g.call('/social/friend',{'user':self.oid,'action':'request'})[0],403)
        self.assertEqual(self.o.call(self.sp)[1]['membership'],'accepted')
        self.o.call('/social/friend',{'user':self.uid,'action':'unblock'})
        self.assertEqual(self.o.call('/social')[1]['friends'],[])

    def test_host_may_invite_own_friends_without_member_permission(self):
        self.friends();sid=self.h.call('/sessions',{'title':'Host invites'})[1]['id']
        self.assertEqual(self.h.call('/sessions/'+sid+'/invite',{'user':self.uid})[0],200)
        invite=self.g.call('/social')[1]['invitations'][0]
        self.assertEqual(self.g.call('/social/invitation',{'invite':invite['id'],'action':'decline'})[0],200)
        self.assertEqual(self.g.call('/social')[1]['invitations'],[])
        self.assertEqual(self.h.call('/sessions/'+sid+'/invite',{'user':self.uid})[0],429)

    def test_account_delete_is_confirmed_self_only_without_password(self):
        self.assertEqual(self.g.call('/account/delete',{})[0],400)
        self.assertEqual(self.g.call('/account/delete',{'confirm':True},False)[0],403)
        self.assertEqual(self.g.call('/account/delete',{'confirm':True})[0],200)
        self.assertEqual(self.g.call('/me')[0],401)
        self.assertEqual(self.h.call('/me')[0],200)

    def test_account_delete_cleans_relations_and_own_sessions_atomically(self):
        self.friends();host=self.h.call('/me')[1]['id']
        second=Client(self.g.base);second.call('/login',{'name':'Guest','password':'test-password-123'})
        own=self.g.call('/sessions',{'title':'Guest owns'})[1]['id']
        self.g.call('/sessions/'+own+'/race',{'mode':'duel','policy':'host','title':'Removed'})
        with app.connect() as c:c.execute("UPDATE races SET state='running' WHERE session=?",(own,))
        self.g.call('/account/devices',{'device':'G-01'})
        self.g.call('/account/vault',{'revision':0,'envelope':{'v':1,'alg':'A256GCM','iv':'MDAwMDAwMDAwMDAw','ciphertext':'MTExMTExMTExMTExMTExMTExMTExMTEx'}})
        self.g.call('/account/identity',{'public_key':{'kty':'EC','crv':'P-256','x':'A'*43,'y':'B'*43}})
        self.g.call(self.sp+'/device',{'device':'G-01'})
        rid=self.race();self.h.call('/slot',{'race':rid,'device':'G-01','side':0,'user':host})
        self.g.call('/social/friend',{'user':self.oid,'action':'block'})
        self.assertEqual(self.g.call('/account/delete',{'confirm':True})[0],200)
        self.assertEqual(second.call('/me')[0],401)
        self.assertEqual(self.h.call('/sessions/'+own)[0],404)
        session=self.h.call(self.sp)[1]
        self.assertEqual(session['device_providers']['G-01'],None)
        self.assertEqual(len(session['races'][0]['slots']),1)
        self.assertNotIn(self.uid,[x['id'] for x in session['members']])
        self.assertEqual(self.h.call('/social')[1]['friends'],[])
        app.init();self.assertIsNone(self.h.call(self.sp)[1]['device_providers']['G-01'])
        with app.connect() as c:
            self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertIsNone(c.execute('SELECT 1 FROM users WHERE id=?',(self.uid,)).fetchone())

    def test_pending_request_survives_session_deletion_and_restart(self):
        self.accept(self.g,self.uid);host=self.h.call('/me')[1]['id']
        self.h.call('/social/friend',{'user':self.uid,'action':'request'})
        self.h.call(self.sp+'/delete',{});app.init()
        self.assertEqual(len(self.g.call('/social')[1]['incoming']),1)
        self.assertEqual(self.g.call('/social/friend',{'user':host,'action':'accept'})[0],200)

    def test_new_contact_rate_limit_prevents_extra_request(self):
        import time
        self.accept(self.g,self.uid);host=self.h.call('/me')[1]['id']
        with app.connect() as c:c.execute('INSERT INTO social_limits VALUES(?,?,?,?)',(host,'friend',time.time(),10))
        self.assertEqual(self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],429)
        self.assertEqual(self.g.call('/social')[1]['incoming'],[])

    def test_duplicate_requests_are_idempotent_and_serialized(self):
        self.accept(self.g,self.uid)
        with concurrent.futures.ThreadPoolExecutor(6) as pool:
            responses=list(pool.map(lambda _:self.h.call('/social/friend',{'user':self.uid,'action':'request'})[0],range(12)))
        self.assertEqual(set(responses),{200})
        self.assertEqual(len(self.g.call('/social')[1]['incoming']),1)
        with app.connect() as c:self.assertEqual(c.execute("SELECT count FROM social_limits WHERE kind='friend'").fetchone()['count'],1)

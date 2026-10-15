"""Regression checks for the observed 0.2.1 failures and new 0.2.2 boundaries."""
import base64
import concurrent.futures
import io
import json
import tarfile
import threading
import urllib.request
from test_api import Fixture, app
import test_hardware as hw
from test_hardware import A, B
from unittest.mock import patch
import os


SEALED = {'v':1,'alg':'A256GCM','iv':base64.b64encode(b'0'*12).decode(),'ciphertext':base64.b64encode(b'1'*24).decode()}
PUBLIC = {'kty':'EC','crv':'P-256','x':'A'*43,'y':'B'*43}


class Alpha022Tests(Fixture):
    def test_session_delete_permissions_and_cleanup(self):
        self.accept(self.g,self.uid);self.race()
        self.h.call('/account/devices',{'device':'BP-01'})
        self.assertEqual(self.g.call(self.sp+'/delete',{})[0],403)
        self.assertEqual(self.h.call(self.sp+'/delete',{})[0],200)
        self.assertEqual(self.g.call(self.sp)[0],404)
        self.assertEqual(self.g.call('/join',{'code':self.code})[0],404)
        self.assertEqual(self.h.call('/sessions')[1],[])
        self.assertEqual(self.h.call('/account/devices')[1][0]['id'],'BP-01')
        self.assertEqual(self.g.call('/me')[0],200)
        with app.connect() as c:
            for table in ('sessions','members','devices','races','slots','shared_names'):
                self.assertEqual(c.execute('SELECT COUNT(*) n FROM '+table).fetchone()['n'],0)

    def test_device_vault_delete_is_atomic_on_conflict(self):
        self.h.call('/account/devices',{'device':'BP-01'})
        self.h.call('/account/vault',{'revision':0,'envelope':SEALED})
        data={'device':'BP-01','action':'delete','vault':{'revision':0,'envelope':SEALED}}
        self.assertEqual(self.h.call('/account/devices',data)[0],409)
        self.assertEqual(len(self.h.call('/account/devices')[1]),1)
        self.assertEqual(self.h.call('/account/vault')[1]['revision'],1)
        data['vault']['revision']=1
        self.assertEqual(self.h.call('/account/devices',data)[1],{'revision':2})
        self.assertEqual(self.h.call('/account/devices')[1],[])

    def test_successful_logins_have_no_failed_attempt_budget(self):
        for _ in range(24):
            self.assertEqual(self.h.call('/login',{'name':'Host','password':'test-password-123'})[0],200)
        for _ in range(20):
            self.assertEqual(self.h.call('/login',{'name':'Host','password':'incorrect'})[0],401)
        self.assertEqual(self.h.call('/login',{'name':'Host','password':'incorrect'})[0],429)
        self.assertEqual(self.g.call('/login',{'name':'Guest','password':'test-password-123'})[0],200)

    def test_url_variants_rejected(self):
        for url in ('http://127.0.0.2:6017','http://0.0.0.0:6017','http://localhost.:6017','http://[::ffff:127.0.0.1]:6017','http://127.1:6017','http://[::]:6017'):
            with self.subTest(url=url):self.assertEqual(self.h.call(self.sp+'/settings',{'public_url':url})[0],400)

    def test_legacy_invitation_survives_migration(self):
        self.race()
        with app.connect() as c:
            for table,column in (('sessions','active_race'),('sessions','public_url'),('devices','provider'),('devices','position')):
                c.execute('ALTER TABLE '+table+' DROP COLUMN '+column)
        app.init();app.init()
        self.assertEqual(self.h.call(self.sp)[1]['code'],self.code)
        self.assertEqual(self.g.call('/join',{'code':self.code})[0],200)
        self.assertEqual(self.g.call(self.sp)[1]['membership'],'pending')
        self.assertEqual(self.h.call(self.sp+'/member',{'user':self.uid,'status':'accepted'})[0],200)
        self.assertEqual(self.g.call(self.sp)[1]['membership'],'accepted')
        self.assertEqual(self.g.call(self.sp)[1]['devices'],['BP-01'])

    def test_names_recipient_scope_removal_and_revision(self):
        self.accept(self.g,self.uid);self.o.call('/join',{'code':self.code})
        self.assertEqual(self.g.call('/account/identity',{'public_key':PUBLIC})[0],200)
        self.assertEqual(self.g.call('/account/identity',{'public_key':{**PUBLIC,'x':'C'*43}})[0],409)
        self.h.call('/account/vault',{'revision':0,'envelope':SEALED})
        bundles={'revision':1,'bundles':[{'recipient':self.uid,'envelope':SEALED}]}
        self.assertEqual(self.h.call(self.sp+'/names',bundles)[0],200)
        self.assertEqual(self.h.call(self.sp)[1]['shared_names'],[])
        self.assertEqual(len(self.g.call(self.sp)[1]['shared_names']),1)
        self.assertNotIn('shared_names',self.o.call(self.sp)[1])
        self.h.call('/account/vault',{'revision':1,'envelope':SEALED})
        self.assertEqual(self.h.call(self.sp+'/names',bundles)[0],409)
        self.h.call(self.sp+'/member',{'user':self.uid,'status':'removed'})
        with app.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) n FROM shared_names').fetchone()['n'],0)

    def test_snapshot_is_consistent_during_concurrent_delete(self):
        rid=self.race();event=threading.Event();release=threading.Event();original=app.Handler.access
        def delayed(handler,c,sid,user,host=False):
            result=original(handler,c,sid,user,host)
            if handler.command=='GET' and handler.headers.get('X-Snapshot-Test'):
                event.set();release.wait(5)
            return result
        app.Handler.access=delayed
        def read():
            request=urllib.request.Request(self.h.base+self.sp,headers={'X-Snapshot-Test':'1'})
            with self.h.opener.open(request) as response:return json.load(response)
        try:
            with concurrent.futures.ThreadPoolExecutor(1) as pool:
                future=pool.submit(read);self.assertTrue(event.wait(5))
                self.assertEqual(self.h.call(self.sp+'/race-delete',{'race':rid})[0],200)
                release.set();result=future.result()
            self.assertIn(result['active_race'],[r['id'] for r in result['races']])
        finally:release.set();app.Handler.access=original

    def test_source_offer_has_code_and_no_data(self):
        with urllib.request.urlopen(self.h.base.removesuffix('/api')+'/source.tar.gz') as response:
            body=response.read();self.assertEqual(response.headers['Content-Type'],'application/gzip')
        with tarfile.open(fileobj=io.BytesIO(body)) as archive:
            names=archive.getnames()
            self.assertIn('BierPeter/server.py',names);self.assertIn('BierPeter/LICENSE',names)
            self.assertFalse(any('/data/' in n or n.endswith('/.env') or '/secrets/' in n for n in names))


class DiscoveryTests(Fixture):
    hardware = hw.HardwareTests.hardware
    heartbeat = hw.HardwareTests.heartbeat
    def setUp(self):
        super().setUp()
        self.env=patch.dict(os.environ,{'DEVICE_API_KEY':hw.KEY,'DEVICE_API_KEY_FILE':''})
        self.env.start()
    def tearDown(self):
        self.env.stop();super().tearDown()
    def test_discovered_neighbors_are_local_fresh_and_scoped(self):
        self.h.call('/account/devices',{'device':A})
        self.heartbeat(neighbors=[{'device_id':B,'transport':'esp-now','channel':6,'rssi':-60}])
        self.assertEqual(self.h.call(self.sp)[1]['discoveries'][0]['device'],B)
        self.accept(self.g,self.uid)
        self.assertEqual(self.g.call(self.sp)[1]['discoveries'],[])
        with app.connect() as c:c.execute('UPDATE discoveries SET seen=0')
        self.assertEqual(self.h.call(self.sp)[1]['discoveries'],[])
        self.heartbeat(peer_mac=B,peer_active=True)
        self.assertEqual(self.h.call(self.sp)[1]['discoveries'][0]['device'],B)
        self.heartbeat(peer_mac=B,peer_active=False)
        self.assertEqual(self.h.call(self.sp)[1]['discoveries'],[])

    def test_invalid_neighbor_does_not_replace_previous_status(self):
        self.heartbeat()
        self.assertEqual(self.heartbeat(neighbors=[{'device_id':B,'transport':'fake','channel':6}])[0],400)
        with app.connect() as c:self.assertEqual(c.execute('SELECT peer_active FROM hardware WHERE id=?',(A,)).fetchone()['peer_active'],0)

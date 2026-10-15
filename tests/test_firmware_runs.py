# SPDX-License-Identifier: AGPL-3.0-only
import base64
import json
import os
from unittest.mock import patch
import test_hardware as hw
from test_api import Fixture
A,B,KEY=hw.A,hw.B,hw.KEY

PUBLIC='09'+'00'*31
ENVELOPE={'v':1,'alg':'X25519-HKDF-SHA256-A256GCM','public':PUBLIC,'iv':base64.b64encode(bytes(12)).decode(),'ciphertext':base64.b64encode(bytes(32)).decode()}
class RunTests(Fixture):
    def setUp(self):
        super().setUp()
        self.env=patch.dict(os.environ,{'DEVICE_API_KEY':KEY,'DEVICE_API_KEY_FILE':''})
        self.env.start()
    def tearDown(self):
        self.env.stop()
        super().tearDown()
    hardware=hw.HardwareTests.hardware
    heartbeat=hw.HardwareTests.heartbeat
    bind=hw.HardwareTests.bind
    def setup_run(self):
        self.accept(self.g,self.uid)
        self.bind(A);self.bind(B)
        self.h.call('/account/run-key',{'public':PUBLIC});self.g.call('/account/run-key',{'public':PUBLIC})
        self.heartbeat(A,run_public=PUBLIC,game_state='idle',ready=False)
        self.heartbeat(B,run_public=PUBLIC,game_state='idle',ready=False)
        self.h.call(self.sp+'/race',{'mode':'relay','policy':'host','title':'Hardware'})
        r=self.h.call(self.sp)[1]['races'][-1]['id']
        host=self.h.call('/me')[1]['id']
        for ident,side,user in [(A,0,host),(B,1,self.uid)]:self.assertEqual(self.h.call('/slot',{'race':r,'device':ident,'side':side,'user':user})[0],200)
        return host
    def test_demo_is_hardware_command_not_server_fake_result(self):
        self.setup_run()
        status,run=self.h.call(self.sp+'/demo',{'device_id':A,'realtime':False});self.assertEqual(status,200)
        cfg=self.hardware('/commands?device_id='+A)[1]['command']
        self.assertEqual(cfg['action'],'demo');self.assertFalse(cfg['payload']['realtime']);self.assertTrue(cfg['payload']['demo'])
        self.assertEqual([p['id'] for p in cfg['payload']['peers']],[A,B])
        self.assertFalse(self.h.call(self.sp)[1]['runs'][0]['envelope'])
        self.assertEqual(self.h.call(self.sp+'/demo',{'device_id':A})[0],409)
        self.assertEqual(self.g.call(self.sp+'/demo',{'device_id':A})[0],403)
        self.assertEqual(self.h.call(self.sp+'/device-order',{'devices':[B,A]})[0],409)
    def test_results_opaque_idempotent_recipient_scoped(self):
        host=self.setup_run();run=self.h.call(self.sp+'/demo',{'device_id':A})[1]['run']
        value={'device_id':A,'run':run,'recipient':host,'envelope':ENVELOPE}
        self.assertEqual(self.hardware('/run-result',{**value,'device_id':B})[0],403)
        self.assertEqual(self.hardware('/run-result',value)[0],200)
        self.assertEqual(self.hardware('/run-result',value)[0],200)
        self.assertIsNone(self.g.call(self.sp)[1]['runs'][0]['envelope'])
        self.assertEqual(self.hardware('/run-result',{**value,'recipient':self.uid})[0],200)
        self.assertEqual(self.h.call(self.sp)[1]['runs'][0]['state'],'finished')
        import server
        from test_api import app
        with app.connect() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) n FROM run_results').fetchone()['n'],2)
            self.assertNotIn('duration',c.execute('SELECT envelope FROM run_results').fetchone()['envelope'])
        changed={**ENVELOPE,'ciphertext':base64.b64encode(bytes(33)).decode()}
        self.assertEqual(self.hardware('/run-result',{**value,'envelope':changed})[0],409)
    def test_relay_only_accepts_ciphertext_and_members(self):
        self.setup_run();run=self.h.call(self.sp+'/demo',{'device_id':A})[1]['run']
        body={'device_id':A,'recipient':B,'run':run,'sequence':'01','envelope':ENVELOPE}
        self.assertEqual(self.hardware('/relay',{**body,'envelope':{'duration_us':123}})[0],400)
        self.assertEqual(self.hardware('/relay',{**body,'recipient':'112233445566'})[0],403)
        self.assertEqual(self.hardware('/relay',body)[0],200)
        self.assertEqual(self.hardware('/relay',body)[0],200)
        messages=self.hardware('/relay?device_id='+B)[1]['messages'];self.assertEqual(len(messages),1)
        self.assertEqual(self.hardware('/relay/ack',{'device_id':B,'run':run,'sender':A,'sequence':'01'})[0],200)
        self.assertEqual(self.hardware('/relay?device_id='+B)[1]['messages'],[])
    def test_abort_no_score_and_deletion_cascades(self):
        host=self.setup_run();run=self.h.call(self.sp+'/demo',{'device_id':A})[1]['run']
        self.assertEqual(self.h.call(self.sp+'/run-abort',{'run':run})[0],200)
        self.assertEqual(self.hardware('/run-result',{'device_id':A,'run':run,'recipient':host,'envelope':ENVELOPE})[0],409)
        self.assertEqual(self.h.call(self.sp+'/delete',{})[0],200)
        self.assertEqual(self.h.call('/account/delete',{'confirm':True})[0],200)
    def test_admin_start_auth_and_parameter_validation(self):
        self.setup_run()
        from test_api import Client
        import urllib.request,urllib.error
        url='http://127.0.0.1:'+str(self.server.server_port)+'/api/admin/demo'
        admin='admin-test-key-at-least-32-characters-long'
        def call(key,realtime=True):
            req=urllib.request.Request(url,data=json.dumps({'session':self.sid,'device_id':A,'realtime':realtime}).encode(),headers={'Content-Type':'application/json','X-Admin-Key':key})
            try:
                with urllib.request.urlopen(req) as r:return r.status,json.load(r)
            except urllib.error.HTTPError as e:return e.code,json.load(e)
        with patch.dict(os.environ,{'BIERPETER_ADMIN_KEY':admin}):
            self.assertEqual(call('wrong')[0],401)
            self.assertEqual(call(admin,'false')[0],400)
            self.assertEqual(call(admin)[0],200)
    def test_missing_keys_and_unsupported_modes_fail_closed(self):
        self.setup_run()
        from test_api import app
        with app.connect() as c:c.execute('DELETE FROM run_keys WHERE user=?',(self.uid,))
        self.assertEqual(self.h.call(self.sp+'/demo',{'device_id':A})[0],409)

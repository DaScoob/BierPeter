import json
import os
import time
import urllib.error
import urllib.request
from unittest.mock import patch
from test_api import Fixture, app

KEY='test-device-key-with-at-least-32-characters'
A='84F3EB52F7F9'
B='AABBCCDDEEFF'

class HardwareTests(Fixture):
    def setUp(self):
        super().setUp()
        self.env=patch.dict(os.environ,{'DEVICE_API_KEY':KEY,'DEVICE_API_KEY_FILE':''})
        self.env.start()
    def tearDown(self):
        self.env.stop()
        super().tearDown()
    def hardware(self,path,data=None,key=KEY):
        url='http://127.0.0.1:'+str(self.server.server_port)+'/api/v1'+path
        req=urllib.request.Request(url,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Device-Key':key})
        try:
            with urllib.request.urlopen(req) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def heartbeat(self,ident=A,channel=6,**values):
        payload={'device_id':ident,'firmware':'0.1.0','wifi_rssi':-55,'wifi_channel':channel,'uptime_ms':1000,'peer_mac':'','peer_active':False}
        payload.update(values)
        return self.hardware('/heartbeat',payload)
    def bind(self,ident):
        return self.h.call(self.sp+'/device',{'device':ident})
    def test_requires_device_key(self):
        self.assertEqual(self.hardware('/heartbeat',{},key='wrong')[0],401)
        with patch.dict(os.environ,{'DEVICE_API_KEY':''}):
            self.assertEqual(self.heartbeat()[0],503)
    def test_only_heartbeat_makes_device_online(self):
        self.bind(A)
        s=self.h.call(self.sp)[1]
        self.assertFalse(s['hardware'][0]['online'])
        self.assertIsNone(s['hardware'][0]['last_seen'])
        self.assertEqual(self.heartbeat()[0],200)
        h=self.h.call(self.sp)[1]['hardware'][0]
        self.assertTrue(h['online']);self.assertFalse(h['peer_active'])
        with app.connect() as c:c.execute('UPDATE hardware SET last_seen=?',(time.time()-20,))
        self.assertFalse(self.h.call(self.sp)[1]['hardware'][0]['online'])
    def test_mac_normalized_and_binding_idempotent(self):
        self.bind('84:f3:eb:52:f7:f9');self.bind(A)
        self.assertEqual(self.h.call(self.sp)[1]['devices'],[A])
        self.assertEqual(self.heartbeat('84:f3:eb:52:f7:f9')[1]['device_id'],A)
    def test_device_during_session_creation(self):
        status,s=self.h.call('/sessions',{'title':'Scanned','device':A})
        self.assertEqual(status,200)
        self.assertEqual(self.h.call('/sessions/'+s['id'])[1]['devices'],[A])
    def test_pending_lobby_has_no_roster(self):
        self.g.call('/join',{'code':self.code})
        s=self.g.call(self.sp)[1]
        self.assertEqual(s['membership'],'pending');self.assertEqual(s['title'],'Test')
        self.assertNotIn('members',s);self.assertNotIn('devices',s)
        self.assertEqual(self.g.call(self.sp+'/device',{'device':A})[0],403)
    def test_pair_requires_online_same_channel(self):
        self.bind(A);self.bind(B)
        self.assertEqual(self.h.call(self.sp+'/pair',{'first':A,'second':B})[0],409)
        self.heartbeat(A,1);self.heartbeat(B,6)
        self.assertEqual(self.h.call(self.sp+'/pair',{'first':A,'second':B})[0],409)
        self.assertEqual(self.hardware('/commands?device_id='+A)[1]['command'],None)
    def test_real_commands_ack_and_peer_report(self):
        self.bind(A);self.bind(B);self.heartbeat(A);self.heartbeat(B)
        self.assertEqual(self.h.call(self.sp+'/pair',{'first':A,'second':B})[0],200)
        a=self.hardware('/commands?device_id='+A)[1]['command']
        b=self.hardware('/commands?device_id='+B)[1]['command']
        self.assertEqual(a['peer_mac'],B);self.assertEqual(b['peer_mac'],A)
        ack={'device_id':A,'command_id':a['command_id'],'success':True,'detail':'test acknowledgement'}
        self.assertEqual(self.hardware('/commands/ack',{**ack,'device_id':B})[0],403)
        self.assertEqual(self.hardware('/commands/ack',ack)[1]['command']['state'],'ack_ok')
        self.assertEqual(self.hardware('/commands?device_id='+A)[1]['command'],None)
        self.assertFalse(self.h.call(self.sp)[1]['hardware'][0]['peer_active'])
        self.heartbeat(A,peer_mac=B,peer_active=True)
        self.assertTrue(self.h.call(self.sp)[1]['hardware'][0]['peer_active'])
    def test_event_and_heartbeat_validation(self):
        self.assertEqual(self.hardware('/events',{'device_id':A,'type':'boot','details':{'test':True}})[0],200)
        self.assertEqual(self.hardware('/events',{'device_id':A,'type':'boot','details':'not an object'})[0],400)
        self.assertEqual(self.heartbeat(channel=100)[0],400)
        self.assertEqual(self.heartbeat(peer_active='yes')[0],400)
    def test_join_refresh_does_not_extend_timeout(self):
        self.g.call('/join',{'code':self.code})
        before=self.g.call(self.sp)[1]['expires']
        self.g.call('/join',{'code':self.code})
        self.assertEqual(self.g.call(self.sp)[1]['expires'],before)

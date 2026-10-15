import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path

import jwt
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from services import AccountStore,RaceStore,make_server,AUDIENCE,ISSUER
import base64

class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.trust=self.root/'trust/verify.pem'
        self.a=AccountStore(self.root/'account',self.trust);self.r=RaceStore(self.root/'race',self.trust)
        self.a.register('test-account','prototype-password-123');self.token=self.a.token('test-account','prototype-password-123')
    def tearDown(self):self.tmp.cleanup()
    def envelope(self,secret=b'private-statistics'):
        key=AESGCM.generate_key(bit_length=256);cipher=AESGCM(key);iv=b'012345678901'
        return key,{'v':1,'alg':'A256GCM','iv':base64.b64encode(iv).decode(),'ciphertext':base64.b64encode(cipher.encrypt(iv,secret,b'owner')).decode()}
    def test_separate_files_and_private_storage(self):
        key,e=self.envelope();self.r.put(self.token,e)
        self.assertEqual(self.r.get(self.token),e)
        self.assertNotIn(b'private-statistics',self.r.db.read_bytes())
        self.assertFalse((self.root/'race/signing.pem').exists());self.assertFalse((self.root/'race/accounts.sqlite3').exists())
        self.assertEqual(AESGCM(key).decrypt(base64.b64decode(e['iv']),base64.b64decode(e['ciphertext']),b'owner'),b'private-statistics')
    def test_wrong_key_and_tampering(self):
        key,e=self.envelope();data=bytearray(base64.b64decode(e['ciphertext']));data[0]^=1
        with self.assertRaises(InvalidTag):AESGCM(key).decrypt(base64.b64decode(e['iv']),bytes(data),b'owner')
        with self.assertRaises(InvalidTag):AESGCM(AESGCM.generate_key(bit_length=256)).decrypt(base64.b64decode(e['iv']),base64.b64decode(e['ciphertext']),b'owner')
    def test_reject_wrong_audience_expiry_and_algorithm(self):
        import time
        claims={'iss':ISSUER,'aud':'wrong','sub':'id','iat':int(time.time()),'exp':int(time.time())+300,'scope':'vault'}
        with self.assertRaises(jwt.InvalidAudienceError):self.r.verify(jwt.encode(claims,self.a.key,algorithm='EdDSA'))
        claims.update(aud=AUDIENCE,exp=int(time.time())-10)
        with self.assertRaises(jwt.ExpiredSignatureError):self.r.verify(jwt.encode(claims,self.a.key,algorithm='EdDSA'))
        claims['exp']=int(time.time())+300
        with self.assertRaises(jwt.InvalidAlgorithmError):self.r.verify(jwt.encode(claims,'different-secret-with-32-characters-or-more',algorithm='HS256'))
    def test_subject_isolation_and_restart(self):
        _,e=self.envelope();self.r.put(self.token,e)
        self.a.register('other-account','prototype-password-456')
        other=self.a.token('other-account','prototype-password-456')
        self.assertIsNone(self.r.get(other))
        new=AccountStore(self.root/'account',self.trust)
        self.assertEqual(self.r.get(new.token('test-account','prototype-password-123')),e)
    def test_http_two_services(self):
        servers=[make_server('account',self.root/'account',self.trust),make_server('race',self.root/'race',self.trust)]
        threads=[threading.Thread(target=s.serve_forever,daemon=True) for s in servers]
        for t in threads:t.start()
        try:
            for server,role in zip(servers,('account','race')):
                with urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port)+'/health') as response:self.assertEqual(json.load(response)['role'],role)
            token_request=urllib.request.Request('http://127.0.0.1:'+str(servers[0].server_port)+'/token',data=json.dumps({'login':'test-account','password':'prototype-password-123'}).encode(),headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(token_request) as response:token=json.load(response)['token']
            _,envelope=self.envelope()
            url='http://127.0.0.1:'+str(servers[1].server_port)+'/vault'
            req=urllib.request.Request(url,data=json.dumps(envelope).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with urllib.request.urlopen(req) as response:self.assertTrue(json.load(response)['ok'])
            req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token})
            with urllib.request.urlopen(req) as response:self.assertEqual(json.load(response)['envelope'],envelope)
        finally:
            for s in servers:s.shutdown();s.server_close()
            for t in threads:t.join()

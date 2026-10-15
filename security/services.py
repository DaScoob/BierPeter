"""Isolated split-service prototype; not a replacement for Alpha login yet."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ISSUER='bierpeter-account-prototype'
AUDIENCE='bierpeter-race'

class AccountStore:
    def __init__(self, directory, trust):
        self.directory=Path(directory);self.directory.mkdir(parents=True,exist_ok=True)
        self.db=self.directory/'accounts.sqlite3'
        path=self.directory/'signing.pem'
        if not path.exists():
            key=Ed25519PrivateKey.generate()
            raw=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as f:f.write(raw)
        self.key=serialization.load_pem_private_key(path.read_bytes(),password=None)
        self.public=self.key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
        trust=Path(trust);trust.parent.mkdir(parents=True,exist_ok=True);trust.write_bytes(self.public)
        with sqlite3.connect(self.db) as c:
            c.execute('CREATE TABLE IF NOT EXISTS accounts(login TEXT PRIMARY KEY,subject TEXT UNIQUE,password TEXT)')
    @staticmethod
    def hash(password,salt=None):
        salt=salt or secrets.token_hex(16)
        return salt+':'+hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1).hex()
    def register(self,login,password):
        if not isinstance(login,str) or not 1<=len(login)<=40 or not isinstance(password,str) or not 12<=len(password)<=128:
            raise ValueError('Invalid credentials')
        with sqlite3.connect(self.db) as c:
            c.execute('INSERT INTO accounts VALUES(?,?,?)',(login,secrets.token_hex(16),self.hash(password)))
    def token(self,login,password):
        if not isinstance(login,str) or not isinstance(password,str) or len(password)>128:
            raise ValueError('Invalid credentials')
        with sqlite3.connect(self.db) as c:
            row=c.execute('SELECT subject,password FROM accounts WHERE login=?',(login,)).fetchone()
        candidate=self.hash(password,row[1].split(':')[0] if row else '0'*32)
        if not row or not hmac.compare_digest(candidate,row[1]):raise ValueError('Invalid credentials')
        now=int(time.time())
        return jwt.encode({'iss':ISSUER,'aud':AUDIENCE,'sub':row[0],'iat':now,'exp':now+300,'scope':'vault'},self.key,algorithm='EdDSA')

class RaceStore:
    def __init__(self,directory,public):
        self.directory=Path(directory);self.directory.mkdir(parents=True,exist_ok=True)
        self.db=self.directory/'race.sqlite3';self.public=Path(public)
        with sqlite3.connect(self.db) as c:c.execute('CREATE TABLE IF NOT EXISTS vault(subject TEXT PRIMARY KEY,ciphertext TEXT)')
    def verify(self,token):
        claims=jwt.decode(token,self.public.read_bytes(),algorithms=['EdDSA'],audience=AUDIENCE,issuer=ISSUER,options={'require':['exp','iat','sub','scope']})
        if claims['scope']!='vault':raise ValueError('Invalid scope')
        return claims['sub']
    def get(self,token):
        subject=self.verify(token)
        with sqlite3.connect(self.db) as c:row=c.execute('SELECT ciphertext FROM vault WHERE subject=?',(subject,)).fetchone()
        return json.loads(row[0]) if row else None
    def put(self,token,envelope):
        subject=self.verify(token)
        if not isinstance(envelope,dict) or set(envelope)!={'v','alg','iv','ciphertext'} or envelope.get('alg')!='A256GCM' or envelope.get('v')!=1:raise ValueError('Encrypted envelope required')
        try:
            iv=base64.b64decode(envelope['iv'],validate=True);data=base64.b64decode(envelope['ciphertext'],validate=True)
        except Exception:raise ValueError('Invalid encoding')
        if len(iv)!=12 or not 16<=len(data)<=196608:raise ValueError('Invalid envelope size')
        with sqlite3.connect(self.db) as c:c.execute('INSERT INTO vault VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET ciphertext=excluded.ciphertext',(subject,json.dumps(envelope)))

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_):pass
    def respond(self,status,value):
        body=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):self.route('GET')
    def do_POST(self):self.route('POST')
    def route(self,method):
        try:
            if self.path=='/health':return self.respond(200,{'role':self.server.role,'prototype':True})
            d={}
            if method=='POST':
                size=int(self.headers.get('Content-Length','0'))
                if not 1<=size<=262144:raise ValueError('Invalid size')
                d=json.loads(self.rfile.read(size))
                if not isinstance(d,dict):raise ValueError('Object required')
            if self.server.role=='account':
                if self.path=='/register' and method=='POST':self.server.store.register(d.get('login'),d.get('password'));return self.respond(200,{'ok':True})
                if self.path=='/token' and method=='POST':return self.respond(200,{'token':self.server.store.token(d.get('login'),d.get('password'))})
            elif self.path=='/vault':
                auth=self.headers.get('Authorization','')
                if not auth.startswith('Bearer '):return self.respond(401,{'error':'Token required'})
                if method=='POST':self.server.store.put(auth[7:],d);return self.respond(200,{'ok':True})
                return self.respond(200,{'envelope':self.server.store.get(auth[7:])})
            self.respond(404,{'error':'Not found'})
        except (jwt.PyJWTError,ValueError,TypeError,KeyError):self.respond(401,{'error':'Request rejected'})
        except sqlite3.IntegrityError:self.respond(409,{'error':'Already exists'})
        except OSError:self.respond(503,{'error':'Trust material not ready'})
        except Exception:self.respond(500,{'error':'Internal error'})

def make_server(role,directory,public,host='127.0.0.1',port=0):
    server=ThreadingHTTPServer((host,port),Handler);server.role=role
    server.store=AccountStore(directory,public) if role=='account' else RaceStore(directory,public)
    return server

if __name__=='__main__':
    role=os.environ.get('ROLE','account')
    if role not in ('account','race'):raise SystemExit('Invalid role')
    server=make_server(role,os.environ.get('STATE','/data'),os.environ.get('VERIFY_KEY','/trust/verify.pem'),os.environ.get('HOST','127.0.0.1'),int(os.environ.get('PORT','8090')))
    print('Security prototype role='+role,flush=True);server.serve_forever()

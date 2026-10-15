import concurrent.futures
import http.cookiejar
import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('app',Path(__file__).parents[1]/'server.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
class Client:
    def __init__(self,base):
        self.base=base
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(self,path,data=None,csrf=True):
        headers={'Content-Type':'application/json'}
        if csrf: headers['X-BierPeter-Request']='1'
        r=urllib.request.Request(self.base+path,data=None if data is None else json.dumps(data).encode(),headers=headers)
        try:
            with self.opener.open(r) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as e: return e.code,json.load(e)
class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        app.DB=Path(self.tmp.name)/'db.sqlite3';app.AUTH_ATTEMPTS.clear();app.init()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        base='http://127.0.0.1:'+str(self.server.server_port)+'/api'
        self.h,self.g,self.o=[Client(base) for _ in range(3)]
        for name,c in [('Host',self.h),('Guest',self.g),('Other',self.o)]:
            self.assertEqual(c.call('/register',{'name':name,'password':'test-password-123'})[0],200)
        self.uid=self.g.call('/me')[1]['id'];self.oid=self.o.call('/me')[1]['id']
        self.sid=self.h.call('/sessions',{'title':'Test'})[1]['id'];self.sp='/sessions/'+self.sid
        self.code=self.h.call(self.sp)[1]['code']
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def accept(self,c,uid):
        self.assertEqual(c.call('/join',{'code':self.code})[0],200)
        self.assertEqual(self.h.call(self.sp+'/member',{'user':uid,'status':'accepted'})[0],200)
    def race(self,policy='free'):
        self.h.call(self.sp+'/device',{'device':'BP-01'})
        self.h.call(self.sp+'/race',{'mode':'relay','title':'Race','policy':policy})
        return self.h.call(self.sp)[1]['races'][-1]['id']
class Tests(Fixture):
    def test_login_logout(self):
        self.g.call('/logout',{});self.assertEqual(self.g.call('/me')[0],401)
        self.assertEqual(self.g.call('/login',{'name':'Guest','password':'wrong'})[0],401)
        self.assertEqual(self.g.call('/login',{'name':'Guest','password':'test-password-123'})[0],200)
    def test_csrf_password(self):
        self.assertEqual(self.h.call('/sessions',{'title':'X'},False)[0],403)
        self.assertEqual(self.o.call('/register',{'name':'X','password':'short'})[0],400)
    def test_access(self):
        self.assertEqual(self.g.call(self.sp)[0],403);self.accept(self.g,self.uid)
        self.assertEqual(self.g.call(self.sp+'/device',{'device':'x'})[0],200)
        self.assertEqual(self.g.call(self.sp+'/race',{'mode':'duel','title':'x','policy':'host'})[0],403)
    def test_persistence_multiple_races(self):
        self.accept(self.g,self.uid);self.race()
        self.h.call(self.sp+'/race',{'mode':'training','title':'Second','policy':'host'});app.init()
        s=self.h.call(self.sp)[1];self.assertEqual(len(s['races']),2)
        self.assertEqual(s['devices'],['BP-01']);self.assertEqual(len(s['members']),2)
    def test_concurrent_position(self):
        self.accept(self.g,self.uid);self.accept(self.o,self.oid);rid=self.race()
        def claim(pair):
            c,uid=pair
            return c.call('/slot',{'race':rid,'device':'BP-01','side':0,'user':uid})[0]
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            result=list(pool.map(claim,[(self.g,self.uid),(self.o,self.oid)]))
        self.assertEqual(sorted(result),[200,409])
    def test_duplicate_and_host_policy(self):
        self.accept(self.g,self.uid);rid=self.race('host')
        d={'race':rid,'device':'BP-01','side':0,'user':self.uid}
        self.assertEqual(self.g.call('/slot',d)[0],403);self.assertEqual(self.h.call('/slot',d)[0],200)
        d['side']=1;self.assertEqual(self.h.call('/slot',d)[0],409)
    def test_removal(self):
        self.accept(self.g,self.uid);rid=self.race()
        self.g.call('/slot',{'race':rid,'device':'BP-01','side':0,'user':self.uid})
        self.h.call(self.sp+'/member',{'user':self.uid,'status':'removed'})
        self.assertEqual(self.h.call(self.sp)[1]['races'][0]['slots'],[])
        self.assertEqual(self.g.call(self.sp)[1]['membership'],'removed')
    def test_expiration(self):
        self.g.call('/join',{'code':self.code})
        with app.connect() as c:c.execute('UPDATE members SET expires=0 WHERE user=?',(self.uid,))
        self.assertEqual(self.h.call(self.sp+'/member',{'user':self.uid,'status':'accepted'})[0],409)
    def test_pending_privacy(self):
        self.accept(self.g,self.uid);self.o.call('/join',{'code':self.code})
        self.assertNotIn(self.oid,[m['id'] for m in self.g.call(self.sp)[1]['members']])
    def test_invalid_inputs(self):
        self.assertEqual(self.h.call(self.sp+'/race',{'mode':'bad','title':'x','policy':'host'})[0],400)
        rid=self.race();self.assertEqual(self.h.call('/slot',{'race':rid,'device':'BP-01','side':3,'user':self.uid})[0],400)
        self.assertEqual(self.h.call('/missing')[0],404)
if __name__=='__main__': unittest.main()

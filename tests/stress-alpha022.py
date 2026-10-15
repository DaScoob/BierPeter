import concurrent.futures,collections,http.cookiejar,json,statistics,sys,time,threading,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_api import Fixture,app
f=Fixture();f.setUp()
results={}
def cookie(client):
 jar=next(x.cookiejar for x in client.opener.handlers if isinstance(x,urllib.request.HTTPCookieProcessor))
 return '; '.join(c.name+'='+c.value for c in jar)
def request(path,data=None,client=None):
 header={'Cookie':cookie(client or f.h),'Content-Type':'application/json','X-BierPeter-Request':'1'}
 req=urllib.request.Request(f.h.base+path,data=None if data is None else json.dumps(data).encode(),headers=header)
 start=time.perf_counter()
 try:
  with urllib.request.urlopen(req,timeout=20) as r:return r.status,json.load(r),(time.perf_counter()-start)*1000
 except urllib.error.HTTPError as e:return e.code,json.load(e),(time.perf_counter()-start)*1000
 except Exception as e:return 'transport',type(e).__name__,(time.perf_counter()-start)*1000
try:
 sessions=[f.sid]+[f.h.call('/sessions',{'title':'Stress '+str(i)})[1]['id'] for i in (1,2)]
 def task(i):
  sid=sessions[i%3];p='/sessions/'+sid
  cases=[(p,None),('/account/vault',None),(p+'/device',{'device':'D01'}),(p+'/race',{'title':'Race '+str(i),'mode':'relay','policy':'host'}),(p+'/settings',{'public_url':'http://192.168.1.20:6017'})]
  return request(*cases[i%5])
 start=time.perf_counter()
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:r=list(pool.map(task,range(240)))
 values=[x[2] for x in r]
 results['mixed_load']={'requests':len(r),'parallel_workers':12,'elapsed_s':round(time.perf_counter()-start,2),'status_counts':dict(collections.Counter(str(x[0]) for x in r)),'median_ms':round(statistics.median(values),1),'p95_ms':round(statistics.quantiles(values,n=100)[94],1),'max_ms':round(max(values),1)}
 f.accept(f.g,f.uid);f.accept(f.o,f.oid);rid=f.race()
 def claim(i):return request('/slot',{'race':rid,'device':'BP-01','side':0,'user':f.uid if i%2 else f.oid},f.g if i%2 else f.o)
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:claims=list(pool.map(claim,range(48)))
 with app.connect() as c:assigned=[dict(x) for x in c.execute('SELECT * FROM slots WHERE race=?',(rid,))]
 assert len(assigned)==1
 results['position_contention']={'requests':48,'status_counts':dict(collections.Counter(str(x[0]) for x in claims)),'final_occupants':len(assigned)}
 # Force a valid interleaving between the multiple SELECT statements of a GET snapshot.
 event=threading.Event();release=threading.Event();original=app.Handler.access
 def delayed(self,c,sid,user,host=False):
  s=original(self,c,sid,user,host)
  if self.command=='GET' and sid==f.sid and self.headers.get('X-Stress-Snapshot')=='1':event.set();release.wait(5)
  return s
 app.Handler.access=delayed
 def snapshot():
  req=urllib.request.Request(f.h.base+f.sp,headers={'Cookie':cookie(f.h),'X-Stress-Snapshot':'1'})
  with urllib.request.urlopen(req,timeout=10) as response:return json.load(response)
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  future=pool.submit(snapshot);assert event.wait(5)
  status=f.h.call(f.sp+'/race-delete',{'race':rid})[0];assert status==200
  release.set();snapshot_value=future.result()
 app.Handler.access=original
 results['concurrent_snapshot']={'active_race_present_in_returned_races':snapshot_value['active_race'] in [r['id'] for r in snapshot_value['races']],'observed':'The response retains a single consistent read snapshot'}
 # Observe the current successful-login budget, not password guessing.
 statuses=[request('/login',{'name':'Host','password':'test-password-123'})[0] for _ in range(22)]
 results['login_burst']={'successful_credentials_requests':22,'status_counts':dict(collections.Counter(str(x) for x in statuses)),'scope':'Successful logins do not consume the failed-login budget'}
 with app.connect() as c:
  orphan=c.execute('SELECT COUNT(*) AS n FROM slots s JOIN races r ON r.id=s.race LEFT JOIN devices d ON d.session=r.session AND d.id=s.device WHERE d.id IS NULL').fetchone()['n']
 results['orphan_slots']=orphan
 assert all(x[0]==200 for x in r)
 assert snapshot_value['active_race'] in [x['id'] for x in snapshot_value['races']]
 assert all(x==200 for x in statuses)
 assert orphan==0
 print(json.dumps(results,ensure_ascii=False,indent=2))
finally:f.tearDown()

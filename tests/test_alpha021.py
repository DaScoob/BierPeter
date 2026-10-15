import base64
import json
from test_api import Fixture,app

class Alpha021Tests(Fixture):
    def test_shared_active_race_and_restart(self):
        self.accept(self.g,self.uid);first=self.race()
        self.h.call(self.sp+'/race',{'mode':'training','title':'Second','policy':'host'})
        self.assertEqual(self.h.call(self.sp+'/active-race',{'race':first})[0],200)
        self.assertEqual(self.g.call(self.sp)[1]['active_race'],first)
        app.init();self.assertEqual(self.h.call(self.sp)[1]['active_race'],first)
        self.assertEqual(self.g.call(self.sp+'/active-race',{'race':first})[0],403)
    def test_device_removal_keeps_account_and_cleans_slots(self):
        rid=self.race()
        self.h.call('/account/devices',{'device':'BP-01'})
        self.h.call('/slot',{'race':rid,'device':'BP-01','side':0,'user':self.h.call('/me')[1]['id']})
        self.assertEqual(self.h.call(self.sp+'/device-remove',{'device':'BP-01'})[0],200)
        s=self.h.call(self.sp)[1];self.assertEqual(s['devices'],[]);self.assertEqual(s['races'][0]['slots'],[])
        self.assertEqual(self.h.call('/account/devices')[1][0]['id'],'BP-01')
    def test_order_validation_and_persistence(self):
        self.h.call(self.sp+'/device',{'device':'Z-01'});self.h.call(self.sp+'/device',{'device':'A-02'})
        self.assertEqual(self.h.call(self.sp)[1]['devices'],['Z-01','A-02'])
        self.assertEqual(self.h.call(self.sp+'/device-order',{'devices':['A-02','Z-01']})[0],200)
        app.init();self.assertEqual(self.h.call(self.sp)[1]['devices'],['A-02','Z-01'])
        self.assertEqual(self.h.call(self.sp+'/device-order',{'devices':['A-02','A-02']})[0],409)
    def test_mode_limits_and_edit(self):
        self.accept(self.g,self.uid);self.accept(self.o,self.oid)
        rid=self.race();self.h.call(self.sp+'/race-edit',{'race':rid,'title':'Duel','mode':'duel','policy':'host'})
        self.h.call(self.sp+'/device',{'device':'BP-02'})
        host=self.h.call('/me')[1]['id']
        for side,user in [(0,host),(1,self.uid)]:self.assertEqual(self.h.call('/slot',{'race':rid,'device':'BP-01','side':side,'user':user})[0],200)
        self.assertEqual(self.h.call('/slot',{'race':rid,'device':'BP-02','side':0,'user':self.oid})[0],409)
        self.assertEqual(self.h.call(self.sp+'/race-edit',{'race':rid,'title':'Solo','mode':'training','policy':'host'})[0],200)
        self.assertEqual(self.h.call(self.sp)[1]['races'][0]['slots'],[])
        self.assertEqual(self.h.call('/slot',{'race':rid,'device':'BP-01','side':0,'user':host})[0],200)
        self.assertEqual(self.h.call('/slot',{'race':rid,'device':'BP-01','side':1,'user':self.uid})[0],409)
    def test_race_delete_and_foreign_session(self):
        rid=self.race();self.assertEqual(self.h.call(self.sp+'/race-delete',{'race':rid})[0],200)
        self.assertEqual(self.h.call(self.sp)[1]['races'],[])
        self.assertIsNone(self.h.call(self.sp)[1]['active_race'])
        self.assertEqual(self.h.call(self.sp+'/active-race',{'race':'missing'})[0],404)
    def test_account_device_scope(self):
        self.h.call('/account/devices',{'device':'BP-01'})
        self.assertEqual(self.g.call('/account/devices')[1],[])
        self.g.call('/account/devices',{'device':'BP-01','action':'delete'})
        self.assertEqual(len(self.h.call('/account/devices')[1]),1)
    def test_private_vault_scope_format_revision(self):
        envelope={'v':1,'alg':'A256GCM','iv':base64.b64encode(b'0'*12).decode(),'ciphertext':base64.b64encode(b'1'*24).decode()}
        self.assertEqual(self.h.call('/account/vault',{'revision':0,'envelope':envelope})[0],200)
        self.assertEqual(self.h.call('/account/vault',{'revision':0,'envelope':envelope})[0],409)
        self.assertIsNone(self.g.call('/account/vault')[1]['envelope'])
        self.assertEqual(self.h.call('/account/vault',{'revision':1,'envelope':{'name':'plain'}})[0],400)
        self.assertEqual(self.h.call('/account/vault')[1]['revision'],1)
    def test_rejoin_without_invitation(self):
        self.accept(self.g,self.uid);self.h.call(self.sp+'/member',{'user':self.uid,'status':'removed'})
        self.assertEqual(self.g.call(self.sp+'/rejoin',{})[0],200)
        self.assertEqual(self.g.call(self.sp)[1]['membership'],'pending')
        self.assertEqual(self.o.call(self.sp+'/rejoin',{})[0],403)
    def test_public_url_validation(self):
        self.assertEqual(self.h.call(self.sp+'/settings',{'public_url':'http://127.0.0.1:6017'})[0],400)
        self.assertEqual(self.h.call(self.sp+'/settings',{'public_url':'http://192.168.42.20:6017'})[0],200)
        self.assertEqual(self.h.call(self.sp)[1]['public_url'],'http://192.168.42.20:6017')
        self.assertEqual(self.h.call(self.sp+'/settings',{'public_url':'https://user:password@example.test'})[0],400)
    def test_migration_from_old_schema_preserves_data(self):
        with app.connect() as c:
            c.execute('CREATE TABLE marker(value TEXT)');c.execute('INSERT INTO marker VALUES(?)',('retained',))
        app.init();app.init()
        with app.connect() as c:self.assertEqual(c.execute('SELECT value FROM marker').fetchone()['value'],'retained')
        self.assertEqual(self.h.call(self.sp)[1]['title'],'Test')

    def test_actual_legacy_schema_migration(self):
        import sqlite3
        from pathlib import Path
        before=app.DB
        legacy=Path(self.tmp.name)/'legacy.sqlite3'
        with sqlite3.connect(legacy) as c:
            c.executescript("CREATE TABLE sessions(id TEXT PRIMARY KEY,title TEXT,host TEXT,code TEXT);CREATE TABLE devices(session TEXT,id TEXT,PRIMARY KEY(session,id));CREATE TABLE races(id TEXT PRIMARY KEY,session TEXT,mode TEXT,policy TEXT,title TEXT,state TEXT);")
            c.execute('INSERT INTO sessions VALUES(?,?,?,?)',('old','Old lobby','host','code'))
            c.execute('INSERT INTO devices VALUES(?,?)',('old','Z-01'))
            c.execute('INSERT INTO devices VALUES(?,?)',('old','A-02'))
            c.execute('INSERT INTO races VALUES(?,?,?,?,?,?)',('old-race','old','relay','host','Old race','draft'))
        app.DB=legacy
        try:
            app.init();app.init()
            with app.connect() as c:
                self.assertEqual(c.execute('SELECT title,active_race FROM sessions').fetchone()['active_race'],'old-race')
                self.assertEqual([r['id'] for r in c.execute('SELECT id FROM devices ORDER BY position')],['A-02','Z-01'])
                self.assertEqual(c.execute('SELECT title FROM sessions').fetchone()['title'],'Old lobby')
        finally:app.DB=before

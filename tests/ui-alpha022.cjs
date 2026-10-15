// Real HTTP + application JavaScript, with a minimal DOM adapter.
// This verifies user flows; it does not verify browser layout or CSS.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bierpeter-flow-'));
const server=spawn('python3',['-u','-c',"import server; from http.server import ThreadingHTTPServer; server.init(); s=server.Server(('127.0.0.1',0),server.Handler); print(s.server_port,flush=True); s.serve_forever()"],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BIERPETER_DB:path.join(temp,'test.sqlite3')}});
function waitPort(){return new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve(Number(String(d).trim())));server.once('error',reject);server.once('exit',code=>reject(Error('server exited '+code)));setTimeout(()=>reject(Error('server startup timeout')),10000).unref();});}
async function browser(base,search='',existingJar){
  const nodes=new Map(),handlers={},jar=existingJar||{cookie:''};
  const node=()=>({innerHTML:'',textContent:'',disabled:false,replaceChildren(){this.innerHTML='';},scrollIntoView(){}});
  const location={search,pathname:'/',hash:'',origin:base};
  const doc={hidden:false,activeElement:null,querySelector(s){if(s.startsWith('form['))return null;if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll(){return [];},addEventListener(name,fn){handlers[name]=fn;}};
  const c={document:doc,location,history:{replaceState(a,b,url){const u=new URL(url,base);location.search=u.search;location.hash=u.hash;}},window:{addEventListener(){}},navigator:{},URL,URLSearchParams,AbortSignal,Date,console,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,btoa,atob,Blob,structuredClone,setTimeout(){},setInterval(){},confirm:()=>true,FormData:class{constructor(f){return new Map(Object.entries(f.values));}},fetch:async(url,options={})=>{const headers={...(options.headers||{})};if(jar.cookie)headers.Cookie=jar.cookie;const r=await fetch(base+url,{...options,headers});const cookie=r.headers.get('set-cookie');if(cookie)jar.cookie=cookie.split(';')[0];return r;}};
  vm.createContext(c);for(const file of ['vault.js','sharing.js','vendor/qrcodegen.js','vendor/qr-scanner.umd.min.js','qr.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/'+file),'utf8'),c);await vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),c);
  const run=code=>vm.runInContext(code,c);
  const form=async(kind,values)=>{const b={disabled:false},f={dataset:{form:kind},values,querySelector:()=>b};await handlers.submit({preventDefault(){},target:{closest:()=>f}});};
  return {run,form,nodes,jar,location,handlers};
}
(async()=>{
 const port=await waitPort(),base='http://127.0.0.1:'+port;
 const host=await browser(base);await host.run("action('register')");await host.form('auth',{name:'Host',password:'test-password-123'});await host.form('session',{title:'Alpha 022'});
 const sid=host.run('state.session.id'),code=host.run('state.session.code');
 assert.match(host.nodes.get('#app').innerHTML,/QR-Code zur Session-Einladung/);
 await host.form('device',{device:'A-01'});await host.form('device',{device:'B-02'});
 await host.form('race',{title:'Race A',mode:'duel',policy:'host'});const raceA=host.run('activeRace().id');
 await host.form('race',{title:'Race B',mode:'training',policy:'host'});const raceB=host.run('activeRace().id');
 await host.run(`api('/sessions/${sid}/active-race',{race:'${raceA}'});`);await host.run('refresh()');
 const other=await browser(base,host.location.search,host.jar);
 await host.run(`globalThis.restored={};globalThis.originalQuery=document.querySelector;document.querySelectorAll=s=>s==='form[data-form]'?[{dataset:{form:'race-edit',race:'${raceA}'},values:{title:'Unsaved A',race:'${raceA}'}}]:[];document.querySelector=s=>s==='form[data-form="race-edit"]'?{dataset:{race:activeRace().id},elements:{namedItem(name){return {set value(value){restored[name]=value;}}}}}:originalQuery(s);`);
 await other.run(`api('/sessions/${sid}/active-race',{race:'${raceB}'})`);await host.run('poll()');
 assert.equal(host.run('activeRace().id'),raceB);assert.equal(host.run('Object.keys(restored).length'),0);
 await host.run('document.querySelector=originalQuery;document.querySelectorAll=()=>[]');
 await host.form('race-edit',{race:raceA,title:'Changed A',mode:'duel',policy:'host'});
 assert.equal(host.run(`state.session.races.find(r=>r.id==='${raceA}').title`),'Changed A');
 assert.equal(host.run(`state.session.races.find(r=>r.id==='${raceB}').title`),'Race B');
 await host.run("action('remember:A-01')");await host.run("action('profile')");await host.run("action('vault-create')");const recovery=host.run('state.recovery');await host.run("action('vault-confirm')");
 await host.form('managed-name',{device:'A-01',name:'Garten-BierPeter'});
 const guest=await browser(base,'?join='+code);await guest.run("action('register')");await guest.form('auth',{name:'Guest',password:'test-password-123'});
 assert.equal(guest.run('state.session.membership'),'pending');
 await guest.run("action('profile')");await guest.run("action('vault-create')");await guest.run("action('vault-confirm')");
 await host.run(`action('back')`);await host.run(`action('accept:${guest.run('state.user.id')}')`);
 await guest.run("action('back')");await host.run('poll()');await guest.run('poll()');
 assert.equal(guest.run("deviceName('A-01')"),'Garten-BierPeter');
 const payload=await guest.run(`api('/sessions/${sid}')`);
 assert(!JSON.stringify(payload).includes('Garten-BierPeter'));
 assert(!JSON.stringify(payload).includes('"d":'));assert(!JSON.stringify(payload).includes(recovery));
 assert.match(guest.nodes.get('#app').innerHTML,/Garten-BierPeter/);
 assert(guest.run('Object.values(state.fingerprints).every(s=>s.length===71)'));
 const provider=host.run('state.user.id');
 await guest.run(`globalThis.changedKeys=structuredClone(state.session);changedKeys.identity_keys['${provider}']=BierPeterSharing.publicPart(state.private.identity);`);
 await assert.rejects(guest.run('syncNames(changedKeys)'),/Schlüssel/);
 await guest.run('poll()');assert.equal(guest.run("deviceName('A-01')"),'Garten-BierPeter');
 // A name cannot be replayed into a different session or recipient context.
 const shared=payload.shared_names[0];
 await assert.rejects(guest.run(`BierPeterSharing.open(state.private.identity,state.session.identity_keys['${shared.provider}'],'another-session','${shared.provider}',state.user.id,${JSON.stringify(shared.envelope)})`));
 // A stale tab must leave BOTH the device list and vault untouched.
 const stale=await browser(base,host.location.search,host.jar);await stale.run("action('profile')");await stale.form('vault-unlock',{recovery});
 await host.run("action('profile')");await host.run("action('widget-up:modes')");
 await assert.rejects(stale.run("action('managed-delete:A-01')"),error=>error.status===409);
 assert.equal((await host.run("api('/account/devices')")).length,1);
 const stored=await host.run("api('/account/vault')");
 assert.equal((await host.run(`BierPeterVault.open(state.vaultKey,state.user.id,${JSON.stringify(stored.envelope)})`)).aliases['A-01'],'Garten-BierPeter');
 // The physical first session device is unassigned, so only B is the relay start.
 await host.run("action('back')");await host.form('race',{title:'Staffel',mode:'relay',policy:'host'});
 const rid=host.run('activeRace().id'),uid=host.run('state.user.id');
 await host.run(`api('/slot',{race:'${rid}',device:'B-02',side:0,user:'${uid}'})`);await host.run('refresh()');
 assert.equal(host.run('roundDevices()[0]'),'B-02');
 assert.match(host.nodes.get('#app').innerHTML,/Nicht aufgestellt/);
 // Scanned links are parsed locally; there is no navigation to a foreign server.
 await host.run(`acceptScan('https://device.example/?84F3EB52F7F9','lobby')`);
 assert(host.run("state.session.devices.includes('84F3EB52F7F9')"));
 await host.run(`action('delete-session:${sid}')`);assert.equal(host.run('state.session'),null);
 await guest.run('poll()');assert.equal(guest.run('state.view'),'link-error');
 const old=await browser(base,'?join='+code,guest.jar);assert.equal(old.run('state.view'),'link-error');
 console.log('Alpha 0.2.2 HTTP/UI checks passed: invitation QR, multiple-tab race isolation, real ECDH/HKDF/AES-GCM name exchange, ciphertext-only API, context replay rejection, atomic stale deletion, relay start, device QR context and deleted-session handling.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.kill();fs.rmSync(temp,{recursive:true,force:true});});

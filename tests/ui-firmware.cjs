// Real HTTP + application JavaScript, with a minimal DOM adapter.
// This verifies user flows; it does not verify browser layout or CSS.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bierpeter-flow-'));
const server=spawn('python3',['-u','-c',"import server; from http.server import ThreadingHTTPServer; server.init(); s=server.Server(('127.0.0.1',0),server.Handler); print(s.server_port,flush=True); s.serve_forever()"],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BIERPETER_DB:path.join(temp,'test.sqlite3'),DEVICE_API_KEY:'test-device-key-at-least-32-characters'}});
function waitPort(){return new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve(Number(String(d).trim())));server.once('error',reject);server.once('exit',code=>reject(Error('server exited '+code)));setTimeout(()=>reject(Error('server startup timeout')),10000).unref();});}
async function browser(base,search='',existingJar){
  const nodes=new Map(),handlers={},jar=existingJar||{cookie:''};
  const node=()=>({innerHTML:'',textContent:'',disabled:false,replaceChildren(){this.innerHTML='';},scrollIntoView(){}});
  const location={search,pathname:'/',hash:'',origin:base};
  const doc={hidden:false,activeElement:null,querySelector(s){if(s.startsWith('form['))return null;if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll(){return [];},addEventListener(name,fn){handlers[name]=fn;}};
  const c={document:doc,location,history:{replaceState(a,b,url){const u=new URL(url,base);location.search=u.search;location.hash=u.hash;}},window:{addEventListener(){}},navigator:{},URL,URLSearchParams,AbortSignal,Date,console,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,btoa,atob,Blob,structuredClone,setTimeout(){},setInterval(){},confirm:()=>true,FormData:class{constructor(f){return new Map(Object.entries(f.values));}},fetch:async(url,options={})=>{const headers={...(options.headers||{})};if(jar.cookie)headers.Cookie=jar.cookie;const r=await fetch(base+url,{...options,headers});const cookie=r.headers.get('set-cookie');if(cookie)jar.cookie=cookie.split(';')[0];return r;}};
  vm.createContext(c);for(const file of ['vault.js','sharing.js','vendor/qrcodegen.js','vendor/qr-scanner.umd.min.js','qr.js','runs.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/'+file),'utf8'),c);await vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),c);
  const run=code=>vm.runInContext(code,c);
  const form=async(kind,values)=>{const b={disabled:false},f={dataset:{form:kind},values,querySelector:()=>b};await handlers.submit({preventDefault(){},target:{closest:()=>f}});};
  return {run,form,nodes,jar,location,handlers};
}
(async()=>{
 const port=await waitPort(),base='http://127.0.0.1:'+port;
 const host=await browser(base);await host.run("action('register')");await host.form('auth',{name:'Host',password:'test-password-123'});await host.form('session',{title:'Hardware demo'});
 const sid=host.run('state.session.id'),uid=host.run('state.user.id');
 await host.run("action('profile')");await host.run("action('vault-create')");const recovery=host.run('state.recovery');await host.run("action('vault-confirm')");
 assert.equal(host.run('state.private.runIdentity.public.length'),64);
 const crypto=require('node:crypto');const device=await crypto.webcrypto.subtle.generateKey('X25519',true,['deriveBits']);
 const pub=Buffer.from(await crypto.webcrypto.subtle.exportKey('raw',device.publicKey)).toString('hex');
 const A='AABBCCDDEEFF';
 async function hw(path,data){const r=await fetch(base+'/api/v1'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-Device-Key':'test-device-key-at-least-32-characters'},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;}
 await hw('/heartbeat',{device_id:A,firmware:'0.3.0-alpha',wifi_rssi:-50,wifi_channel:11,uptime_ms:1234,run_public:pub,game_state:'idle'});
 await host.run(`enterSession('${sid}')`);await host.run(`api('/sessions/${sid}/device',{device:'${A}'})`);
 // A single physical BierPeter has both left and right sides. Use two account slots.
 const guest=await browser(base,'?join='+host.run('state.session.code'));await guest.run("action('register')");await guest.form('auth',{name:'Guest',password:'test-password-123'});const guestId=guest.run('state.user.id');
 await host.run(`action('accept:${guestId}')`);await guest.run("action('profile')");await guest.run("action('vault-create')");await guest.run("action('vault-confirm')");
 await host.run(`enterSession('${sid}')`);await host.run(`api('/sessions/${sid}/race',{mode:'duel',policy:'host',title:'Duel'})`);await host.run('refresh()');const race=host.run('activeRace().id');
 await host.run(`api('/slot',{race:'${race}',device:'${A}',side:0,user:'${uid}'})`);await host.run(`api('/slot',{race:'${race}',device:'${A}',side:1,user:'${guestId}'})`);await host.run('refresh()');
 assert.match(host.nodes.get('#app').innerHTML,/Demo beschleunigt starten/);await host.run("action('demo:false')");
 const command=(await hw('/commands?device_id='+A)).command;assert.equal(command.action,'demo');assert.equal(command.payload.realtime,false);
 const result={v:1,run:command.payload.run,mode:'duel',demo:true,realtime:false,total_us:[3000000,4500000],splits:[{device:A,side:0,duration_us:3000000},{device:A,side:1,duration_us:4500000}]};
 for(const recipient of command.payload.recipients){
  const key=await crypto.webcrypto.subtle.importKey('raw',Buffer.from(recipient.public,'hex'),'X25519',false,[]);
  const shared=await crypto.webcrypto.subtle.deriveBits({name:'X25519',public:key},device.privateKey,256);
  const material=await crypto.webcrypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  const scope='BierPeter:result:v1:'+result.run+':'+A+':'+recipient.id;
  const derived=await crypto.webcrypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:Buffer.from('BierPeter:run:v1'),info:Buffer.from(scope)},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const iv=crypto.randomBytes(12);const cipher=await crypto.webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:Buffer.from(scope)},derived,Buffer.from(JSON.stringify(result)));
  await hw('/run-result',{device_id:A,run:result.run,recipient:recipient.id,envelope:{v:1,alg:'X25519-HKDF-SHA256-A256GCM',public:pub,iv:iv.toString('base64'),ciphertext:Buffer.from(cipher).toString('base64')}});
 }
 await host.run('refresh()');assert.match(host.nodes.get('#app').innerHTML,/3\.000 s/);assert.match(host.nodes.get('#app').innerHTML,/4\.500 s/);
 assert.equal(host.run('state.private.results.length'),0,'Demo must never count as a best time');
 await host.run("action('vault-lock')");assert.equal(host.run('Object.keys(state.runResults).length'),0);assert(!host.nodes.get('#app').innerHTML.includes('4.500 s'));
 await host.form('vault-unlock',{recovery});await host.run(`enterSession('${sid}')`);assert.match(host.nodes.get('#app').innerHTML,/4\.500 s/);
 const run=host.run('state.session.runs[0]');const replay={...run,id:'different-run'};host.run('globalThis.replay='+JSON.stringify(replay));await assert.rejects(host.run(`BierPeterRuns.open(state.private.runIdentity,replay,'${uid}')`));
 await hw('/heartbeat',{device_id:A,firmware:'0.3.0-alpha',wifi_rssi:-50,wifi_channel:11,uptime_ms:2345,run_public:'09'+'00'.repeat(31),game_state:'idle'});await host.run('refresh()');await assert.rejects(host.run("action('demo:false')"),/Geräteschlüssel/);
 console.log('Firmware UI/HTTP: demo dispatch, real X25519/HKDF/AES-GCM, recipient decryption, replay rejection, no demo statistics, key lock/recovery passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.kill();fs.rmSync(temp,{recursive:true,force:true});});

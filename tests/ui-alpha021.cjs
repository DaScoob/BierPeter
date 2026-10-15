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
 const host=await browser(base);await host.run("action('register')");await host.form('auth',{name:'Host',password:'test-password-123'});await host.form('session',{title:'Alpha 021'});
 const sid=host.run('state.session.id'),code=host.run('state.session.code');
 const guest=await browser(base,'?join='+code);await guest.run("action('register')");await guest.form('auth',{name:'Guest',password:'test-password-123'});
 await host.run(`action('accept:${guest.run('state.user.id')}')`);await guest.run('poll()');
 await host.form('device',{device:'Z-01'});await host.form('device',{device:'A-02'});
 await host.run("action('device-up:A-02')");assert.equal(host.run('state.session.devices[0]'),'A-02');
 await host.form('race',{title:'First',mode:'relay',policy:'host'});const first=host.run('activeRace().id');
 await host.form('race',{title:'Second',mode:'training',policy:'host'});
 await host.handlers.change({target:{id:'race-choice',value:first}});await guest.run('poll()');assert.equal(guest.run('activeRace().id'),first);
 const reload=await browser(base,host.location.search,host.jar);assert.equal(reload.run('activeRace().id'),first);
 await host.form('race-edit',{title:'Corrected',mode:'duel',policy:'free'});assert.equal(host.run('activeRace().title'),'Corrected');
 await host.run("action('delete-race')");assert.equal(host.run('state.session.races.length'),1);
 await host.form('public-url',{public_url:'http://192.168.42.20:6017'});assert.match(host.nodes.get('#app').innerHTML,/http:\/\/192\.168\.42\.20:6017\/\?join=/);
 await host.run("action('remember:A-02')");await host.run("action('profile')");assert.match(host.nodes.get('#app').innerHTML,/Meine BierPeter/);
 await host.run("action('vault-create')");const recovery=host.run('state.recovery');assert.equal(recovery.length,64);
 await host.run("action('vault-confirm')");assert(host.run('!!state.private'));
 await host.form('managed-name',{device:'A-02',name:'Privater Garten-BierPeter'});
 assert.match(host.nodes.get('#app').innerHTML,/Privater Garten-BierPeter/);
 const stored=await host.run("api('/account/vault')");assert(!JSON.stringify(stored).includes('Privater Garten'));
 await host.run("action('dashboard-edit')");await host.run("action('widget-up:modes')");
 await host.handlers.change({target:{id:'',dataset:{widget:'history'},checked:false}});
 assert.equal(host.run("state.private.widgets.find(w=>w.id==='history').visible"),false);
 await host.run("action('vault-lock')");assert.equal(host.run('state.private'),null);
 await host.form('vault-unlock',{recovery:'0'.repeat(64)});assert.equal(host.run('state.private'),null);
 await host.handlers.change({target:{id:'vault-key-file',files:[{text:async()=>JSON.stringify({format:'bierpeter-private-key',account:host.run('state.user.id'),key:recovery})}]}});assert.equal(host.run('state.private'),null);assert.equal(host.run('state.keyInput'),recovery);await host.form('vault-unlock',{recovery});assert.equal(host.run("state.private.aliases['A-02']"),'Privater Garten-BierPeter');
 assert.equal(host.run("state.private.widgets.find(w=>w.id==='history').visible"),false);
 assert.equal(host.run('state.private.widgets[2].id'),'modes');
 const snapshot=JSON.stringify(await host.run("api('/account/vault')"));assert(!snapshot.includes('history'));
 const cipher=await host.run(`BierPeterVault.seal(state.vaultKey,state.user.id,{test:true})`);
 const tampered={...cipher,ciphertext:(cipher.ciphertext[0]==='A'?'B':'A')+cipher.ciphertext.slice(1)};
 await assert.rejects(host.run(`BierPeterVault.open(state.vaultKey,state.user.id,${JSON.stringify(tampered)})`));
 await host.run("action('managed-delete:A-02')");assert.equal(host.run('state.managed.length'),0);
 await host.run("action('back')");assert(host.run("state.session.devices.includes('A-02')"));
 await host.run("action('device-remove:A-02')");assert(!host.run("state.session.devices.includes('A-02')"));
 const scanner=await browser(base,'?84F3EB52F7F9',host.jar);await scanner.run("action('discard-device')");assert.equal(scanner.run('state.device'),'');assert.equal(scanner.run('state.view'),'home');
 await host.run("action('logout')");assert.equal(host.run('state.vaultKey'),null);
 console.log('Alpha 0.2.1 HTTP/UI checks passed: shared race/reload, order, editing/deletion, LAN invitation, account device management, real WebCrypto vault, encrypted alias/widgets, unlock/wrong key/tampering, device removal, scan cancellation and logout key clearing.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.kill();fs.rmSync(temp,{recursive:true,force:true});});

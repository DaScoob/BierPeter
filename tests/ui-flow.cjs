// Real HTTP + application JavaScript, with a minimal DOM adapter.
// This verifies user flows; it does not verify browser layout or CSS.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bierpeter-flow-'));
const server=spawn('python3',['-u','-c',"import server; from http.server import ThreadingHTTPServer; server.init(); s=ThreadingHTTPServer(('127.0.0.1',0),server.Handler); print(s.server_port,flush=True); s.serve_forever()"],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BIERPETER_DB:path.join(temp,'test.sqlite3')}});
function waitPort(){return new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve(Number(String(d).trim())));server.once('error',reject);server.once('exit',code=>reject(Error('server exited '+code)));setTimeout(()=>reject(Error('server startup timeout')),10000).unref();});}
async function browser(base,search='',existingJar){
  const nodes=new Map(),handlers={},jar=existingJar||{cookie:''};
  const node=()=>({innerHTML:'',textContent:'',disabled:false,replaceChildren(){this.innerHTML='';},scrollIntoView(){}});
  const location={search,pathname:'/',hash:'',origin:base};
  const doc={hidden:false,activeElement:null,querySelector(s){if(s.startsWith('form['))return null;if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll(){return [];},addEventListener(name,fn){handlers[name]=fn;}};
  const c={document:doc,location,history:{replaceState(a,b,url){const u=new URL(url,base);location.search=u.search;location.hash=u.hash;}},window:{addEventListener(){}},navigator:{},URL,URLSearchParams,AbortSignal,Date,console,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,btoa,atob,Blob,structuredClone,setTimeout(){},setInterval(){},confirm:()=>true,FormData:class{constructor(f){return new Map(Object.entries(f.values));}},fetch:async(url,options={})=>{const headers={...(options.headers||{})};if(jar.cookie)headers.Cookie=jar.cookie;const r=await fetch(base+url,{...options,headers});const cookie=r.headers.get('set-cookie');if(cookie)jar.cookie=cookie.split(';')[0];return r;}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/vault.js'),'utf8'),c);await vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),c);
  const run=code=>vm.runInContext(code,c);
  const form=async(kind,values)=>{const b={disabled:false},f={dataset:{form:kind},values,querySelector:()=>b};await handlers.submit({preventDefault(){},target:{closest:()=>f}});};
  return {run,form,nodes,jar,location,handlers};
}
(async()=>{
  const port=await waitPort(),base='http://127.0.0.1:'+port;
  const host=await browser(base);await host.run("action('register')");await host.form('auth',{name:'Host',password:'test-password-123'});
  await host.form('session',{title:'Direkte Lobby'});
  const sid=host.run('state.session.id'),code=host.run('state.session.code');
  const guest=await browser(base,'?join='+code);await guest.run("action('register')");await guest.form('auth',{name:'Guest',password:'test-password-123'});
  assert.equal(guest.run('state.view'),'lobby');assert.equal(guest.run('state.session.membership'),'pending');
  assert.match(guest.nodes.get('#app').innerHTML,/Die Anfrage ist beim Host/);
  assert.equal(guest.run('state.session.id'),sid);assert.match(guest.location.search,/join=/);
  const uid=guest.run('state.user.id');await host.run(`action('accept:${uid}')`);await guest.run('poll()');
  assert.equal(guest.run('state.session.membership'),'accepted');assert.match(guest.nodes.get('#app').innerHTML,/Unsere Spielgruppe/);
  assert(!guest.location.search.includes('join='));
  await guest.run("action('logout')");
  const returning=await browser(base,'?join='+code);await returning.form('auth',{name:'Guest',password:'test-password-123'});
  assert.equal(returning.run('state.view'),'lobby');assert.equal(returning.run('state.session.membership'),'accepted');
  const scan=await browser(base,'?84F3EB52F7F9');await scan.run("action('register')");await scan.form('auth',{name:'Scanner',password:'test-password-123'});
  assert.equal(scan.run('state.device'),'84F3EB52F7F9');assert.equal(scan.run('state.view'),'device-entry');
  await scan.form('session',{title:'Mit gescanntem Gerät'});
  assert.equal(scan.run('state.session.devices[0]'),'84F3EB52F7F9');assert.equal(scan.run('state.device'),'');
  const reload=await browser(base,scan.location.search,scan.jar);
  assert.equal(reload.run('state.view'),'lobby');assert.equal(reload.run('state.session.devices[0]'),'84F3EB52F7F9');
  const add=await browser(base,'?device=AA:BB:CC:DD:EE:FF&session='+sid,returning.jar);
  assert.equal(add.run('state.session.devices[0]'),'AABBCCDDEEFF');assert.equal(add.run('state.session.membership'),'accepted');
  const invalid=await browser(base,'?join=unknown-code',returning.jar);
  assert.equal(invalid.run('state.view'),'link-error');assert(invalid.run('!!state.user'));
  console.log('7 UI/HTTP flows passed: invite registration, waiting lobby, automatic acceptance, existing login, raw device link, session reload, participant device provisioning. Invalid-link recovery also passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.kill();fs.rmSync(temp,{recursive:true,force:true});});

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
 const host=await browser(base);await host.run("action('register')");await host.form('auth',{name:'Host',password:'test-password-123'});await host.form('session',{title:'Known players'});
 const oldSid=host.run('state.session.id'),code=host.run('state.session.code'),hostID=host.run('state.user.id');
 const guest=await browser(base,'?join='+code);await guest.run("action('register')");await guest.form('auth',{name:'Guest',password:'test-password-123'});
 const guestID=guest.run('state.user.id');await host.run(`action('accept:${guestID}')`);await guest.run('poll()');
 await guest.run("action('profile')");assert.match(guest.nodes.get('#app').innerHTML,/Freunde &amp; bekannte Spieler|Freunde & bekannte Spieler/);
 await guest.run(`action('friend:request:${hostID}')`);await host.run("action('profile')");
 assert.equal(host.run('state.social.incoming.length'),1);await host.run(`action('friend:accept:${guestID}')`);
 assert.equal(host.run('state.social.friends[0].id'),guestID);
 // Secret controls work for generated, typed and imported values; no key upload.
 await host.run("action('vault-create')");const recovery=host.run('state.recovery');
 await host.run("navigator.clipboard={writeText:async value=>{globalThis.copied=value;}};");
 await host.run("action('key-copy:generated')");assert.equal(host.run('copied'),recovery);
 assert.equal(host.run('state.keyVisible.generated'),false);
 await host.run("action('key-toggle:generated')");assert.equal(host.run('state.keyVisible.generated'),true);
 await host.run("action('vault-confirm')");await host.run("action('vault-lock')");await assert.rejects(host.run("action('vault-create')"),/bereits/);
 await host.run("globalThis.sent=[];globalThis.realFetch=fetch;fetch=(url,options={})=>{if(options.body)sent.push(options.body);return realFetch(url,options);};");
 await host.handlers.change({target:{id:'vault-key-file',files:[{size:200,text:async()=>JSON.stringify({format:'bierpeter-private-key',account:hostID,key:recovery})}]}});
 assert.equal(host.run('state.private'),null);assert.equal(host.run('state.keyInput'),recovery);
 assert.equal(host.run('sent.length'),0);
 await host.run("action('key-toggle:unlock')");assert.equal(host.run('state.keyVisible.unlock'),true);
 await host.run("action('key-toggle:unlock')");await host.run("action('key-copy:unlock')");assert.equal(host.run('copied'),recovery);
 assert.equal(host.run('state.keyVisible.unlock'),false);
 // Clipboard refusal exposes and selects only after an explicit Copy action.
 await host.run("navigator.clipboard={writeText:async()=>{throw Error('denied');}};document.querySelector('#recovery-key').select=()=>{globalThis.selected=true;};");
 await host.run("action('key-copy:unlock')");assert.equal(host.run('selected'),true);assert.equal(host.run('state.keyVisible.unlock'),true);
 await host.form('vault-unlock',{recovery});assert(host.run('!!state.private'));assert.equal(host.run('state.keyInput'),'');assert.equal(host.run('state.keyVisible.unlock'),false);
 assert(!host.run('JSON.stringify(sent)').includes(recovery));
 await host.run("action('vault-lock')");await host.handlers.input({target:{id:'recovery-key',value:recovery}});
 await host.run("action('key-toggle:unlock')");assert.equal(host.run('state.keyInput'),recovery);
 await host.form('vault-unlock',{recovery});assert.equal(host.run('state.keyInput'),'');
 const other=await browser(base,'?join='+code);await other.run("action('register')");await other.form('auth',{name:'Other',password:'test-password-123'});
 const otherID=other.run('state.user.id');await host.run("action('back')");await host.run(`action('accept:${otherID}')`);await other.run('poll()');
 await other.run("action('profile')");await other.run(`action('friend:request:${guestID}')`);
 await guest.run("action('profile')");await guest.run(`action('friend:accept:${otherID}')`);
 // New lobby: a non-host can invite only after explicit host permission.
 await host.form('session',{title:'Invitation target'});const sid=host.run('state.session.id'),newCode=host.run('state.session.code');
 await guest.run(`api('/join',{code:'${newCode}'})`);await guest.run(`enterSession('${sid}')`);await host.run(`action('accept:${guestID}')`);await guest.run('poll()');
 assert.equal(guest.run('state.session.allow_member_invites'),0);
 await assert.rejects(guest.run(`api('/sessions/${sid}/invite',{user:'${otherID}'})`),error=>error.status===403);
 await host.handlers.change({target:{id:'invite-policy',checked:true}});await guest.run('poll()');
 assert.match(guest.nodes.get('#app').innerHTML,/friend-invite/);
 await guest.form('friend-invite',{user:otherID});await other.run("action('home')");
 assert.equal(other.run('state.social.invitations.length'),1);const invitation=other.run('state.social.invitations[0].id');
 await other.run(`action('invitation:accept:${invitation}')`);assert.equal(other.run('state.session.membership'),'pending');assert.equal(other.run('state.session.id'),sid);
 await host.run(`action('accept:${otherID}')`);await other.run('poll()');assert.equal(other.run('state.session.membership'),'accepted');
 // Block and unblock a contact; no inherited device/statistics permissions.
 await other.run("action('profile')");await other.run(`action('friend:block:${guestID}')`);assert.equal(other.run('state.social.blocked.length'),1);
 await other.run(`action('friend:unblock:${guestID}')`);assert.equal(other.run('state.social.friends.length'),0);
 await guest.form('session',{title:'Deleted with account'});const owned=guest.run('state.session.id');
 await guest.run("action('profile')");assert.match(guest.nodes.get('#app').innerHTML,/Konto endgültig löschen/);
 await guest.run('globalThis.confirm=()=>false');await guest.run("action('delete-account')");assert(guest.run('!!state.user'));
 await guest.run('globalThis.confirm=()=>true');await guest.run("action('delete-account')");assert.equal(guest.run('state.user'),null);assert.equal(guest.run('state.session'),null);assert.equal(guest.run('state.vaultKey'),null);assert.equal(guest.run('state.social.friends.length'),0);
 await assert.rejects(host.run(`api('/sessions/${owned}')`),error=>error.status===404);
 await host.run('refresh()');assert(!host.run(`state.session.members.some(m=>m.id==='${guestID}')`));
 await host.run("action('profile')");assert.equal(host.run('state.social.friends.length'),0);
 console.log('Alpha 0.3.0 UI/HTTP checks passed: friendship requests/acceptance, guarded participant invitations, host approval, blocking, key reveal/copy/file staging/manual input/clipboard fallback, no key upload, cancellation and confirmed account/session deletion without password.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.kill();fs.rmSync(temp,{recursive:true,force:true});});

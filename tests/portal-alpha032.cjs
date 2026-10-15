// SPDX-License-Identifier: AGPL-3.0-only
// Actual portal HTML/JavaScript in jsdom. Network/radio responses are controlled fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.BIERPETER_JSDOM||'jsdom');
const html=fs.readFileSync('firmware/portal.html','utf8');
let serial=0,failSave=false,failTest=false,unreachable=false,posts=[],testStep=0;
let state={firmware:'0.3.2-alpha',id:'AABBCCDDEEFF',stage:'idle',revision:1,saved:true,tested:false,busy:false,online_enabled:false,wifi_connected:false,server_online:false,ssid:'Saved WLAN',server:'http://192.168.1.20:6017',password_saved:true,key_saved:true,error:'',message:'',action_id:'',action_state:'idle',action_error:'',scanning:false,scan_error:'',scan_age_s:0,run_open:false,networks:[{ssid:'Office <img src=x onerror=alert(1)>',rssi:-40,open:false},{ssid:'Guest',rssi:-70,open:true}]};
const steps=['wifi','health','auth','passed'];
const dom=new JSDOM(html,{url:'http://192.168.4.1/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.setInterval=()=>0;w.AbortController=AbortController;w.fetch=async(path,options={})=>{
 if(unreachable&&path==='/setup')throw Error('Radio channel changed');
 if(path==='/setup'){
  if(testStep){state.stage=steps[testStep-1];state.busy=state.stage!=='passed';state.wifi_connected=testStep>1;if(testStep<4)++testStep;else{testStep=0;if(failTest){state.stage='failed';state.tested=false;state.error='Server-Zugriffsschlüssel nicht akzeptiert.';}else state.tested=true;state.busy=false;}}
  return {ok:true,status:200,json:async()=>structuredClone(state)};
 }
 if(path==='/status')return {ok:true,status:200,json:async()=>({state:'prepared',public:'0'.repeat(64),devices:[],lanes:[]})};
 const data=JSON.parse(options.body);assert.equal(options.headers['X-BierPeter-Local'],'1');posts.push({path,data});
 const id=String(++serial);state.action_id=id;state.action_state='done';state.action_error='';
 if(path==='/config'){
  if(failSave){state.action_state='error';state.action_error='Einstellungen konnten nicht dauerhaft gespeichert werden.';}
  else{state.ssid=data.ssid;state.server=data.server;state.revision++;state.tested=false;state.stage='idle';state.error='';}
 }
 if(path==='/test'){testStep=1;state.busy=true;state.tested=false;state.error='';}
 if(path==='/online'){assert.equal(state.tested,true);state.stage='switching';state.tested=false;state.busy=true;}
 return {ok:true,status:202,json:async()=>({request:id})};
 };}});
const w=dom.window,$=id=>w.document.getElementById(id),turn=()=>new Promise(r=>setImmediate(r));
async function poll(){await turn();await w.eval('poll()');await turn();}
function input(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
function submit(){ $('config').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); }
(async()=>{
 await poll();await poll();
 assert.equal($('ssid').value,'Saved WLAN');assert.equal($('server').value,'http://192.168.1.20:6017');assert.equal($('password').value,'');assert.equal($('server-key').value,'');assert.match($('key-state').textContent,/gespeichert/);assert.equal(w.document.querySelectorAll('img').length,0,'SSID must not become HTML');
 assert(!posts.some(p=>p.path==='/test'||p.path==='/online'),'Opening the portal cannot start a connection or switch modes');
 $('networks').value='Guest';$('networks').dispatchEvent(new w.Event('change'));assert.equal($('ssid').value,'Guest');assert.equal($('test').disabled,true);
 input('ssid','Updated WLAN');input('password','local-test-password');input('server-key','local-test-key-not-a-real-server-secret');submit();await poll();
 assert.equal(posts.findLast(p=>p.path==='/config').data.ssid,'Updated WLAN');assert.match($('feedback').textContent,/dauerhaft gespeichert/);assert.equal($('password').value,'');assert.equal($('server-key').value,'');assert.equal($('test').hidden,false);
 failSave=true;input('ssid','Should not persist');submit();await poll();assert.match($('feedback').textContent,/nicht dauerhaft/);assert.equal(state.ssid,'Updated WLAN');assert.equal($('ssid').value,'Should not persist');failSave=false;input('ssid','Updated WLAN');submit();await poll();
 $('test').click();await poll();assert.equal($('save').disabled,true);assert.match($('connection-state').textContent,/WLAN/);
 unreachable=true;await poll();assert.match($('feedback').textContent,/unterbrochen/);unreachable=false;await poll();await poll();await poll();assert.equal($('online').hidden,false);assert.match($('connection-state').textContent,/erfolgreich/);
 input('server','http://192.168.1.21:6017');assert.equal($('online').hidden,true,'Unsaved changes must disable old successful test');submit();await poll();assert.equal($('online').hidden,true);
 failTest=true;$('test').click();for(let i=0;i<5;++i)await poll();assert.match($('connection-state').textContent,/nicht akzeptiert/);assert.equal($('online').hidden,true);failTest=false;
 $('test').click();for(let i=0;i<5;++i)await poll();assert.equal($('online').hidden,false);
 const before=posts.filter(p=>p.path==='/online').length;$('online').click();assert.equal($('handoff').hidden,false);assert.equal(posts.filter(p=>p.path==='/online').length,before);assert.match($('handoff').textContent,/mobile Daten nicht/);assert.equal($('server-link').href,'http://192.168.1.21:6017/');
 $('cancel-online').click();assert.equal($('configuration').hidden,false);$('online').click();$('confirm-online').click();await poll();assert.equal(posts.filter(p=>p.path==='/online').length,before+1);assert.equal($('confirm-online').hidden,true);assert.match($('handoff-state').textContent,/sechs Sekunden/);
 assert(!dom.serialize().includes('local-test-password'));assert(!dom.serialize().includes('local-test-key-not-a-real-server-secret'));
 console.log('Portal 0.3.2 passed: saved prefill without secrets, real DOM/network selection, save failure, staged verification, channel-loss retry, stale-test invalidation, bad key, explicit handoff and local-network guidance.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>w.close());

'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes={duel:'1 gegen 1',relay:'Staffellauf',marathon:'BierMarathon',general:'Generalbierjunge',olympics:'BierOlympiade',training:'Training'};
const state={user:null,sessions:[],session:null,race:null,view:'home',auth:'login',device:'',busy:false,error:''};
const button=(label,action,minor=false)=>`<button type="button" class="btn ${minor?'outline':''}" data-action="${esc(action)}">${label}</button>`;
const title=(t,d='')=>`<div class="micro">BierPeter · Alpha 0.2</div><h1 class="title">${t}</h1><p class="desc">${d}</p>`;
const field=(name,label,placeholder='',type='text',max=80,value='')=>`<label class="field"><span>${label}</span><input name="${name}" type="${type}" required maxlength="${max}" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="${type==='password'?(state.auth==='register'?'new-password':'current-password'):'off'}"></label>`;
function normalizeDevice(s){const compact=String(s).replace(/[:.\- ]/g,'');return /^[a-f\d]{12}$/i.test(compact)?compact.toUpperCase():String(s);}
function context(search=location.search){
  const p=new URLSearchParams(search), raw=search.replace(/^\?/,'');
  const device=p.get('device')||(/^[a-f\d]{12}$/i.test(raw)?raw:'');
  return {join:p.get('join')||'',session:p.get('session')||'',device:device?normalizeDevice(device):''};
}
function deviceInput(value){
  value=value.trim();
  if(/^https?:\/\//i.test(value)){const url=new URL(value);value=context(url.search).device;}
  if(!value)throw new Error('Der Link enthält keine Gerätekennung.');
  const id=normalizeDevice(value);
  if(!/^[A-Za-z\d_-]{1,64}$/.test(id))throw new Error('Ungültige Gerätekennung.');
  return id;
}
function keepLobbyURL(s){
  const p=new URLSearchParams();p.set('session',s.id);
  const c=context();if(s.membership!=='accepted'&&c.join)p.set('join',c.join);
  if(state.device)p.set('device',state.device);
  history.replaceState(null,'',location.pathname+'?'+p.toString());
}
function notice(message){$('#feedback').innerHTML=`<div class="toast">${esc(message)}</div>`;setTimeout(()=>$('#feedback').replaceChildren(),5000);}
async function api(path,data){
  const options={signal:AbortSignal.timeout(10000)};
  if(data!==undefined)Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','X-BierPeter-Request':'1'},body:JSON.stringify(data)});
  const response=await fetch('/api'+path,options), value=await response.json();
  if(!response.ok){const error=new Error(value.error||'Anfrage fehlgeschlagen');error.status=response.status;throw error;}return value;
}
const isHost=()=>state.session?.host===state.user?.id;
const activeRace=()=>state.session?.races?.find(r=>r.id===state.race)||state.session?.races?.at(-1);
async function enterSession(id){
  let s=await api('/sessions/'+encodeURIComponent(id));
  if(s.membership==='accepted'&&state.device){await api('/sessions/'+s.id+'/device',{device:state.device});state.device='';s=await api('/sessions/'+s.id);}
  state.session=s;state.view='lobby';keepLobbyURL(s);render();
}
async function resume(){
  const c=context();state.device=c.device||state.device;
  state.sessions=await api('/sessions');
  let sid=c.session;
  if(c.join){const result=await api('/join',{code:c.join});sid=result.id;}
  if(sid)return enterSession(sid);
  state.view=state.device?'device-entry':'home';render();
}
function auth(){
  const c=context();
  return title(c.join?'Zur eingeladenen Gruppe.':c.device?'BierPeter übernehmen.':'Willkommen bei BierPeter.',c.join?'Nach der Anmeldung öffnet sich direkt die Lobby.':c.device?`Gerät ${esc(c.device)} bleibt für die Session vorgemerkt.`:'Die Gruppe zusammenbringen, die Runde vorbereiten, am Gerät spielen.')+
    `<div class="tabs">${button('Anmelden','login',state.auth!=='login')}${button('Konto erstellen','register',state.auth!=='register')}</div><form data-form="auth">${field('name','Benutzername','z. B. Alex','text',40)}${field('password','Passwort',state.auth==='register'?'Mindestens 12 Zeichen':'','password',128)}<button class="btn">${state.auth==='register'?'Registrieren und fortfahren':'Anmelden und fortfahren'}</button></form><p class="footnote">Ein Konto erfordert kein eigenes Gerät. Ein notwendiges Sitzungscookie hält die Anmeldung; kein Tracking.</p>`;
}
function home(){
  return title('Zusammen in eine Lobby.','Eine Session ist die Gruppe. Races sind die einzelnen Spielrunden darin.')+
    `<div class="stack">${button('Neue Session eröffnen','create')}${button('Einladung oder Geräte-Link öffnen','link',true)}</div><h2 class="section-title section-gap">Meine Sessions</h2>`+
    (state.sessions.length?state.sessions.map(s=>`<article class="panel"><div class="row"><div><h3 class="section-title">${esc(s.title)}</h3><span class="tag ${s.status==='accepted'?'':'amber'}">${s.host===state.user.id?'Host':({accepted:'Dabei',pending:'Angefragt',rejected:'Abgelehnt',removed:'Entfernt'}[s.status])}</span></div>${button('Zur Lobby','session:'+s.id,true)}</div></article>`).join(''):'<div class="panel empty">Noch keine Session. Eine Gruppe eröffnen oder eine Einladung verwenden.</div>');
}
function deviceEntry(){
  return title('Gerät erkannt.',`BierPeter <strong>${esc(state.device)}</strong> für eine Session bereitstellen.`)+
    `<div class="note">Die Kennung ist übernommen. Eine Verbindung wird erst durch einen Heartbeat des Geräts bestätigt.</div><div class="stack section-gap">${button('Neue Session mit diesem Gerät','create')}${state.sessions.filter(s=>s.status==='accepted').map(s=>button('Zu '+esc(s.title)+' hinzufügen','session:'+s.id,true)).join('')}</div>`;
}
function waiting(){
  const s=state.session;
  const labels={pending:['Die Anfrage ist beim Host.','Sobald die Freigabe erfolgt, öffnet sich diese Lobby automatisch.'],expired:['Die Anfrage ist abgelaufen.','Eine neue Beitrittsanfrage kann gestellt werden.'],rejected:['Die Anfrage wurde abgelehnt.','Der Host hat den Beitritt nicht bestätigt.'],removed:['Die Teilnahme wurde beendet.','Der Host hat die Teilnahme entfernt.']};
  const [headline,description]=labels[s.membership]||['Beitritt ausstehend.',''];
  return title(esc(s.title),'Lobby · Host: '+esc(s.host_name))+`<div class="panel empty"><div class="waiting-symbol">◷</div><h2 class="section-title">${headline}</h2><p class="section-sub">${description}</p>${s.membership==='pending'?'<span class="tag amber">Wartet auf Bestätigung</span>':context().join?button('Erneut anfragen','retry',true):''}</div><div class="panel"><h2 class="section-title">So geht es weiter</h2><p class="section-sub">Nach der Freigabe erscheinen die Mitspieler, Geräte und die Aufstellung gemeinsam hier. Gläser bereitstellen, am Startgerät anstoßen und spielen.</p></div>${button('Status jetzt prüfen','refresh',true)}`;
}
function roster(){
  const s=state.session,accepted=s.members.filter(m=>m.status==='accepted');
  return `<section class="panel" id="group"><div class="row"><h2 class="section-title">1 · Unsere Spielgruppe</h2><span class="tag">${accepted.length} dabei</span></div><p class="section-sub">Teilnehmer und BierPeter werden gemeinsam in dieser Lobby vorbereitet.</p><div class="list-roster">${accepted.map(m=>`<div class="list-row"><div class="initial">${esc(m.name[0])}</div><div class="grow"><strong>${esc(m.name)}</strong><small>${m.id===s.host?'Host':m.id===state.user.id?'Angemeldet':'Dabei'}</small></div>${isHost()&&m.id!==s.host?`<button class="tinybtn" data-action="remove:${m.id}">Entfernen</button>`:''}</div>`).join('')}</div>
    <details><summary>Spieler einladen</summary><label class="field"><span>Einladungslink</span><input id="invite-link" readonly value="${esc(location.origin+location.pathname+'?join='+encodeURIComponent(s.code))}"></label>${button('Einladungslink kopieren','copy',true)}<p class="footnote">Auch nach einer Registrierung führt dieser Link direkt in die wartende Lobby.</p></details>
    ${isHost()?s.members.filter(m=>m.status==='pending').map(m=>`<div class="request"><strong>${esc(m.name)}</strong><span class="section-sub">${m.expires<Date.now()/1000?'Anfrage abgelaufen':'möchte mitspielen'}</span><div class="row">${m.expires>Date.now()/1000?button('Annehmen','accept:'+m.id):''}${button('Ablehnen','reject:'+m.id,true)}</div></div>`).join(''):''}</section>`;
}
function raceConfig(){
  const s=state.session,r=activeRace();
  return `<section class="panel" id="race-config"><div class="row"><h2 class="section-title">2 · Die Spielrunde</h2><span class="tag blue">${s.races.length} Races</span></div>`+
    (r?`<label class="field"><span>Vorbereitete Spielrunde</span><select id="race-choice">${s.races.map(x=>`<option value="${x.id}" ${x.id===r.id?'selected':''}>${esc(x.title)} · ${modes[x.mode]}</option>`).join('')}</select></label><p class="section-sub">${r.policy==='host'?'Der Host weist die Plätze direkt an den Gerätekarten unten zu.':'Jeder Teilnehmer kann unten einen freien Platz wählen.'}</p>`:'<p class="section-sub">Spielmodus wählen, danach die Spieler unmittelbar an den Geräten aufstellen.</p>')+
    (isHost()?`<details ${!r?'open':''}><summary>${r?'Weiteres Race vorbereiten':'Race festlegen'}</summary><form data-form="race">${field('title','Name der Spielrunde','z. B. Runde 1','text',80,'Runde '+(s.races.length+1))}<label class="field"><span>Spielmodus</span><select name="mode">${Object.entries(modes).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label class="field"><span>Plätze vergeben</span><select name="policy"><option value="host">Host weist zu</option><option value="free">Freie Platzwahl</option></select></label><button class="btn">${r?'Weiteres Race anlegen':'Weiter zur Aufstellung'}</button></form></details>`:'')+'</section>';
}
function statusLabel(h){return !h?.last_seen?'Wartet auf ersten Heartbeat':h.online?'Mit Server verbunden':'Verbindung unterbrochen';}
function deviceCards(){
  const s=state.session,r=activeRace(),members=s.members.filter(m=>m.status==='accepted');
  return `<section class="panel" id="lineup"><h2 class="section-title">3 · Geräte & Aufstellung</h2><p class="section-sub">Hier erhalten die Mitspieler ihre linke oder rechte Position. Der Verbindungsstatus stammt aus tatsächlichen Gerätemeldungen.</p>`+
    s.devices.map((id,i)=>{
      const h=s.hardware.find(x=>x.id===id);
      return `<article class="sensor-device"><div class="station-head"><div><strong>${esc(id)}</strong><div class="section-sub">${r?.mode==='relay'?(i===0?'Startgerät':'Folgegerät '+i):'BierPeter'}</div></div><span class="tag ${h?.online?'':'amber'}">${statusLabel(h)}</span></div>${h?.last_seen?`<p class="section-sub">Firmware ${esc(h.firmware)} · WLAN-Kanal ${h.wifi_channel} · ${h.wifi_rssi} dBm · letzter Heartbeat ${new Date(h.last_seen*1000).toLocaleTimeString('de-DE')}</p>`:''}<div class="station-grid">${[0,1].map(side=>{
        const slot=r?.slots.find(x=>x.device===id&&x.side===side),m=members.find(x=>x.id===slot?.user),editable=r&&(isHost()||r.policy==='free'&&(!slot||slot.user===state.user.id));
        return `<div class="slot ${slot?'assigned':''}"><small>${side?'RECHTS':'LINKS'}${r?.mode==='relay'?' · TEAM '+(side?'B':'A'):''}</small><strong>${esc(m?.name||'Noch frei')}</strong>${editable?`<label><span class="sr-only">Position ${esc(id)} ${side?'rechts':'links'}</span><select data-device="${esc(id)}" data-side="${side}"><option value="">Freier Platz</option>${members.filter(p=>isHost()||p.id===state.user.id).map(p=>`<option value="${p.id}" ${slot?.user===p.id?'selected':''} ${r.slots.some(x=>x.user===p.id&&!(x.device===id&&x.side===side))?'disabled':''}>${esc(p.name)}</option>`).join('')}</select></label>`:''}</div>`;
      }).join('')}</div>${h?.peer_mac?`<p class="section-sub">ESP-NOW zu ${esc(h.peer_mac)}: ${h.peer_active?'vom Gerät als aktiv gemeldet':'noch nicht als aktiv bestätigt'}</p>`:''}</article>`;
    }).join('')+
    (!s.devices.length?'<div class="empty">Noch kein BierPeter. Geräte-Link öffnen oder Kennung hier übernehmen.</div>':'')+
    `<details ${!s.devices.length?'open':''}><summary>BierPeter zur Gruppe hinzufügen</summary><form data-form="device">${field('device','Geräte-Link oder Kennung','http://…/?84F3EB52F7F9','text',500)}<button class="btn">Gerät übernehmen</button></form></details>`+
    (!s.hardware_key_configured?'<p class="footnote">Der Server benötigt noch den Geräteschlüssel der vorhandenen Firmware. Die Anleitung im Update erklärt die lokale Übernahme.</p>':'')+
    (isHost()&&s.devices.length===2?`<details><summary>ESP-NOW-Verbindung der beiden Geräte</summary><p class="section-sub">Sendet echte Pairing-Befehle an die vorhandene Testfirmware. Die Verbindung wird erst durch die Heartbeats der Geräte bestätigt.</p>${button('Verbindung anfordern','pair',true)}${s.commands.slice(-2).map(c=>`<p class="section-sub">${esc(c.device)}: ${esc(({pending:'Befehl wartet auf Abruf',ack_ok:'Befehl bestätigt',ack_failed:'Gerät meldet Fehler'})[c.state])}${c.detail?' · '+esc(c.detail):''}</p>`).join('')}</details>`:'')+'</section>';
}
function readiness(){
  const s=state.session,r=activeRace(),used=new Set(r?.slots.map(x=>x.device)||[]);
  const checks=[['Spielrunde festgelegt',!!r],['Benötigte Spieler aufgestellt',!!r&&(r.mode==='training'?r.slots.length>=1:r.slots.some(x=>x.side===0)&&r.slots.some(x=>x.side===1))],['Aufgestellte Geräte senden Heartbeats',used.size>0&&[...used].every(id=>s.hardware.find(h=>h.id===id)?.online)]];
  return `<section class="panel" id="next"><h2 class="section-title">4 · Bereit für das Spiel?</h2>${checks.map(([label,ok])=>`<div class="list-row"><span class="tag ${ok?'':'amber'}">${ok?'✓':'○'}</span><span class="section-sub">${label}</span></div>`).join('')}<p class="section-sub">${r?.mode==='relay'?'Die Teamzeit läuft vom Anstoßen bis zum letzten Glas durch. Keine Zeitstrafen und kein Race-Timeout.':r?.mode==='training'?'Der Trainingsstart soll per App einen akustischen Countdown am Gerät auslösen.':'Gestartet und gemessen wird auf den Geräten.'}</p><div class="note">Geräteerkennung und ESP-NOW-Pairing sind angebunden. Glasbereitschaft, Race-Steuerung und Messergebnisse benötigen die spätere Spielfirmware und sind noch nicht freigeschaltet.</div></section>`;
}
function lobby(){
  const s=state.session;
  if(s.membership!=='accepted')return waiting();
  return title(esc(s.title),'Die Lobby: gemeinsam vorbereiten, direkt an den Geräten aufstellen.')+
    `<div class="lobby-progress" aria-label="Vorbereitung"><a href="#group">1 Gruppe</a><a href="#race-config">2 Race</a><a href="#lineup">3 Aufstellung</a><a href="#next">4 Bereitschaft</a></div>`+
    roster()+raceConfig()+deviceCards()+readiness();
}
function legal(privacy){return title(privacy?'Datenschutz der Alpha':'Impressum & KI-Hinweis')+`<div class="panel legal">${privacy?'<p>Diese lokale Alpha speichert Benutzernamen, gesalzene Passwort-Hashes, Login-Sitzungen sowie Sessions, Beitrittsanfragen, Geräte und Race-Aufstellungen in SQLite.</p><p>Geräte übermitteln Firmwareversion, WLAN-Kanal und Signalstärke, Laufzeit, Peer-Status und Ereignisse. Ein aktueller Heartbeat kennzeichnet die Serververbindung, nicht die Glasbereitschaft.</p><p>Ein notwendiges HttpOnly-Cookie hält die Anmeldung für serverseitig höchstens zwölf Stunden. Keine Analyse, kein localStorage und keine externen Ressourcen. Links erhalten den Einstiegskontext auch beim Neuladen. Die Anwendung protokolliert keine HTTP-Anfragen.</p><p>Verantwortlicher, Rechtsgrundlagen, Aufbewahrung, Export und Löschung sind vor öffentlichem Betrieb zu vervollständigen.</p>':'<p>Mit Unterstützung künstlicher Intelligenz erstellt.</p><p>Lokale Entwicklungsfassung. Anbieterangaben und Lizenz sind vor öffentlicher Bereitstellung zu ergänzen; die POMPUI-Anbindung ist noch nicht veröffentlicht.</p>'}</div>${button('Zurück','back',true)}`;}
function render(){
  let html;
  if(state.view==='privacy'||state.view==='imprint')html=legal(state.view==='privacy');
  else if(!state.user)html=auth();
  else if(state.view==='link-error')html=title('Der Einstieg ist noch offen.',esc(state.error))+button('Erneut versuchen','resume')+button('Zur Startseite','home',true);
  else if(state.view==='device-entry')html=deviceEntry();
  else if(state.view==='create')html=title('Eine Session eröffnen.',state.device?'Das gescannte Gerät '+esc(state.device)+' wird direkt aufgenommen.':'Die Gruppe bleibt über mehrere Spielrunden zusammen.')+`<form data-form="session">${field('title','Name der Gruppe','z. B. Freitagsrunde')}<button class="btn">Lobby eröffnen</button></form>`;
  else if(state.view==='link')html=title('Link übernehmen.','Einladung zur Gruppe oder QR-Link eines BierPeter öffnen.')+`<form data-form="link">${field('link','Einladungslink oder Gerätekennung','http://…/?join=…','text',500)}<button class="btn">Öffnen</button></form>`;
  else if(state.view==='lobby')html=lobby();
  else if(state.view==='profile')html=title('Angemeldet als '+esc(state.user.name),'Ein eigenes Gerät ist nicht erforderlich.')+button('Abmelden','logout',true);
  else html=home();
  $('#app').innerHTML=html;$('#account').textContent=state.user?state.user.name:'Anmeldung';
  $('#strip').innerHTML=state.view==='lobby'&&state.session.membership==='accepted'?`<span class="strip-label">LOBBY</span>${state.session.hardware.map(h=>`<span class="strip-device">${esc(h.id)} · ${h.online?'online':'offline'}</span>`).join('')}`:'';
  const items=[['home','⌂','Start'],...(state.session?[['back','◉','Lobby']]:[]),['profile','◯','Konto'],['privacy','ⓘ','Datenschutz']];
  $('#nav').innerHTML=items.map(([a,i,label])=>`<button type="button" data-action="${a}"><span class="nav-ico">${i}</span>${label}</button>`).join('');
}
async function refresh(){state.sessions=await api('/sessions');if(state.view==='lobby'&&state.session)return enterSession(state.session.id);render();}
async function action(a){
  if(a==='login'||a==='register'){state.auth=a;render();return;}
  if(a==='logout'){await api('/logout',{});state.user=null;state.session=null;state.view='home';render();return;}
  if(a==='resume'){await resume();return;}
  if(a==='refresh'){await refresh();return;}
  if(a==='retry'){const c=context();await api('/join',{code:c.join});await enterSession(state.session.id);return;}
  if(a==='copy'){const input=$('#invite-link');try{await navigator.clipboard.writeText(input.value);notice('Einladungslink kopiert');}catch{input.select();notice('Link markieren und kopieren');}return;}
  if(a==='pair'){await api('/sessions/'+state.session.id+'/pair',{first:state.session.devices[0],second:state.session.devices[1]});await refresh();notice('Pairing-Befehle warten auf Abruf durch die Geräte.');return;}
  if(a.startsWith('session:')){await enterSession(a.slice(8));return;}
  if(/^(accept|reject|remove):/.test(a)){const [act,user]=a.split(':');if(act==='remove'&&!confirm('Teilnehmer entfernen?'))return;await api('/sessions/'+state.session.id+'/member',{user,status:{accept:'accepted',reject:'rejected',remove:'removed'}[act]});await refresh();return;}
  if(a==='home'){state.view=state.device?'device-entry':'home';if(!state.device)history.replaceState(null,'',location.pathname);state.sessions=await api('/sessions');}
  else if(a==='back'){if(state.session){await enterSession(state.session.id);return;}state.view='home';}
  else state.view=a;
  render();
}
async function failure(error){
  if(error.status===401){state.user=null;render();notice('Erneute Anmeldung erforderlich. Der Einstieg bleibt erhalten.');}
  else notice(error.message||'Verbindung fehlgeschlagen');
}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;b.disabled=true;state.busy=true;try{await action(b.dataset.action);}catch(error){await failure(error);}finally{state.busy=false;b.disabled=false;}});
document.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-form]');if(!f)return;e.preventDefault();const b=f.querySelector('button');b.disabled=true;state.busy=true;
  try{
    const d=Object.fromEntries(new FormData(f));
    switch(f.dataset.form){
      case 'auth':state.user=await api('/'+state.auth,d);try{await resume();}catch(error){state.error=error.message;state.view='link-error';render();}break;
      case 'session':{if(state.device)d.device=state.device;const s=await api('/sessions',d);await enterSession(s.id);break;}
      case 'device':d.device=deviceInput(d.device);await api('/sessions/'+state.session.id+'/device',d);await refresh();break;
      case 'race':await api('/sessions/'+state.session.id+'/race',d);state.race=null;await refresh();$('#lineup')?.scrollIntoView({behavior:'smooth'});break;
      case 'link':{
        let c;
        if(/^https?:\/\//i.test(d.link)){const url=new URL(d.link);c=context(url.search);}else c={device:deviceInput(d.link)};
        if(!c.join&&!c.device)throw new Error('Der Link enthält weder Einladung noch Gerätekennung.');
        const p=new URLSearchParams();for(const [k,v] of Object.entries(c))if(v)p.set(k,v);history.replaceState(null,'',location.pathname+'?'+p);await resume();break;
      }
    }
  }catch(error){await failure(error);}finally{b.disabled=false;state.busy=false;}
});
document.addEventListener('change',async e=>{
  if(e.target.id==='race-choice'){state.race=e.target.value;render();return;}
  const select=e.target.closest('select[data-device]');if(!select)return;select.disabled=true;state.busy=true;
  try{await api('/slot',{race:activeRace().id,device:select.dataset.device,side:Number(select.dataset.side),user:select.value||null});await refresh();}catch(error){await failure(error);await refresh();}finally{state.busy=false;}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#imprint'){state.view='imprint';render();}});
window.addEventListener('popstate',()=>{if(state.user)resume().catch(failure);});
async function poll(){
  if(state.busy||!state.user||state.view!=='lobby'||!state.session||document.hidden)return;
  if(document.activeElement?.matches('input,select,textarea'))return;
  const drafts=[...document.querySelectorAll('form[data-form]')].map(f=>({kind:f.dataset.form,values:[...new FormData(f)]}));
  const expanded=[...document.querySelectorAll('details')].filter(d=>d.open).map(d=>d.querySelector('summary')?.textContent);
  try{
    await enterSession(state.session.id);
    for(const draft of drafts){const form=document.querySelector('form[data-form="'+draft.kind+'"]');if(form)for(const [key,value] of draft.values){if(form.elements.namedItem(key))form.elements.namedItem(key).value=value;}}
    for(const detail of document.querySelectorAll('details'))if(expanded.includes(detail.querySelector('summary')?.textContent))detail.open=true;
  }catch(error){await failure(error);}
}
setInterval(poll,3000);
(async()=>{
  state.device=context().device;
  if(location.hash==='#imprint'){state.view='imprint';render();return;}
  try{state.user=await api('/me');}catch(error){if(error.status!==401)notice('Server nicht erreichbar');render();return;}
  try{await resume();}catch(error){state.error=error.message;state.view='link-error';render();}
})();

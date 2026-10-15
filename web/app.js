'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes={duel:'1 gegen 1',relay:'Staffellauf',marathon:'BierMarathon',general:'Generalbierjunge',olympics:'BierOlympiade',training:'Training'};
const state={user:null,sessions:[],session:null,race:null,view:'home',auth:'login',device:'',busy:false,error:'',managed:[],private:null,vaultKey:null,vaultRevision:0,recovery:'',dashboardEdit:false,sharedNames:{},sharedFingerprint:'',shareCache:{},shareError:'',polling:false};
const button=(label,action,minor=false)=>`<button type="button" class="btn ${minor?'outline':''}" data-action="${esc(action)}">${label}</button>`;
const title=(t,d='')=>`<div class="micro">BierPeter · Alpha 0.2.2</div><h1 class="title">${t}</h1><p class="desc">${d}</p>`;
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
function scanControls(target){
  return `${button('Geräte-QR-Code scannen','scan:'+target,true)}<label class="field"><span>Alternativ QR-Foto auswählen</span><input type="file" accept="image/*" data-scan-image="${target}"></label><p class="footnote">Kamerabilder bleiben auf diesem Gerät. Die Live-Kamera benötigt HTTPS oder localhost.</p>`;
}
async function acceptScan(value,target){
  const device=deviceInput(value);
  if(target==='account'){
    await api('/account/devices',{device});state.managed=await api('/account/devices');
  }else{
    if(!state.session||state.session.membership!=='accepted')throw new Error('Zuerst eine Lobby öffnen.');
    await api('/sessions/'+state.session.id+'/device',{device});await refresh();
  }
  render();notice('BierPeter '+device+' übernommen.');
}
globalThis.bierPeterScanError=error=>failure(error);
function discoveredDevices(){
  const s=state.session,items=(s.discoveries||[]).filter(x=>!s.devices.includes(x.device));
  return `<div class="discovered"><h3 class="section-title">Von meinen BierPetern gefunden</h3>${items.map(x=>`<div class="list-row"><div class="grow"><strong>${esc(deviceName(x.device))}</strong><small>${esc(x.device)} · ${x.transport==='esp-now'?'ESP-NOW':'WLAN'} · über ${esc(deviceName(x.observer))} · Kanal ${x.channel}</small></div>${button('Hinzufügen','found:'+x.device,true)}</div>`).join('')||'<p class="section-sub">Aktuell keine weiteren Geräte gemeldet. Geräte einschalten oder ihren QR-Code scannen.</p>'}</div>`;
}
async function ensureIdentity(){
  if(!state.private.identity){
    const next=structuredClone(state.private);next.identity=await BierPeterSharing.createIdentity();await savePrivate(next);
  }
  await api('/account/identity',{public_key:BierPeterSharing.publicPart(state.private.identity)});
}
async function syncNames(session){
  state.sharedNames={};state.shareError='';state.fingerprints={};
  const keys=session.identity_keys||{},own=state.user.id;
  if(!state.private?.identity)return;
  const ownKey=BierPeterSharing.publicPart(state.private.identity);
  if(keys[own]&&JSON.stringify(keys[own])!==JSON.stringify(ownKey)){
    // Server JSON object key order is irrelevant; compare canonical public fields.
    if(JSON.stringify(BierPeterSharing.publicPart(keys[own]))!==JSON.stringify(ownKey))throw new Error('Der veröffentlichte Kontoschlüssel stimmt nicht überein. Keine Namensfreigabe.');
  }
  const trusted=state.private.trusted_keys||{},newKeys={};
  for(const [id,key] of Object.entries(keys)){
    if(id===own)continue;
    const encoded=JSON.stringify(BierPeterSharing.publicPart(key));
    if(trusted[id]&&trusted[id]!==encoded)throw new Error('Der Schlüssel eines Mitspielers wurde verändert. Namensfreigabe angehalten; Schlüsselabdrücke vergleichen.');
    if(!trusted[id])newKeys[id]=encoded;
  }
  if(Object.keys(newKeys).length){const next=structuredClone(state.private);next.trusted_keys={...trusted,...newKeys};await savePrivate(next);}
  const names={};
  for(const device of session.devices)if(session.device_providers[device]===own&&state.private.aliases[device])names[device]=state.private.aliases[device];
  for(const [id,jwk] of Object.entries(keys))state.fingerprints[id]=await BierPeterSharing.fingerprint(jwk);
  const cache=JSON.stringify([state.vaultRevision,session.devices,session.device_providers,keys]);
  if(state.shareCache[session.id]!==cache){
    const bundles=[];
    for(const [recipient,jwk] of Object.entries(keys))if(recipient!==own)bundles.push({recipient,envelope:await BierPeterSharing.seal(state.private.identity,jwk,session.id,own,recipient,names)});
    if(bundles.length)await api('/sessions/'+session.id+'/names',{revision:state.vaultRevision,bundles});
    state.shareCache[session.id]=cache;
  }
  for(const item of session.shared_names||[]){
    const peer=keys[item.provider];if(!peer)continue;
    try{
      const data=await BierPeterSharing.open(state.private.identity,peer,session.id,item.provider,own,item.envelope);
      if(data.v!==1||!data.names||typeof data.names!=='object'||Array.isArray(data.names))throw new Error('Ungültiges Namensformat');
      for(const [device,name] of Object.entries(data.names))if(session.device_providers[device]===item.provider&&typeof name==='string'&&name.length<=60)state.sharedNames[device]=name;
    }catch{state.shareError='Eine Namensfreigabe konnte nicht geprüft werden. Gerätekennungen bleiben verfügbar.';}
  }
}
async function publishAllNames(){
  if(!state.private)return;
  const sessions=await api('/sessions');
  for(const session of sessions.filter(s=>s.status==='accepted')){
    try{await syncNames(await api('/sessions/'+session.id));}
    catch(error){if(![403,404].includes(error.status))throw error;}
  }
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
const activeRace=()=>state.session?.races?.find(r=>r.id===state.session.active_race);
async function enterSession(id,{background=false}={}){
  const userID=state.user?.id;
  let s=await api('/sessions/'+encodeURIComponent(id));
  if(background&&(state.busy||state.view!=='lobby'||state.session?.id!==id||state.user?.id!==userID))return false;
  if(s.membership==='accepted'&&state.device){await api('/sessions/'+s.id+'/device',{device:state.device});state.device='';s=await api('/sessions/'+s.id);}
  if(s.membership==='accepted'&&state.private){try{await syncNames(s);}catch(error){state.shareError=error.message;}}
  if(background&&(state.busy||state.view!=='lobby'||state.session?.id!==id||state.user?.id!==userID))return false;
  state.session=s;state.view='lobby';
  keepLobbyURL(s);render();
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
    (state.sessions.length?state.sessions.map(s=>`<article class="panel"><div class="row"><div><h3 class="section-title">${esc(s.title)}</h3><span class="tag ${s.status==='accepted'?'':'amber'}">${s.host===state.user.id?'Host':({accepted:'Dabei',pending:'Angefragt',rejected:'Abgelehnt',removed:'Entfernt'}[s.status])}</span></div><div>${button('Zur Lobby','session:'+s.id,true)}${s.host===state.user.id?button('Session löschen','delete-session:'+s.id,true):''}</div></div></article>`).join(''):'<div class="panel empty">Noch keine Session. Eine Gruppe eröffnen oder eine Einladung verwenden.</div>');
}
function deviceEntry(){
  return title('Gerät erkannt.',`BierPeter <strong>${esc(state.device)}</strong> für eine Session bereitstellen.`)+
    `<div class="note">Die Kennung ist übernommen. Eine Verbindung wird erst durch einen Heartbeat des Geräts bestätigt.</div><div class="stack section-gap">${button('Neue Session mit diesem Gerät','create')}${state.sessions.filter(s=>s.status==='accepted').map(s=>button('Zu '+esc(s.title)+' hinzufügen','session:'+s.id,true)).join('')}${button('Geräteübernahme abbrechen','discard-device',true)}</div>`;
}
function waiting(){
  const s=state.session;
  const labels={pending:['Die Anfrage ist beim Host.','Sobald die Freigabe erfolgt, öffnet sich diese Lobby automatisch.'],expired:['Die Anfrage ist abgelaufen.','Eine neue Beitrittsanfrage kann gestellt werden.'],rejected:['Die Anfrage wurde abgelehnt.','Der Host hat den Beitritt nicht bestätigt.'],removed:['Die Teilnahme wurde beendet.','Der Host hat die Teilnahme entfernt.']};
  const [headline,description]=labels[s.membership]||['Beitritt ausstehend.',''];
  return title(esc(s.title),'Lobby · Host: '+esc(s.host_name))+`<div class="panel empty"><div class="waiting-symbol">◷</div><h2 class="section-title">${headline}</h2><p class="section-sub">${description}</p>${s.membership==='pending'?'<span class="tag amber">Wartet auf Bestätigung</span>':button('Erneut anfragen','retry',true)}</div><div class="panel"><h2 class="section-title">So geht es weiter</h2><p class="section-sub">Nach der Freigabe erscheinen die Mitspieler, Geräte und die Aufstellung gemeinsam hier. Gläser bereitstellen, am Startgerät anstoßen und spielen.</p></div>${button('Status jetzt prüfen','refresh',true)}`;
}
function inviteURL(s=state.session){return (s.public_url||location.origin)+location.pathname+'?join='+encodeURIComponent(s.code);}
function roster(){
  const s=state.session,accepted=s.members.filter(m=>m.status==='accepted');
  return `<section class="panel" id="group"><div class="row"><h2 class="section-title">1 · Unsere Spielgruppe</h2><span class="tag">${accepted.length} dabei</span></div><p class="section-sub">Teilnehmer und BierPeter werden gemeinsam in dieser Lobby vorbereitet.</p><div class="list-roster">${accepted.map(m=>`<div class="list-row"><div class="initial">${esc(m.name[0])}</div><div class="grow"><strong>${esc(m.name)}</strong><small>${m.id===s.host?'Host':m.id===state.user.id?'Angemeldet':'Dabei'}</small></div>${isHost()&&m.id!==s.host?`<button class="tinybtn" data-action="remove:${m.id}">Entfernen</button>`:''}</div>`).join('')}</div>
    <details><summary>Spieler einladen</summary><label class="field"><span>Einladungslink</span><input id="invite-link" readonly value="${esc(inviteURL(s))}"></label>${s.public_url_error?`<p class="error">${esc(s.public_url_error)}</p>`:''}${button('Einladungslink kopieren','copy',true)}<div class="invite-qr">${globalThis.BierPeterQR?BierPeterQR.svg(inviteURL(s)):''}</div><p class="footnote">Auch nach einer Registrierung führt dieser Link direkt in die wartende Lobby.</p>${!s.public_url&&['localhost','127.0.0.1','[::1]'].includes(new URL(location.origin).hostname)?'<p class="error">Diese Adresse ist nur auf diesem Rechner erreichbar. Vor dem Teilen eine LAN-Adresse einstellen.</p>':''}${isHost()?`<form data-form="public-url">${field('public_url','Erreichbare Serveradresse','http://192.168.…:6017','url',300,s.public_url)}<button class="btn outline">Einladungsadresse speichern</button></form>`:''}</details>
    ${isHost()?s.members.filter(m=>m.status==='pending').map(m=>`<div class="request"><strong>${esc(m.name)}</strong><span class="section-sub">${m.expires<Date.now()/1000?'Anfrage abgelaufen':'möchte mitspielen'}</span><div class="row">${m.expires>Date.now()/1000?button('Annehmen','accept:'+m.id):''}${button('Ablehnen','reject:'+m.id,true)}</div></div>`).join(''):''}</section>`;
}
function raceConfig(){
  const s=state.session,r=activeRace();
  return `<section class="panel" id="race-config"><div class="row"><h2 class="section-title">2 · Die Spielrunde</h2><span class="tag blue">${s.races.length} Races</span></div>`+
    (r?`<label class="field"><span>Vorbereitete Spielrunde</span><select id="race-choice" ${isHost()?'':'disabled'}>${s.races.map(x=>`<option value="${x.id}" ${x.id===r.id?'selected':''}>${esc(x.title)} · ${modes[x.mode]}</option>`).join('')}</select></label><p class="section-sub">${r.policy==='host'?'Der Host weist die Plätze direkt an den Gerätekarten unten zu.':'Jeder Teilnehmer kann unten einen freien Platz wählen.'}</p>`:'<p class="section-sub">Spielmodus wählen, danach die Spieler unmittelbar an den Geräten aufstellen.</p>')+
    (isHost()&&r?`<details><summary>Aktives Race bearbeiten</summary>${raceForm(r)}${button('Race-Entwurf löschen','delete-race',true)}</details>`:'')+
    (isHost()?`<details ${!r?'open':''}><summary>${r?'Weiteres Race vorbereiten':'Race festlegen'}</summary><form data-form="race">${field('title','Name der Spielrunde','z. B. Runde 1','text',80,'Runde '+(s.races.length+1))}<label class="field"><span>Spielmodus</span><select name="mode">${Object.entries(modes).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label class="field"><span>Plätze vergeben</span><select name="policy"><option value="host">Host weist zu</option><option value="free">Freie Platzwahl</option></select></label><button class="btn">${r?'Weiteres Race anlegen':'Weiter zur Aufstellung'}</button></form></details>`:'')+'</section>';
}
function statusLabel(h){return h?.online?'Online':'Offline';}
function deviceName(id){return state.view==='lobby'?(state.sharedNames[id]||state.private?.aliases?.[id]||id):(state.private?.aliases?.[id]||id);}
function roundDevices(){const used=new Set(activeRace()?.slots.map(x=>x.device)||[]);return state.session.devices.filter(id=>used.has(id));}
function pairingStatus(id){const s=state.session,h=s.hardware.find(x=>x.id===id),cmd=s.commands.filter(c=>c.device===id).at(-1);if(h?.peer_active)return 'ESP-NOW aktiv zu '+h.peer_mac;if(cmd?.state==='pending')return 'ESP-NOW-Pairing angefragt';if(cmd?.state==='ack_failed')return 'ESP-NOW-Pairing fehlgeschlagen';if(cmd?.state==='ack_ok')return 'ESP-NOW-Pairing bestätigt, Funkverbindung noch nicht aktiv';return 'Kein aktives ESP-NOW-Pairing';}
function deviceCards(){
  const s=state.session,r=activeRace(),members=s.members.filter(m=>m.status==='accepted');
  return `<section class="panel" id="lineup"><h2 class="section-title">3 · Geräte & Aufstellung</h2><p class="section-sub">Hier erhalten die Mitspieler ihre linke oder rechte Position. Der Verbindungsstatus stammt aus tatsächlichen Gerätemeldungen.</p>`+
    s.devices.map((id,i)=>{
      const h=s.hardware.find(x=>x.id===id);
      return `<article class="sensor-device"><div class="station-head"><div><strong>${esc(deviceName(id))}</strong>${deviceName(id)!==id?`<div class="section-sub">${esc(id)}</div>`:''}<div class="section-sub">${r?.mode==='relay'?(roundDevices().includes(id)?(roundDevices()[0]===id?'Startgerät':'Folgegerät '+roundDevices().indexOf(id)):'Nicht aufgestellt'):'BierPeter'}</div></div><span class="tag ${h?.online?'':'amber'}">${statusLabel(h)}</span></div><p class="section-sub">Server: ${h?.online?'Online':'Offline'} · ${esc(pairingStatus(id))}</p>${isHost()?`<div class="device-actions"><button class="tinybtn" data-action="device-up:${id}" ${i===0?'disabled':''}>↑ Nach vorne</button><button class="tinybtn" data-action="device-down:${id}" ${i===s.devices.length-1?'disabled':''}>↓ Nach hinten</button></div>`:''}${isHost()||s.device_providers?.[id]===state.user.id?button('Aus Session entfernen','device-remove:'+id,true):''}${button('In meinem Konto merken','remember:'+id,true)}${h?.last_seen?`<p class="section-sub">Firmware ${esc(h.firmware)} · WLAN-Kanal ${h.wifi_channel} · ${h.wifi_rssi} dBm · letzter Heartbeat ${new Date(h.last_seen*1000).toLocaleTimeString('de-DE')}</p>`:''}<div class="station-grid">${[0,1].map(side=>{
        const slot=r?.slots.find(x=>x.device===id&&x.side===side),m=members.find(x=>x.id===slot?.user),editable=r&&(isHost()||r.policy==='free'&&(!slot||slot.user===state.user.id));
        return `<div class="slot ${slot?'assigned':''}"><small>${side?'RECHTS':'LINKS'}${r?.mode==='relay'?' · TEAM '+(side?'B':'A'):''}</small><strong>${esc(m?.name||'Noch frei')}</strong>${editable?`<label><span class="sr-only">Position ${esc(id)} ${side?'rechts':'links'}</span><select data-device="${esc(id)}" data-race="${r.id}" data-side="${side}"><option value="">Freier Platz</option>${members.filter(p=>isHost()||p.id===state.user.id).map(p=>`<option value="${p.id}" ${slot?.user===p.id?'selected':''} ${r.slots.some(x=>x.user===p.id&&!(x.device===id&&x.side===side))?'disabled':''}>${esc(p.name)}</option>`).join('')}</select></label>`:''}</div>`;
      }).join('')}</div>${h?.peer_mac?`<p class="section-sub">ESP-NOW zu ${esc(h.peer_mac)}: ${h.peer_active?'vom Gerät als aktiv gemeldet':'noch nicht als aktiv bestätigt'}</p>`:''}</article>`;
    }).join('')+
    (!s.devices.length?'<div class="empty">Noch kein BierPeter. Geräte-Link öffnen oder Kennung hier übernehmen.</div>':'')+
    discoveredDevices()+`<details ${!s.devices.length?'open':''}><summary>BierPeter zur Gruppe hinzufügen</summary>${scanControls('lobby')}<form data-form="device">${field('device','Geräte-Link oder Kennung','http://…/?84F3EB52F7F9','text',500)}<button class="btn">Gerät übernehmen</button></form></details>`+
    (!s.hardware_key_configured?'<p class="footnote">Der Server benötigt noch den Geräteschlüssel der vorhandenen Firmware. Die Anleitung im Update erklärt die lokale Übernahme.</p>':'')+
    (isHost()&&s.devices.length===2?`<details><summary>ESP-NOW-Verbindung der beiden Geräte</summary><p class="section-sub">Sendet echte Pairing-Befehle an die vorhandene Testfirmware. Die Verbindung wird erst durch die Heartbeats der Geräte bestätigt.</p>${button('Verbindung anfordern','pair',true)}${s.commands.slice(-2).map(c=>`<p class="section-sub">${esc(c.device)}: ${esc(({pending:'Befehl wartet auf Abruf',ack_ok:'Befehl bestätigt',ack_failed:'Gerät meldet Fehler'})[c.state])}${c.detail?' · '+esc(c.detail):''}</p>`).join('')}</details>`:'')+'</section>';
}
function readiness(){
  const s=state.session,r=activeRace(),used=new Set(r?.slots.map(x=>x.device)||[]);
  const checks=[['Spielrunde festgelegt',!!r],['Benötigte Spieler aufgestellt',!!r&&r.lineup_issues?.length===0],['Aufgestellte Geräte senden Heartbeats',used.size>0&&[...used].every(id=>s.hardware.find(h=>h.id===id)?.online)]];
  return `<section class="panel" id="next"><h2 class="section-title">4 · Bereit für das Spiel?</h2>${checks.map(([label,ok])=>`<div class="list-row"><span class="tag ${ok?'':'amber'}">${ok?'✓':'○'}</span><span class="section-sub">${label}</span></div>`).join('')}${r?.lineup_issues?.map(x=>`<p class="section-sub">${esc(x)}</p>`).join('')||''}<p class="section-sub">${r?.mode==='relay'?'Die Teamzeit läuft vom Anstoßen bis zum letzten Glas durch. Keine Zeitstrafen und kein Race-Timeout.':r?.mode==='training'?'Der Trainingsstart soll per App einen akustischen Countdown am Gerät auslösen.':'Gestartet und gemessen wird auf den Geräten.'}</p><div class="note">Geräteerkennung und ESP-NOW-Pairing sind angebunden. Glasbereitschaft, Race-Steuerung und Messergebnisse benötigen die spätere Spielfirmware und sind noch nicht freigeschaltet.</div></section>`;
}
function lobby(){
  const s=state.session;
  if(s.membership!=='accepted')return waiting();
  return title(esc(s.title),'Die Lobby: gemeinsam vorbereiten, direkt an den Geräten aufstellen.')+
    `<div class="lobby-progress" aria-label="Vorbereitung"><a href="#group">1 Gruppe</a><a href="#race-config">2 Race</a><a href="#lineup">3 Aufstellung</a><a href="#next">4 Bereitschaft</a></div>`+
    roster()+raceConfig()+deviceCards()+readiness()+`<section class="panel"><h2 class="section-title">Gerätenamen in der Gruppe</h2><p class="section-sub">${state.private?'Namen werden gezielt verschlüsselt an zugelassene Teilnehmer freigegeben. Neue Teilnehmer sehen sie, sobald der mitbringende Spieler die Lobby mit entsperrten privaten Daten geöffnet hat.':'Unter Konto die privaten Daten entsperren, um eigene Namen zu teilen und Namen anderer Teilnehmer zu lesen.'}</p>${state.shareError?`<p class="error">${esc(state.shareError)}</p>`:''}<details><summary>Schlüssel vergleichen</summary><p class="footnote">Schlüsselabdrücke über einen unabhängigen Weg vergleichen. Ohne Vergleich ist die Schlüsselzuordnung vom Server abhängig.</p>${Object.entries(s.identity_keys||{}).map(([id,key])=>`<div class="key-fingerprint" data-identity="${esc(id)}">${esc(s.members.find(m=>m.id===id)?.name||id)}: ${esc(state.fingerprints?.[id]||'Private Daten zum Prüfen entsperren')}</div>`).join('')}</details></section>${isHost()?button('Session löschen','delete-session:'+s.id,true):''}`;
}
const WIDGETS={summary:'Überblick',history:'Ergebnistabelle',trend:'Zeitverlauf',modes:'Spielmodi'};
function defaultPrivate(){return {v:1,aliases:{},widgets:Object.keys(WIDGETS).map(id=>({id,visible:true})),results:[]};}
function validatePrivate(d){
  if(!d||d.v!==1||!d.aliases||typeof d.aliases!=='object'||Array.isArray(d.aliases)||!Array.isArray(d.widgets)||!Array.isArray(d.results))throw new Error('Unbekanntes privates Datenformat.');
  if(d.widgets.length!==4||new Set(d.widgets.map(w=>w.id)).size!==4||d.widgets.some(w=>!Object.hasOwn(WIDGETS,w.id)||typeof w.visible!=='boolean'))throw new Error('Ungültige Dashboard-Anordnung.');
  if(Object.values(d.aliases).some(v=>typeof v!=='string'||v.length>60))throw new Error('Ungültige Gerätenamen.');
  if(d.results.some(r=>!r||typeof r.time_ms!=='number'||!Number.isFinite(r.time_ms)||r.time_ms<0||typeof r.mode!=='string'||typeof r.date!=='string'))throw new Error('Ungültige private Ergebnisdaten.');
}
function lockVault(){state.sharedNames={};state.shareCache={};state.fingerprints={};state.shareError='';state.private=null;state.vaultKey=null;state.recovery='';state.vaultRevision=0;state.dashboardEdit=false;}
async function savePrivate(next){
  if(!state.vaultKey)throw new Error('Private Daten zuerst entsperren.');validatePrivate(next);
  const envelope=await BierPeterVault.seal(state.vaultKey,state.user.id,next);
  const result=await api('/account/vault',{revision:state.vaultRevision,envelope});
  state.vaultRevision=result.revision;state.private=next;
}
async function unlockPrivate(recovery){
  const stored=await api('/account/vault');if(!stored.envelope)throw new Error('Noch keine privaten Daten angelegt.');
  const key=await BierPeterVault.importRecovery(recovery.trim()),data=await BierPeterVault.open(key,state.user.id,stored.envelope);
  validatePrivate(data);state.vaultKey=key;state.private=data;state.vaultRevision=stored.revision;await ensureIdentity();render();
}
function downloadRecovery(){
  if(!state.recovery)throw new Error('Zuerst einen Wiederherstellungsschlüssel erzeugen.');
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'bierpeter-private-key',version:1,account:state.user.id,key:state.recovery},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='BierPeter-Wiederherstellungsschluessel.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notice('Schlüsseldatei privat aufbewahren. Der Server kann sie nicht wiederherstellen.');
}
function raceForm(r){
  return `<form data-form="race-edit" data-race="${r.id}"><input type="hidden" name="race" value="${r.id}">${field('title','Name der Spielrunde','','text',80,r.title)}<label class="field"><span>Spielmodus</span><select name="mode">${Object.entries(modes).map(([id,name])=>`<option value="${id}" ${id===r.mode?'selected':''}>${name}</option>`).join('')}</select></label><label class="field"><span>Platzwahl</span><select name="policy"><option value="host" ${r.policy==='host'?'selected':''}>Host weist zu</option><option value="free" ${r.policy==='free'?'selected':''}>Freie Platzwahl</option></select></label><p class="footnote">Ein Moduswechsel setzt die Aufstellung dieses Race zurück.</p><button class="btn">Änderungen speichern</button></form>`;
}
function widgetContent(id){
  const data=state.private.results;
  if(id==='summary'){const best=data.length?Math.min(...data.map(r=>r.time_ms))/1000:null;return `<div class="split"><div class="metric"><div class="name">Gewertete Races</div><div class="value">${data.length}</div></div><div class="metric"><div class="name">Bestzeit</div><div class="value">${best===null?'—':best.toFixed(2)+' s'}</div></div></div>`;}
  if(!data.length)return '<p class="section-sub">Noch keine gewerteten Ergebnisse. Die Mess- und Ergebnisanbindung folgt; es werden keine Beispieldaten eingetragen.</p>';
  if(id==='history')return `<div class="table-scroll"><table><thead><tr><th>Datum</th><th>Modus</th><th>Zeit</th></tr></thead><tbody>${data.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(modes[r.mode]||r.mode)}</td><td>${(r.time_ms/1000).toFixed(2)} s</td></tr>`).join('')}</tbody></table></div>`;
  if(id==='trend'){const values=data.slice(-30),max=Math.max(1,...values.map(r=>r.time_ms)),points=values.map((r,i)=>`${10+i*280/Math.max(1,values.length-1)},${90-r.time_ms/max*75}`).join(' ');return `<svg viewBox="0 0 300 110" role="img" aria-label="Zeitverlauf der letzten ${values.length} Ergebnisse"><line x1="10" y1="95" x2="290" y2="95" stroke="currentColor"/><polyline points="${points}" stroke="currentColor" fill="none" stroke-width="2"/></svg><p class="section-sub">Zeitverlauf, links ältere und rechts neuere Ergebnisse. Zeitbereich 0 bis ${(max/1000).toFixed(2)} Sekunden. Einzelwerte stehen in der Ergebnistabelle.</p>`;}
  const counts={};for(const r of data)counts[r.mode]=(counts[r.mode]||0)+1;
  return Object.entries(counts).map(([mode,count])=>`<div class="list-row"><span class="grow">${esc(modes[mode]||mode)}</span><meter min="0" max="${data.length}" value="${count}">${count}</meter><strong>${count}</strong></div>`).join('');
}
function dashboard(){
  return `<section class="panel"><div class="row"><h2 class="section-title">Mein Statistik-Dashboard</h2>${button(state.dashboardEdit?'Bearbeitung beenden':'Dashboard bearbeiten','dashboard-edit',true)}</div><p class="section-sub">Anordnung und private Daten werden vor der Übertragung verschlüsselt.</p></section>`+
    state.private.widgets.map((w,i)=>`${state.dashboardEdit?`<div class="widget-editor"><label><input type="checkbox" data-widget="${w.id}" ${w.visible?'checked':''}> ${WIDGETS[w.id]}</label><div><button class="tinybtn" data-action="widget-up:${w.id}" ${i===0?'disabled':''}>↑</button><button class="tinybtn" data-action="widget-down:${w.id}" ${i===state.private.widgets.length-1?'disabled':''}>↓</button></div></div>`:''}${w.visible?`<section class="panel dashboard-widget"><h3 class="section-title">${WIDGETS[w.id]}</h3>${widgetContent(w.id)}</section>`:''}`).join('');
}
function profile(){
  const unlocked=!!state.private,available=BierPeterVault.available();
  return title('Mein Konto',esc(state.user.name))+
    `<section class="panel" id="private-data"><h2 class="section-title">Private Daten</h2>${unlocked?`<span class="tag">Im Browser entsperrt</span><p class="section-sub">Private Gerätenamen und Dashboard-Einstellungen liegen verschlüsselt auf dem Server. Der Schlüssel bleibt in diesem Browser bis zum Sperren oder Neuladen.</p>${button('Private Daten sperren','vault-lock',true)}`:!available?'<p class="section-sub">Zum Entsperren privater Daten wird HTTPS oder der Zugriff über localhost benötigt.</p>':`<label class="field"><span>Wiederherstellungsschlüssel aus Datei laden</span><input type="file" id="vault-key-file" accept="application/json,.json"></label><form data-form="vault-unlock"><label class="field"><span>Wiederherstellungsschlüssel (64 Hex-Zeichen aus der Schlüsseldatei)</span><input name="recovery" type="password" required autocomplete="off" maxlength="64"></label><button class="btn">Private Daten entsperren</button></form><details><summary>Privaten Bereich erstmals einrichten</summary><p class="section-sub">Ein eigener Schlüssel schützt die Daten. Ohne Schlüsseldatei sind sie nach einem Browserwechsel oder Neuladen nicht wiederherstellbar. Das Anmeldepasswort ersetzt den Schlüssel nicht.</p>${state.recovery?button('1 · Schlüsseldatei herunterladen','vault-download')+button('2 · Schlüssel gesichert, Bereich anlegen','vault-confirm',true):button('Wiederherstellungsschlüssel erzeugen','vault-create',true)}</details>`}</section>`+
    `<section class="panel"><h2 class="section-title">Meine BierPeter</h2><p class="section-sub">Geräte merken, benennen und entfernen. Für Namen zuerst den privaten Bereich oben entsperren. Namen bereitgestellter Geräte werden dann verschlüsselt mit zugelassenen Mitspielern geteilt.</p>${state.managed.map(d=>`<article class="sensor-device"><div class="row"><div><strong>${esc(deviceName(d.id))}</strong><p class="section-sub">${esc(d.id)} · ${statusLabel(d)}</p></div><button class="tinybtn" data-action="managed-delete:${d.id}">Aus Konto entfernen</button></div>${unlocked?`<form data-form="managed-name"><input type="hidden" name="device" value="${esc(d.id)}">${field('name','Name des BierPeters','z. B. Garten-BierPeter','text',60,state.private.aliases[d.id]||'')}<button class="btn outline">Namen speichern</button></form>`:button('Zum Umbenennen entsperren','unlock-for-name',true)}</article>`).join('')||'<p class="section-sub">Noch keine Geräte gemerkt.</p>'}<details><summary>Gerät zur eigenen Verwaltung hinzufügen</summary>${scanControls('account')}<form data-form="managed-add">${field('device','Gerätekennung oder Link','','text',500)}<button class="btn">Gerät merken</button></form></details></section>`+
    (unlocked?dashboard():'<section class="panel"><h2 class="section-title">Statistik-Dashboard</h2><p class="section-sub">Private Daten entsperren, um Widgets anzuordnen und Ergebnisse anzuzeigen.</p></section>')+
    `<section class="panel"><h2 class="section-title">Sicherheitsstand der Alpha</h2><p class="section-sub">Der private Speicher ist ein Verschlüsselungsprototyp. Die laufende Lobby verwendet weiterhin den bisherigen Server. Getrennte Account-/Race-Dienste werden separat erprobt; eine vollständige Ende-zu-Ende-Verschlüsselung der Lobby ist noch nicht freigegeben.</p></section>${button('Abmelden','logout',true)}`;
}

function legal(privacy){return title(privacy?'Datenschutz der Alpha':'Impressum & KI-Hinweis')+`<div class="panel legal">${privacy?'<p>Diese lokale Alpha speichert Benutzernamen, gesalzene Passwort-Hashes, Login-Sitzungen sowie Sessions, Beitrittsanfragen, Geräte und Race-Aufstellungen in SQLite.</p><p>Geräte übermitteln Firmwareversion, WLAN-Kanal und Signalstärke, Laufzeit, Peer-Status und Ereignisse. Ein aktueller Heartbeat kennzeichnet die Serververbindung, nicht die Glasbereitschaft.</p><p>Private Gerätenamen und Dashboard-Einstellungen können clientseitig verschlüsselt gespeichert werden. Der Wiederherstellungsschlüssel wird nicht an den Server übertragen. Geteilte Gerätenamen werden für jeden zugelassenen Empfänger separat verschlüsselt. Öffentliche Schlüssel und Zuordnungsmetadaten liegen auf dem Server. Benutzernamen und übrige Lobby-Daten liegen in dieser Alpha weiterhin im bisherigen Klartextmodell vor.</p><p>Ein notwendiges HttpOnly-Cookie hält die Anmeldung für serverseitig höchstens zwölf Stunden. Keine Analyse, kein localStorage und keine externen Ressourcen. Links erhalten den Einstiegskontext auch beim Neuladen. Die Anwendung protokolliert keine HTTP-Anfragen.</p><p>Verantwortlicher, Rechtsgrundlagen, Aufbewahrung, Export und Löschung sind vor öffentlichem Betrieb zu vervollständigen.</p>':'<p>Mit Unterstützung künstlicher Intelligenz erstellt.</p><p>Lokale Entwicklungsfassung. Anbieterangaben sind vor öffentlicher Bereitstellung zu ergänzen. Eigener Programmcode: AGPL-3.0-only. QR-Bibliotheken: MIT. <a href="/source.tar.gz">Quellcode dieser Version herunterladen</a>; die POMPUI-Anbindung ist noch nicht veröffentlicht.</p>'}</div>${button('Zurück','back',true)}`;}
function render(){
  let html;
  if(state.view==='privacy'||state.view==='imprint')html=legal(state.view==='privacy');
  else if(!state.user)html=auth();
  else if(state.view==='link-error')html=title('Der Einstieg ist noch offen.',esc(state.error))+button('Erneut versuchen','resume')+button('Zur Startseite','home',true);
  else if(state.view==='device-entry')html=deviceEntry();
  else if(state.view==='create')html=title('Eine Session eröffnen.',state.device?'Das gescannte Gerät '+esc(state.device)+' wird direkt aufgenommen.':'Die Gruppe bleibt über mehrere Spielrunden zusammen.')+`<form data-form="session">${field('title','Name der Gruppe','z. B. Freitagsrunde')}<button class="btn">Lobby eröffnen</button></form>`;
  else if(state.view==='link')html=title('Link übernehmen.','Einladung zur Gruppe oder QR-Link eines BierPeter öffnen.')+`<form data-form="link">${field('link','Einladungslink oder Gerätekennung','http://…/?join=…','text',500)}<button class="btn">Öffnen</button></form>`;
  else if(state.view==='lobby')html=lobby();
  else if(state.view==='profile')html=profile();
  else html=home();
  $('#app').innerHTML=html;$('#account').textContent=state.user?state.user.name:'Anmeldung';
  $('#strip').innerHTML=state.view==='lobby'&&state.session.membership==='accepted'?`<span class="strip-label">LOBBY</span>${state.session.hardware.map(h=>`<span class="strip-device">${esc(h.id)} · ${h.online?'online':'offline'}</span>`).join('')}`:'';
  const items=[['home','⌂','Start'],...(state.session?[['back','◉','Lobby']]:[]),['profile','◯','Konto'],['privacy','ⓘ','Datenschutz']];
  $('#nav').innerHTML=items.map(([a,i,label])=>`<button type="button" data-action="${a}"><span class="nav-ico">${i}</span>${label}</button>`).join('');
}
async function refresh(){state.sessions=await api('/sessions');if(state.view==='lobby'&&state.session)return enterSession(state.session.id);render();}
async function action(a){
  if(a==='login'||a==='register'){state.auth=a;render();return;}
  if(a==='logout'){globalThis.BierPeterQR?.close();await api('/logout',{});lockVault();state.user=null;state.session=null;state.view='home';render();return;}
  if(a==='resume'){await resume();return;}
  if(a==='refresh'){await refresh();return;}
  if(a==='retry'){await api('/sessions/'+state.session.id+'/rejoin',{});await enterSession(state.session.id);return;}
  if(a==='discard-device'){state.device='';const p=new URLSearchParams(location.search);p.delete('device');history.replaceState(null,'',location.pathname+(p.get('session')?'?session='+p.get('session'):''));state.view='home';state.sessions=await api('/sessions');render();return;}
  if(a==='unlock-for-name'){$('#private-data')?.scrollIntoView({behavior:'smooth'});notice('Schlüsseldatei laden oder den privaten Bereich erstmals einrichten.');return;}
  if(a.startsWith('scan:')){await BierPeterQR.start(value=>acceptScan(value,a.slice(5)));return;}
  if(a.startsWith('found:')){await api('/sessions/'+state.session.id+'/device',{device:a.slice(6)});await refresh();return;}
  if(a.startsWith('delete-session:')){const sid=a.slice(15);if(!confirm('Session mit allen Rundenentwürfen und Aufstellungen endgültig löschen? Konten und persönliche Gerätelisten bleiben erhalten.'))return;await api('/sessions/'+sid+'/delete',{});if(state.session?.id===sid){state.session=null;state.sharedNames={};state.shareCache={};}history.replaceState(null,'',location.pathname);state.view='home';state.sessions=await api('/sessions');render();return;}
  if(a==='copy'){const input=$('#invite-link');try{await navigator.clipboard.writeText(input.value);notice('Einladungslink kopiert');}catch{input.select();notice('Link markieren und kopieren');}return;}
  if(a==='pair'){await api('/sessions/'+state.session.id+'/pair',{first:state.session.devices[0],second:state.session.devices[1]});await refresh();notice('Pairing-Befehle warten auf Abruf durch die Geräte.');return;}
  if(a.startsWith('session:')){await enterSession(a.slice(8));return;}
  if(/^(accept|reject|remove):/.test(a)){const [act,user]=a.split(':');if(act==='remove'&&!confirm('Teilnehmer entfernen?'))return;await api('/sessions/'+state.session.id+'/member',{user,status:{accept:'accepted',reject:'rejected',remove:'removed'}[act]});await refresh();return;}
  if(a==='profile'){state.managed=await api('/account/devices');state.view='profile';render();return;}
  if(a==='vault-lock'){lockVault();render();return;}
  if(a==='vault-create'){state.recovery=BierPeterVault.createRecovery();render();return;}
  if(a==='vault-download'){downloadRecovery();return;}
  if(a==='vault-confirm'){if(!state.recovery)throw new Error('Zuerst Wiederherstellungsschlüssel erzeugen.');const stored=await api('/account/vault');if(stored.envelope)throw new Error('Private Daten existieren bereits. Vorhandenen Schlüssel verwenden.');state.vaultKey=await BierPeterVault.importRecovery(state.recovery);state.vaultRevision=stored.revision;try{await savePrivate(defaultPrivate());await ensureIdentity();state.recovery='';}catch(error){lockVault();throw error;}render();return;}
  if(a==='dashboard-edit'){if(!state.private)throw new Error('Zuerst private Daten entsperren.');state.dashboardEdit=!state.dashboardEdit;render();return;}
  if(a.startsWith('widget-up:')||a.startsWith('widget-down:')){const [dir,id]=a.split(':');const next=structuredClone(state.private),i=next.widgets.findIndex(w=>w.id===id),j=i+(dir==='widget-up'?-1:1);if(j>=0&&j<next.widgets.length){[next.widgets[i],next.widgets[j]]=[next.widgets[j],next.widgets[i]];await savePrivate(next);}render();return;}
  if(a.startsWith('remember:')){await api('/account/devices',{device:a.slice(9)});notice('Gerät im Konto gemerkt. Keine Eigentumsübertragung.');return;}
  if(a.startsWith('managed-delete:')){const id=a.slice(15);if(!state.private&&(await api('/account/vault')).envelope)throw new Error('Zum Entfernen privater Geräteinformationen zuerst entsperren.');if(!confirm('Gerät nur aus der eigenen Verwaltung entfernen? Session-Bereitstellungen bleiben erhalten.'))return;let next=null,vault;if(state.private){next=structuredClone(state.private);delete next.aliases[id];vault={revision:state.vaultRevision,envelope:await BierPeterVault.seal(state.vaultKey,state.user.id,next)};}const result=await api('/account/devices',{device:id,action:'delete',...(vault?{vault}:{})});if(next){state.private=next;state.vaultRevision=result.revision;await publishAllNames();}state.managed=await api('/account/devices');render();return;}
  if(a==='delete-race'){if(!confirm('Diesen Vorbereitungsentwurf und seine Aufstellung löschen?'))return;await api('/sessions/'+state.session.id+'/race-delete',{race:activeRace().id});await refresh();return;}
  if(a.startsWith('device-remove:')){const id=a.slice(14);if(!confirm('Gerät und seine Aufstellungen aus dieser Session entfernen? Die Kontoverwaltung bleibt erhalten.'))return;await api('/sessions/'+state.session.id+'/device-remove',{device:id});await refresh();return;}
  if(a.startsWith('device-up:')||a.startsWith('device-down:')){const [dir,id]=a.split(':'),order=[...state.session.devices],i=order.indexOf(id),j=i+(dir==='device-up'?-1:1);if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];await api('/sessions/'+state.session.id+'/device-order',{devices:order});await refresh();return;}
  if(a==='home'){state.view=state.device?'device-entry':'home';if(!state.device)history.replaceState(null,'',location.pathname);state.sessions=await api('/sessions');}
  else if(a==='back'){if(state.session){await enterSession(state.session.id);return;}state.view='home';}
  else state.view=a;
  render();
}
async function failure(error){
  if(error.status===401){lockVault();state.user=null;render();notice('Erneute Anmeldung erforderlich. Der Einstieg bleibt erhalten.');}
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
      case 'vault-unlock':await unlockPrivate(d.recovery);break;
      case 'managed-add':await api('/account/devices',{device:deviceInput(d.device)});state.managed=await api('/account/devices');render();break;
      case 'managed-name':{if(!state.managed.some(x=>x.id===d.device))throw new Error('Gerät zuerst im Konto merken.');if(!state.private)throw new Error('Zuerst private Daten entsperren.');const next=structuredClone(state.private);next.aliases[d.device]=d.name.trim();await savePrivate(next);await publishAllNames();render();break;}
      case 'public-url':await api('/sessions/'+state.session.id+'/settings',d);await refresh();break;
      case 'race-edit':{const id=d.race||f.dataset.race||activeRace().id;const race=state.session.races.find(r=>r.id===id);if(!race)throw new Error('Der bearbeitete Entwurf wurde gelöscht.');if(d.mode!==race.mode&&race.slots.length&&!confirm('Moduswechsel setzt diese Aufstellung zurück. Fortfahren?'))return;await api('/sessions/'+state.session.id+'/race-edit',{...d,race:id});await refresh();break;}
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
  if(e.target.dataset?.scanImage){try{await acceptScan(await BierPeterQR.image(e.target.files?.[0]),e.target.dataset.scanImage);}catch(error){await failure(error);}finally{e.target.value='';}return;}
  if(e.target.id==='vault-key-file'){try{const file=e.target.files?.[0];if(!file)return;const recovery=JSON.parse(await file.text());if(recovery.format!=='bierpeter-private-key'||recovery.account!==state.user.id)throw new Error('Schlüsseldatei gehört nicht zu diesem Konto.');await unlockPrivate(recovery.key);}catch(error){await failure(error);}return;}
  if(e.target.id==='race-choice'){state.busy=true;try{await api('/sessions/'+state.session.id+'/active-race',{race:e.target.value});await refresh();}catch(error){await failure(error);}finally{state.busy=false;}return;}
  if(e.target.dataset?.widget){try{const next=structuredClone(state.private);next.widgets.find(w=>w.id===e.target.dataset.widget).visible=e.target.checked;await savePrivate(next);render();}catch(error){await failure(error);}return;}
  const select=e.target.closest('select[data-device]');if(!select)return;select.disabled=true;state.busy=true;
  try{await api('/slot',{race:select.dataset.race||activeRace().id,device:select.dataset.device,side:Number(select.dataset.side),user:select.value||null});await refresh();}catch(error){await failure(error);await refresh();}finally{state.busy=false;}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#imprint'){state.view='imprint';render();}});
window.addEventListener('popstate',()=>{if(state.user)resume().catch(failure);});
async function poll(){
  if(state.busy||state.polling||!state.user||state.view!=='lobby'||!state.session||document.hidden)return;
  if(document.activeElement?.matches('input,select,textarea'))return;
  const drafts=[...document.querySelectorAll('form[data-form]')].map(f=>({kind:f.dataset.form,race:f.dataset.race||'',values:[...new FormData(f)]}));
  const expanded=[...document.querySelectorAll('details')].filter(d=>d.open).map(d=>d.querySelector('summary')?.textContent);
  state.polling=true;const sessionID=state.session.id;
  try{
    if(await enterSession(sessionID,{background:true})===false)return;
    for(const draft of drafts){const form=document.querySelector('form[data-form="'+draft.kind+'"]');if(form&&(form.dataset?.race||'')===draft.race)for(const [key,value] of draft.values){if(form.elements.namedItem(key))form.elements.namedItem(key).value=value;}}
    for(const detail of document.querySelectorAll('details'))if(expanded.includes(detail.querySelector('summary')?.textContent))detail.open=true;
  }catch(error){if(state.session?.id!==sessionID||state.view!=='lobby')return;if(error.status===404){state.error='Diese Session wurde gelöscht oder ist nicht mehr verfügbar.';state.session=null;state.view='link-error';render();}else await failure(error);}finally{state.polling=false;}
}
setInterval(poll,3000);
(async()=>{
  state.device=context().device;
  if(location.hash==='#imprint'){state.view='imprint';render();return;}
  try{state.user=await api('/me');}catch(error){if(error.status!==401)notice('Server nicht erreichbar');render();return;}
  try{await resume();}catch(error){state.error=error.message;state.view='link-error';render();}
})();

'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes = {duel:'1 gegen 1',relay:'Staffellauf',marathon:'BierMarathon',general:'Generalbierjunge',olympics:'BierOlympiade',training:'Training'};
const state = {user:null, sessions:[], session:null, race:null, tab:'overview', view:'home', auth:'login'};
const initialInvite = new URLSearchParams(location.search).get('join');
const button = (label, action, minor=false) => `<button type="button" class="btn ${minor?'outline':''}" data-action="${esc(action)}">${label}</button>`;
const title = (t,d='') => `<div class="micro">BierPeter · Alpha</div><h1 class="title">${t}</h1><p class="desc">${d}</p>`;
const input = (name,label,placeholder='',type='text',max=80) => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" required maxlength="${max}" placeholder="${esc(placeholder)}" autocomplete="${type==='password'?(state.auth==='register'?'new-password':'current-password'):'off'}"></label>`;
function notice(msg) { $('#feedback').innerHTML=`<div class="toast">${esc(msg)}</div>`; setTimeout(()=>$('#feedback').replaceChildren(),4500); }
async function api(path,data) {
  const options = data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-BierPeter-Request':'1'},body:JSON.stringify(data)};
  const response = await fetch('/api'+path,options); const value = await response.json();
  if(!response.ok) throw new Error(value.error || 'Anfrage fehlgeschlagen'); return value;
}
async function refresh() {
  state.sessions = await api('/sessions');
  if(state.session) state.session = await api('/sessions/'+state.session.id);
  render();
}
const isHost = () => state.session?.host === state.user?.id;
function auth() {
  return title('Willkommen bei BierPeter.',initialInvite?'Die Einladung bleibt während der Anmeldung erhalten.':'Sessions gemeinsam vorbereiten. Gespielt wird am Gerät.')+
  `<div class="tabs">${button('Anmelden','login',state.auth!=='login')}${button('Konto erstellen','register',state.auth!=='register')}</div><form data-form="auth">${input('name','Benutzername','z. B. Alex','text',40)}${input('password','Passwort',state.auth==='register'?'Mindestens 12 Zeichen':'','password',128)}<button class="btn">${state.auth==='register'?'Konto erstellen':'Anmelden'}</button></form><p class="footnote">Nur Benutzername und Passwort erforderlich. Die lokale Alpha verwendet ein notwendiges Sitzungscookie, kein Tracking.</p>`;
}
function home() {
  return title('Die nächste Runde beginnt hier.','Eine Session verbindet die Gruppe. Darin können beliebig viele Races vorbereitet werden.')+
  `<div class="hero-art"><div class="orb a"></div><div class="orb b"></div><div class="beer">🍺</div><div class="devicecube"></div><div class="devicecube right"></div></div><div class="stack">${button('Session erstellen ↗','create')}${button('Session beitreten','join',true)}</div><h2 class="section-title" style="margin-top:28px">Meine Sessions</h2>`+
  (state.sessions.length?state.sessions.map(s=>`<article class="panel"><div class="row"><div><h3 class="section-title">${esc(s.title)}</h3><span class="tag ${s.status==='accepted'?'':'amber'}">${s.host===state.user.id?'Host':s.status==='pending'&&s.expires<Date.now()/1000?'Anfrage abgelaufen':({accepted:'Dabei',pending:'Anfrage offen',rejected:'Abgelehnt',removed:'Entfernt'}[s.status])}</span></div>${s.status==='accepted'?button('Öffnen','session:'+s.id,true):button('Status prüfen','refresh',true)}</div></article>`).join(''):`<div class="panel empty">Noch keine Session. Eine eigene Session erstellen oder einen Einladungslink öffnen.</div>`)+`<p class="footnote">Standalone funktioniert später unabhängig von dieser App. Diese Alpha ist für lokale Vorbereitung, noch ohne Firmware-Anbindung.</p>`;
}
function overview() {
  const s=state.session;
  return title(esc(s.title),'Die Gruppe bleibt zusammen, auch wenn ein Race beendet ist.')+
    `<div class="split"><div class="metric"><div class="name">Teilnehmer</div><div class="value">${s.members.filter(m=>m.status==='accepted').length}</div></div><div class="metric"><div class="name">Races</div><div class="value">${s.races.length}</div></div></div><div class="panel"><h2 class="section-title">Nächste Schritte</h2><p class="section-sub">Spieler einladen, Geräte bereitstellen und ein Race mit passender Aufstellung vorbereiten.</p><div class="stack">${button('Einladung & Teilnehmer','tab:invite',true)}${button('Geräte ansehen','tab:devices',true)}${isHost()?button('Neues Race vorbereiten','new-race'):''}</div></div><h2 class="section-title">Spielrunden</h2>`+
    (s.races.length?s.races.map(r=>`<article class="panel race-card"><div class="row"><div><h3 class="section-title">${esc(r.title)}</h3><p class="section-sub">${modes[r.mode]} · ${r.slots.length} Positionen belegt</p><span class="tag amber">In Vorbereitung</span></div>${button('Aufstellung','race:'+r.id,true)}</div></article>`).join(''):'<div class="panel empty">Noch kein Race vorbereitet.</div>');
}
function invite() {
  const s=state.session, link=location.origin+'/?join='+encodeURIComponent(s.code);
  return title('Die Gruppe zusammenbringen.','Beitrittsanfragen werden vom Host bestätigt.')+
    `<div class="panel"><h2 class="section-title">Einladung</h2><label class="field"><span>Einladungslink</span><input id="invite-link" readonly value="${esc(link)}"></label>${button('Link kopieren','copy',true)}<p class="footnote">Scanbarer QR-Code folgt in einer späteren Version. Der Link funktioniert bereits.</p></div>`+
    (isHost()?`<div class="panel"><h2 class="section-title">Offene Anfragen</h2>${s.members.filter(m=>m.status==='pending').map(m=>`<div class="list-row"><div class="grow"><strong>${esc(m.name)}</strong><small>${m.expires<Date.now()/1000?'Abgelaufen':'Bestätigung ausstehend'}</small></div>${m.expires>Date.now()/1000?`<button class="tinybtn" data-action="accept:${m.id}">Annehmen</button>`:''}<button class="tinybtn" data-action="reject:${m.id}">Ablehnen</button></div>`).join('')||'<p class="section-sub">Keine offenen Anfragen.</p>'}</div>`:'')+
    `<div class="panel"><h2 class="section-title">Teilnehmer</h2>${s.members.filter(m=>m.status==='accepted').map(m=>`<div class="list-row"><div class="initial">${esc(m.name[0])}</div><div class="grow"><strong>${esc(m.name)}</strong><small>${m.id===s.host?'Host':'Teilnehmer'}</small></div>${isHost()&&m.id!==s.host?`<button class="tinybtn" data-action="remove:${m.id}">Entfernen</button>`:''}</div>`).join('')}</div>`;
}
function devices() {
  const s=state.session;
  return title('BierPeter bereitstellen.','Die Gerätekennung nimmt das Gerät in die Session auf. Sie bestätigt keine Verbindung und verändert keine dauerhafte Zuordnung.')+
    s.devices.map(d=>`<article class="sensor-device"><div class="station-head"><strong>${esc(d)}</strong><span class="tag amber">Verbindung ungeprüft</span></div><div class="paddle"></div><p class="section-sub">Bereitgestellt. Firmware-Anbindung und Glasbereitschaft sind in dieser Alpha noch nicht verfügbar.</p></article>`).join('')+
    (!s.devices.length?'<div class="panel empty">Noch keine Geräte bereitgestellt.</div>':'')+
    (isHost()?`<form data-form="device" class="panel"><h2 class="section-title">Gerät hinzufügen</h2>${input('device','Gerätekennung','z. B. BP-01','text',64)}<button class="btn">Zur Session hinzufügen</button></form>`:'');
}
function race() {
  const s=state.session,r=s.races.find(x=>x.id===state.race);
  if(!r) return overview();
  const members=s.members.filter(x=>x.status==='accepted');
  return title(esc(r.title),`${modes[r.mode]} · ${r.policy==='host'?'Host weist Positionen zu':'Freie Positionswahl'}`)+
    `<div class="note">${r.mode==='relay'?'Die Mannschaftszeit läuft vom Anstoßen am Startgerät bis zum letzten zurückgestellten Glas der jeweiligen Seite. Keine Zeitstrafen, kein Race-Timeout.':r.mode==='training'?'Training gegen die eigene Bestzeit. Der Countdown wird später über die App ausgelöst und akustisch am Gerät ausgegeben.':'Die Zeitmessung erfolgt später unmittelbar auf den Geräten.'}</div>`+
    s.devices.map((d,i)=>`<article class="sensor-device"><div class="station-head"><strong>${esc(d)}</strong><span class="tag blue">${r.mode==='relay'?(i===0?'Startgerät':'Folgegerät '+i):'Spielgerät'}</span></div><div class="station-grid">${[0,1].map(side=>{
      const slot=r.slots.find(x=>x.device===d&&x.side===side), current=members.find(x=>x.id===slot?.user);
      const editable=isHost() || r.policy==='free' && (!slot || slot.user===state.user.id);
      return `<div class="slot ${slot?'assigned':''}"><small>${side?'RECHTS':'LINKS'}</small><strong>${esc(current?.name || 'Position frei')}</strong>${editable?`<label><span class="sr-only">Teilnehmer ${esc(d)} ${side?'rechts':'links'}</span><select data-device="${esc(d)}" data-side="${side}"><option value="">Freier Platz</option>${members.filter(m=>isHost()||m.id===state.user.id).map(m=>`<option value="${m.id}" ${slot?.user===m.id?'selected':''} ${r.slots.some(x=>x.user===m.id&&!(x.device===d&&x.side===side))?'disabled':''}>${esc(m.name)}</option>`).join('')}</select></label>`:''}</div>`;
    }).join('')}</div></article>`).join('')+
    (!s.devices.length?button('Zuerst Gerät bereitstellen','tab:devices',true):'')+
    `<div class="panel"><h2 class="section-title">Messung noch nicht angeschlossen</h2><p class="section-sub">Diese Alpha speichert die Aufstellung. Es gibt noch keinen Hardwarestart, Trainings-Countdown oder Ergebnisimport. Es werden keine Messwerte simuliert.</p></div>${button('Zur Session','tab:overview',true)}`;
}
function profile() {
  return title('Mein Bereich',esc(state.user.name))+`<div class="panel"><h2 class="section-title">Lokales Konto</h2><p class="section-sub">Benutzername und ein gesalzener Passwort-Hash werden auf dieser Serverinstanz gespeichert. Ein eigenes Gerät ist nicht erforderlich.</p></div><div class="panel"><h2 class="section-title">Spätere Erweiterungen</h2><p class="section-sub">Persönliche Ergebnisse, Bestzeiten, Geräteverwaltung sowie JSON-Export und -Import folgen nach der Messanbindung.</p></div>${button('Abmelden','logout',true)}`;
}
function legal(privacy) {
  return title(privacy?'Datenschutz der lokalen Alpha':'Impressum & KI-Hinweis')+`<div class="panel legal">${privacy?`<p>Diese Alpha speichert Benutzername, Passwort-Hash, zeitlich begrenzte Login-Sitzung sowie Sessions, Beitrittsanfragen, Gerätekennungen und Race-Aufstellungen in SQLite auf der jeweiligen Serverinstanz.</p><p>Das notwendige HttpOnly-Sitzungscookie dient ausschließlich der Anmeldung; die Serversitzung läuft nach zwölf Stunden ab. Kein Tracking, keine externen Schriftarten, keine Analyse und kein localStorage. HTTP-Anfragen werden vom Anwendungsserver nicht protokolliert.</p><p>Export, Kontolöschung und endgültige Aufbewahrungsregeln sind noch nicht implementiert. Vor öffentlichem Betrieb müssen Verantwortlicher, Rechtsgrundlagen, Rechte und Löschfristen durch den Betreiber ergänzt werden.</p>`:`<p>Diese Anwendung wurde mit Unterstützung künstlicher Intelligenz erstellt.</p><p>Lokale Entwicklungsfassung. Anbieterangaben werden vom tatsächlichen Betreiber vor Veröffentlichung ergänzt. Die Bereitstellung unter POMPUI ist noch nicht erfolgt.</p><p>Die Lizenzentscheidung ist offen. Eine öffentliche Quellcodeablage ersetzt keine Lizenz.</p>`}</div>${button('Zurück','home',true)}`;
}
function render() {
  let html;
  if(state.view==='privacy'||state.view==='imprint') html=legal(state.view==='privacy');
  else if(!state.user) html=auth();
  else if(state.view==='create') html=title('Eine Gruppe, viele Races.','Zuerst die Session anlegen. Der Spielmodus wird pro Race gewählt.')+`<form data-form="session">${input('title','Session-Name','z. B. Freitagsrunde')}<button class="btn">Session erstellen</button></form>`;
  else if(state.view==='join') html=title('Session beitreten.','Einladungslink öffnen oder Einladungscode eingeben.')+`<form data-form="join">${input('code','Einladungscode oder Link',initialInvite||'')}<button class="btn">Beitritt anfragen</button></form>`;
  else if(state.view==='new-race') html=title('Was spielen wir?','Die Auswahl gilt für dieses Race. Die Session bleibt bestehen.')+`<form data-form="race">${input('title','Race-Name','z. B. Runde 1')}<label class="field"><span>Spielmodus</span><select name="mode">${Object.entries(modes).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label class="field"><span>Positionswahl</span><select name="policy"><option value="host">Host weist Positionen zu</option><option value="free">Teilnehmer wählen freie Plätze</option></select></label><p class="footnote">Turnierpläne und Trainingsstart sind noch nicht implementiert. Alle Modi können als Vorbereitungsentwurf gespeichert werden.</p><button class="btn">Race vorbereiten</button></form>`;
  else if(state.view==='session') html=({overview,invite,devices,race}[state.tab]||overview)();
  else if(state.view==='profile') html=profile();
  else html=home();
  $('#app').innerHTML=html;
  $('#account').textContent=state.user?state.user.name:'Lokale Alpha';
  $('#strip').innerHTML=state.view==='session'?`<span class="strip-label">SESSION</span>${state.session.devices.map(d=>`<span class="strip-device">${esc(d)} · ungeprüft</span>`).join('')}`:'';
  const items=state.view==='session'?[['tab:overview','⌂','Session'],['tab:devices','▣','Geräte'],['tab:invite','▦','Einladung'],['profile','◯','Profil']]:[['home','⌂','Start'],['profile','◯','Profil'],['privacy','ⓘ','Datenschutz'],['imprint','§','Impressum']];
  $('#nav').innerHTML=items.map(([a,i,l])=>`<button data-action="${a}"><span class="nav-ico">${i}</span>${l}</button>`).join('');
}
async function action(a) {
  if(a==='login'||a==='register'){state.auth=a;render();return;}
  if(a==='logout'){await api('/logout',{});state.user=null;state.session=null;state.view='home';render();return;}
  if(a==='refresh'){await refresh();return;}
  if(a==='copy') {const input=$('#invite-link');try{await navigator.clipboard.writeText(input.value);notice('Einladungslink kopiert');}catch{input.select();notice('Link markieren und kopieren');}return;}
  if(a.startsWith('session:')){state.session=await api('/sessions/'+a.slice(8));state.view='session';state.tab='overview';}
  else if(a.startsWith('tab:')){state.view='session';state.tab=a.slice(4);await refresh();return;}
  else if(a.startsWith('race:')){state.race=a.slice(5);state.view='session';state.tab='race';}
  else if(/^(accept|reject|remove):/.test(a)){const [act,user]=a.split(':');if(act==='remove'&&!confirm('Teilnehmer aus der Session entfernen?'))return;await api('/sessions/'+state.session.id+'/member',{user,status:{accept:'accepted',reject:'rejected',remove:'removed'}[act]});await refresh();return;}
  else state.view=a;
  render();
}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;b.disabled=true;try{await action(b.dataset.action);}catch(err){notice(err.message);}finally{b.disabled=false;}});
document.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-form]');if(!f)return;e.preventDefault();const b=f.querySelector('button');b.disabled=true;
  try {
    const d=Object.fromEntries(new FormData(f));
    switch(f.dataset.form){
      case 'auth': state.user=await api('/'+state.auth,d);state.view='home';if(initialInvite){await api('/join',{code:initialInvite});notice('Beitrittsanfrage gesendet');history.replaceState(null,'',location.pathname);}await refresh();break;
      case 'session': {const s=await api('/sessions',d);state.session=await api('/sessions/'+s.id);state.view='session';state.tab='overview';await refresh();break;}
      case 'join': if(d.code.includes('://'))d.code=new URL(d.code).searchParams.get('join');await api('/join',d);state.view='home';await refresh();notice('Beitrittsanfrage gesendet');break;
      case 'device': await api('/sessions/'+state.session.id+'/device',d);await refresh();break;
      case 'race': await api('/sessions/'+state.session.id+'/race',d);state.view='session';state.tab='overview';await refresh();break;
    }
  } catch(err){notice(err.message);}finally{b.disabled=false;}
});
document.addEventListener('change',async e=>{const select=e.target.closest('select[data-device]');if(!select)return;select.disabled=true;try{await api('/slot',{race:state.race,device:select.dataset.device,side:Number(select.dataset.side),user:select.value||null});await refresh();}catch(err){notice(err.message);await refresh();}});
window.addEventListener('hashchange',()=>{if(location.hash==='#privacy'){state.view='privacy';render();}});
(async()=>{try{state.user=await api('/me');if(initialInvite){await api('/join',{code:initialInvite});notice('Beitrittsanfrage gesendet');history.replaceState(null,'',location.pathname);}await refresh();}catch{render();}if(location.hash==='#privacy'){state.view='privacy';render();}})();

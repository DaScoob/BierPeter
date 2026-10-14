// Render smoke checks in a DOM stub; not a replacement for browser layout QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();
const element=()=>({innerHTML:'',textContent:'',replaceChildren(){this.innerHTML='';}});
const context={document:{querySelector(s){if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},addEventListener(){}},location:{search:'',origin:'http://localhost',hash:'',pathname:'/'},URLSearchParams,URL,history:{replaceState(){}},window:{addEventListener(){}},navigator:{},setTimeout(){},confirm:()=>true,fetch:async()=>({ok:false,json:async()=>({error:'Anmeldung erforderlich'})})};
vm.createContext(context);vm.runInContext(fs.readFileSync('web/app.js','utf8'),context);
vm.runInContext(`state.user={id:'host',name:'Host'};state.sessions=[];render();`,context);
assert.match(nodes.get('#app').innerHTML,/Session erstellen/);
vm.runInContext(`state.session={id:'s',title:'Freitagsrunde',host:'host',code:'abc',devices:['BP-01'],members:[{id:'host',name:'Host',status:'accepted'}],races:[{id:'r',title:'Race 1',mode:'relay',policy:'host',slots:[]}]};state.view='session';state.tab='overview';render();`,context);
assert.match(nodes.get('#app').innerHTML,/Race 1/);
vm.runInContext(`state.tab='race';state.race='r';render();`,context);
assert.match(nodes.get('#app').innerHTML,/Keine Zeitstrafen/);
assert.match(nodes.get('#app').innerHTML,/Messung noch nicht angeschlossen/);
vm.runInContext(`state.tab='invite';render();`,context);
assert.match(nodes.get('#app').innerHTML,/join=abc/);
vm.runInContext(`state.view='privacy';render();`,context);
assert.match(nodes.get('#app').innerHTML,/HttpOnly/);
console.log('5 UI render smoke checks passed (no browser layout verification).');

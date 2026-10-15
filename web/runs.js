'use strict';
// SPDX-License-Identifier: AGPL-3.0-only
// Measurements are decrypted only in this browser. Private identity lives in the sealed vault.
globalThis.BierPeterRuns=(()=>{
 const enc=new TextEncoder(),dec=new TextDecoder();
 const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const bytes=s=>{if(!/^[a-f0-9]{64}$/i.test(s))throw Error('Ungültiger Messschlüssel');return Uint8Array.from(s.match(/../g),x=>parseInt(x,16));};
 const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function create(){const pair=await crypto.subtle.generateKey('X25519',true,['deriveBits']);return {private:await crypto.subtle.exportKey('jwk',pair.privateKey),public:hex(await crypto.subtle.exportKey('raw',pair.publicKey))};}
 async function open(identity,run,recipient){
  const e=run.envelope;if(!e||e.v!==1||e.alg!=='X25519-HKDF-SHA256-A256GCM'||e.public!==run.host_public)throw Error('Ungültiger Messumschlag');
  const privateKey=await crypto.subtle.importKey('jwk',identity.private,'X25519',false,['deriveBits']);
  const publicKey=await crypto.subtle.importKey('raw',bytes(e.public),'X25519',false,[]);
  const shared=await crypto.subtle.deriveBits({name:'X25519',public:publicKey},privateKey,256);
  const material=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  const scope='BierPeter:result:v1:'+run.id+':'+run.host+':'+recipient;
  const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('BierPeter:run:v1'),info:enc.encode(scope)},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv),additionalData:enc.encode(scope),tagLength:128},key,b64(e.ciphertext));
  const result=JSON.parse(dec.decode(clear));
  if(result.v!==1||result.run!==run.id||result.demo!==!!run.demo||!Array.isArray(result.total_us)||result.total_us.length!==2||result.total_us.some(x=>!Number.isSafeInteger(x)||x<0)||!Array.isArray(result.splits)||result.splits.length>16||result.splits.some(x=>!Number.isSafeInteger(x.duration_us)||x.duration_us<0||![0,1].includes(x.side)))throw Error('Ungültige Messergebnisse');
  return result;
 }
 return {create,open};
})();

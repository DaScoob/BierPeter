'use strict';
// Private-storage prototype. Key material is never transmitted to the server.
globalThis.BierPeterVault=(()=>{
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  const aad=owner=>encoder.encode('BierPeter:private:v1:'+owner);
  function available(){return !!globalThis.crypto?.subtle;}
  async function importRecovery(recovery){
    if(!available())throw new Error('Private Daten benötigen HTTPS oder localhost.');
    if(!/^[0-9a-f]{64}$/i.test(recovery))throw new Error('Der Wiederherstellungsschlüssel benötigt 64 Hex-Zeichen.');
    const raw=Uint8Array.from(recovery.match(/../g),x=>parseInt(x,16));
    return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
  }
  function createRecovery(){
    if(!available())throw new Error('Private Daten benötigen HTTPS oder localhost.');
    return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function seal(key,owner,value){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner),tagLength:128},key,encoder.encode(JSON.stringify(value)));
    return {v:1,alg:'A256GCM',iv:b64(iv),ciphertext:b64(ciphertext)};
  }
  async function open(key,owner,envelope){
    if(envelope.v!==1||envelope.alg!=='A256GCM')throw new Error('Unbekanntes Speicherformat.');
    try{
      const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:aad(owner),tagLength:128},key,bytes(envelope.ciphertext));
      return JSON.parse(decoder.decode(clear));
    }catch{throw new Error('Private Daten konnten nicht entschlüsselt werden. Schlüssel und Konto prüfen.');}
  }
  return {available,createRecovery,importRecovery,seal,open};
})();

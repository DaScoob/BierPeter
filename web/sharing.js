'use strict';
// Recipient-specific name sharing. Private ECDH identity stays inside the encrypted vault.
globalThis.BierPeterSharing=(()=>{
  const encoder=new TextEncoder();
  function publicPart(jwk){return {kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y};}
  async function createIdentity(){
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    return crypto.subtle.exportKey('jwk',pair.privateKey);
  }
  async function key(privateJwk,publicJwk,scope){
    const privateKey=await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
    const publicKey=await crypto.subtle.importKey('jwk',publicPart(publicJwk),{name:'ECDH',namedCurve:'P-256'},false,[]);
    const bits=await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},privateKey,256);
    const material=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('BierPeter:names:v1'),info:encoder.encode(scope)},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  const scope=(session,provider,recipient)=>'BierPeter:session-names:v1:'+session+':'+provider+':'+recipient;
  async function seal(identity,peer,session,provider,recipient,names){
    const context=scope(session,provider,recipient);
    return BierPeterVault.seal(await key(identity,peer,context),context,{v:1,names});
  }
  async function open(identity,peer,session,provider,recipient,envelope){
    const context=scope(session,provider,recipient);
    return BierPeterVault.open(await key(identity,peer,context),context,envelope);
  }
  async function fingerprint(jwk){
    const p=publicPart(jwk),digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(p)));
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('').match(/.{1,8}/g).join(' ');
  }
  return {createIdentity,publicPart,seal,open,fingerprint};
})();

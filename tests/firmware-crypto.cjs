// SPDX-License-Identifier: AGPL-3.0-only
// Receives a ciphertext produced by the exact C++ cryptography used on the ESP.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const [publicKey,recipient,key,ciphertext]=fs.readFileSync(0,'utf8').trim().split('\n');
const c={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,atob};vm.createContext(c);vm.runInContext(fs.readFileSync('web/runs.js','utf8'),c);
(async()=>{
 const privateRaw=Buffer.from(Array.from({length:32},(_,i)=>100+i));
 const identity={private:{kty:'OKP',crv:'X25519',x:Buffer.from(recipient,'hex').toString('base64url'),d:privateRaw.toString('base64url')}};
 const run={id:'test-run',host:'AABBCCDDEEFF',host_public:publicKey,demo:1,envelope:{v:1,alg:'X25519-HKDF-SHA256-A256GCM',public:publicKey,iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.from(ciphertext,'hex').toString('base64')}};
 c.identity=identity;c.run=run;
 const result=await vm.runInContext("BierPeterRuns.open(identity,run,'recipient')",c);assert.equal(result.total_us[0],3000000);assert.equal(result.total_us[1],4500000);
 c.run={...run,id:'replay'};await assert.rejects(vm.runInContext("BierPeterRuns.open(identity,run,'recipient')",c));
 console.log('Exact embedded C++ X25519/HKDF/AES-GCM ciphertext decrypted by browser module; replay rejected.');
})().catch(e=>{console.error(e);process.exitCode=1;});

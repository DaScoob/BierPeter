// Our camera adapter must release tracks after cancel, decode and failed permission.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  let dialog,closed=0,destroyed=0,callback,fail=false,instance;
  const tracks=[{stop(){closed++;}}];
  const video={srcObject:{getTracks:()=>tracks}},button={};
  const c=vm.createContext({navigator:{mediaDevices:{getUserMedia(){}}},isSecureContext:true,document:{body:{append(){}},createElement(){return dialog={querySelector(s){return s==='video'?video:button;},showModal(){},addEventListener(){},remove(){this.removed=true;}};}},QrScanner:class{
    constructor(v,fn){this.$video=v;callback=fn;instance=this;}
    async start(){if(fail)throw Error('Permission denied');}
    destroy(){destroyed++;}
  },console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/qr.js'),'utf8'),c);
  let decoded='';await c.BierPeterQR.start(value=>decoded=value);button.onclick();assert(dialog.removed);assert.equal(closed,1);assert.equal(destroyed,1);
  await c.BierPeterQR.start(value=>decoded=value);callback({data:'84F3EB52F7F9'});assert.equal(decoded,'84F3EB52F7F9');assert.equal(closed,2);
  fail=true;await assert.rejects(c.BierPeterQR.start(()=>{}));assert(dialog.removed);assert.equal(destroyed,3);
  c.isSecureContext=false;await assert.rejects(c.BierPeterQR.start(()=>{}),/HTTPS/);
  console.log('Camera adapter checks passed: cancel, decoded result, permission failure and insecure-context rejection. No physical camera was tested.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Decode the actual generated QR pixels with the vendored fallback worker.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../web');
(async()=>{
  const generator=vm.createContext({});vm.runInContext(fs.readFileSync(root+'/vendor/qrcodegen.js','utf8'),generator);
  let workerBlob;
  const factory=vm.createContext({Blob,URL:{createObjectURL(blob){workerBlob=blob;return 'local-worker';}},Worker:class{}});
  vm.runInContext(fs.readFileSync(root+'/vendor/qr-scanner-worker.min.js','utf8').replace(/^export /,''),factory);
  vm.runInContext('createWorker()',factory);
  const responses=[],self={postMessage(value){responses.push(value);},close(){}};
  const worker=vm.createContext({self});vm.runInContext(await workerBlob.text(),worker);
  for(const text of ['http://192.168.42.20:6017/?join=sample_invitation-123','http://192.168.42.20:6017/?84F3EB52F7F9','http://192.168.42.20:6017/?device=AA:BB:CC:DD:EE:FF']){
    generator.value=text;
    const qr=vm.runInContext('qrcodegen.QrCode.encodeText(value,qrcodegen.QrCode.Ecc.MEDIUM)',generator);
    const scale=6,width=(qr.size+8)*scale,pixels=new Uint8ClampedArray(width*width*4);pixels.fill(255);
    for(let y=0;y<width;y++)for(let x=0;x<width;x++)if(qr.getModule(Math.floor(x/scale)-4,Math.floor(y/scale)-4)){
      const offset=(y*width+x)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0;
    }
    self.onmessage({data:{id:1,type:'decode',data:{data:pixels,width,height:width}}});
    assert.equal(responses.at(-1).data,text);
  }
  console.log('QR round trips passed: invitation, raw MAC link and explicit device link, decoded by the real local worker.');
})().catch(error=>{console.error(error);process.exitCode=1;});

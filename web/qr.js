'use strict';
// Vendored QR libraries; no camera frames or QR contents are uploaded here.
globalThis.BierPeterQR=(()=>{
  let scanner=null,dialog=null,generation=0;
  function svg(value){
    const qr=qrcodegen.QrCode.encodeText(value,qrcodegen.QrCode.Ecc.MEDIUM),border=4,size=qr.size+border*2,paths=[];
    for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))paths.push(`M${x+border},${y+border}h1v1h-1z`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR-Code zur Session-Einladung" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`;
  }
  function close(){
    generation++;
    const active=scanner;scanner=null;
    if(active){active.$video?.srcObject?.getTracks().forEach(track=>track.stop());active.destroy();}
    if(dialog){dialog.remove();dialog=null;}
  }
  async function start(onResult){
    if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera benötigt HTTPS oder localhost. Alternativ QR-Foto auswählen oder die Kamera-App des Handys verwenden.');
    close();const current=++generation;
    const node=document.createElement('dialog');dialog=node;node.className='scanner-dialog';
    node.innerHTML='<h2>Geräte-QR-Code scannen</h2><video muted playsinline aria-label="Kameravorschau"></video><p>Nur der erkannte Gerätecode wird übernommen.</p><button type="button" class="btn outline">Abbrechen</button>';
    document.body.append(node);node.showModal();node.querySelector('button').onclick=close;node.addEventListener('cancel',close);
    const video=node.querySelector('video');
    const instance=new QrScanner(video,result=>{if(current!==generation)return;close();Promise.resolve(onResult(result.data)).catch(error=>globalThis.bierPeterScanError?.(error));},{preferredCamera:'environment',returnDetailedScanResult:true,maxScansPerSecond:8});
    scanner=instance;
    try{await instance.start();if(current!==generation){video.srcObject?.getTracks().forEach(track=>track.stop());instance.destroy();}}
    catch(error){if(current===generation)close();throw new Error('Kamera konnte nicht geöffnet werden. Berechtigung und HTTPS prüfen.');}
  }
  async function image(file){
    if(!file||!file.type.startsWith('image/')||file.size>15*1024*1024)throw new Error('Eine Bilddatei bis 15 MB auswählen.');
    const result=await QrScanner.scanImage(file,{returnDetailedScanResult:true});return result.data;
  }
  globalThis.addEventListener?.('pagehide',close);
  return {svg,start,image,close};
})();

// Pipeline validation with the real MP4 demuxer and a deterministic WebCodecs/canvas adapter.
// The adapter does not claim native browser decoder validation.
import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseVideo} from '../src/media.js';
const messages=[],decoded=[],convertedGuides=[],drawnLabels=[],drawnSpeedLabels=[];globalThis.self={};globalThis.postMessage=m=>messages.push(m);globalThis.ImageData=class{constructor(data,w,h){this.data=data;this.width=w;this.height=h;}};
let origin,twoObjectScene=false;
globalThis.EncodedVideoChunk=class{constructor(data){Object.assign(this,data);}};
globalThis.VideoDecoder=class{
 static async isConfigSupported(config){return {supported:true,config};}
 constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.decodeQueueSize=0;this.pending=[];}
 configure(){this.state='configured';}
 decode(chunk){if(origin===undefined)origin=chunk.timestamp;decoded.push(chunk.timestamp);this.pending.push(chunk);}
 async flush(){for(const chunk of this.pending.sort((a,b)=>a.timestamp-b.timestamp))this.callbacks.output({timestamp:chunk.timestamp,index:Math.round((chunk.timestamp-origin)*60/1e6),close(){}});this.pending=[];} close(){this.state='closed';this.pending=[];}
};
const encodedFrames=[];
const baseline=await parseVideo(new Blob([await readFile(new URL('./fixtures/baseline.mp4',import.meta.url))]));const firstPacket=baseline.mp4.getSample(baseline.trak,0).data;
globalThis.VideoFrame=class{constructor(canvas,options){Object.assign(this,options);this.pixels=new Uint8ClampedArray(ArrayBuffer.isView(canvas)?canvas:canvas.pixels);this.guides=structuredClone(canvas.guides||[]);}close(){}};
globalThis.VideoEncoder=class{
 static async isConfigSupported(config){return {supported:true,config};}
 constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.encodeQueueSize=0;}
 configure(){this.state='configured';}
 encode(frame){encodedFrames.push({timestamp:frame.timestamp,pixels:frame.pixels,guides:frame.guides});this.callbacks.output({timestamp:frame.timestamp,duration:frame.duration,type:'key',byteLength:firstPacket.length,copyTo:out=>out.set(firstPacket)},{decoderConfig:baseline.config});}
 async flush(){}close(){this.state='closed';}
};
globalThis.OffscreenCanvas=class{
 constructor(w,h){this.width=w;this.height=h;const canvas=this;canvas.pixels=new Uint8ClampedArray(w*h*4);canvas.guides=[];this.ctx={save(){},restore(){},clearRect(){canvas.pixels.fill(0);},fillRect(x=0,y=0,w=canvas.width,h=canvas.height){for(let row=Math.max(0,Math.floor(y));row<Math.min(canvas.height,Math.ceil(y+h));row++)for(let col=Math.max(0,Math.floor(x));col<Math.min(canvas.width,Math.ceil(x+w));col++){const i=(row*canvas.width+col)*4;canvas.pixels.set([100,100,100,255],i);}},translate(){},rotate(){},scale(){},beginPath(){canvas.path=[];},moveTo(x,y){canvas.path.push(['m',x,y]);},lineTo(x,y){canvas.path.push(['l',x,y]);},arc(x,y,r){canvas.path.push(['a',x,y,r]);},fill(){},stroke(){canvas.guides=structuredClone(canvas.path);},drawImage(frame){if(Number.isInteger(frame.index)){canvas.pixels.fill(100);for(let i=3;i<canvas.pixels.length;i+=4)canvas.pixels[i]=255;if(frame.index>0){canvas.pixels.set([240,10,10,255],(frame.index+100)*4);for(let y=30;y<39;y++)for(let x=50+frame.index*2;x<59+frame.index*2;x++)canvas.pixels.set([240,10,10,255],(y*canvas.width+x)*4);if(twoObjectScene)for(let y=66;y<75;y++)for(let x=150+frame.index*2;x<159+frame.index*2;x++)canvas.pixels.set([10,10,240,255],(y*canvas.width+x)*4);}}else if(frame.pixels){canvas.guides=structuredClone(frame.guides||[]);for(let i=0;i<Math.min(canvas.pixels.length,frame.pixels.length);i+=4)if(frame.pixels[i+3])canvas.pixels.set(frame.pixels.subarray(i,i+4),i);}},getImageData(){const data=new Uint8ClampedArray(canvas.pixels);data.guides=structuredClone(canvas.guides);return new ImageData(data,canvas.width,canvas.height);},putImageData(image){canvas.pixels=new Uint8ClampedArray(image.data);},measureText(){return {width:20};},strokeText(text){drawnLabels.push(text);},fillText(text){drawnSpeedLabels.push(text);}};}
 getContext(){return this.ctx;}async convertToBlob(){convertedGuides.push(structuredClone(this.guides));return new Blob([this.pixels]);}
};
await import('../src/worker.js');
const send=m=>self.onmessage({data:m});
test('real demux → exact frame selection → original/2x/3x/4x composition uses cache only',async()=>{
 const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:1});assert(messages.some(m=>m.type==='loaded'));assert(!messages.some(m=>m.type==='error'));
 await send({type:'extract',first:1,last:50,reference:13,step:6,background:0,maxDimension:640,id:2});const extraction=messages.find(m=>m.type==='extracted');assert(extraction,JSON.stringify(messages.filter(m=>m.type==='error')));assert.deepEqual(extraction.indices,[1,7,13,19,25,31,37,43,49]);const packets=decoded.length;
 for(const factor of [1,2,3,4]){await send({type:'compose',first:1,last:50,reference:13,step:6,factor,sensitivity:30,labels:false,id:3+factor});const result=messages.filter(m=>m.type==='composed').at(-1);assert(result);const pixels=new Uint8Array(await result.blob.arrayBuffer());assert.equal(pixels[(13+100)*4],240);if(factor>1)assert.equal(pixels[(7+100)*4],100);assert.equal(decoded.length,packets);}

 await send({type:'export-video',first:1,last:50,reference:13,step:6,factor:1,sensitivity:30,labels:false,id:9});const video=messages.filter(m=>m.type==='video-exported').at(-1);assert(video,JSON.stringify(messages.filter(m=>m.type==='error')));assert.equal(video.count,109);assert.equal(video.lastSample,49);assert.equal(video.blob.type,'video/mp4');assert.equal(encodedFrames[0].timestamp,0);assert.equal(encodedFrames[1].timestamp,16667);
 // The second live source frame (2) remains visible alongside the frozen image at frame 1.
 assert.equal(encodedFrames[1].pixels[(2+100)*4],240);assert.equal(encodedFrames[1].pixels[(1+100)*4],240);assert.equal(encodedFrames[1].pixels[(7+100)*4],100);
 // Frozen images appear only at their sampled time; no final endpoint image is added.
 assert.equal(encodedFrames[6].pixels[(7+100)*4],240);assert.equal(encodedFrames[5].pixels[(7+100)*4],100);
 // The selected end (50) is not a strobe sample. It must never appear in the hold.
 for(const frame of encodedFrames.slice(-60))assert.equal(frame.pixels[(50+100)*4],100);
 assert.equal(encodedFrames.at(-1).pixels[(49+100)*4],240);
 const photo=messages.filter(m=>m.type==='composed'&&m.count===9).at(-1);const hash=a=>createHash('sha256').update(a).digest('hex');assert.equal(hash(encodedFrames.at(-1).pixels),hash(new Uint8ClampedArray(await photo.blob.arrayBuffer())));
 const exported=await parseVideo(video.blob);assert.equal(exported.clock.ordered.length,109);assert.equal(exported.clock.origin,0);
 // Slow playback preserves sampled poses and source-frame order while stretching encoded presentation times.
 encodedFrames.length=0;drawnSpeedLabels.length=0;
 await send({type:'export-video',first:1,last:50,reference:13,step:6,factor:1,sensitivity:30,labels:false,playbackSpeed:.5,id:901});
 const slow=messages.at(-1);assert.equal(slow.type,'video-exported',JSON.stringify(slow));assert.equal(slow.playbackSpeed,.5);assert.equal(slow.count,79);
 assert.equal(encodedFrames[0].timestamp,0);assert.equal(encodedFrames[1].timestamp,33333);assert.equal(encodedFrames[6].pixels[(7+100)*4],240);
 assert.equal(encodedFrames.at(-1).timestamp,Math.round(((49-1+1)/60*2+29/30)*1e6));
 assert.equal(drawnSpeedLabels.length,49);assert(drawnSpeedLabels.every(label=>label==='×0.5'));
 const slowParsed=await parseVideo(slow.blob);assert.equal(slowParsed.clock.ordered.length,79);assert(Math.abs(slowParsed.clock.playbackTimes.at(-1)-encodedFrames.at(-1).timestamp/1e6)<.001);
 assert.equal(hash(encodedFrames.at(-1).pixels),hash(new Uint8ClampedArray(await photo.blob.arrayBuffer())));
 encodedFrames.length=0;drawnSpeedLabels.length=0;
 await send({type:'export-video',first:1,last:50,reference:13,step:6,factor:1,sensitivity:30,labels:false,playbackSpeed:.25,id:902});
 assert.equal(messages.at(-1).type,'video-exported');assert.equal(encodedFrames[1].timestamp,66667);assert(drawnSpeedLabels.every(label=>label==='×0.25'));
 assert.equal(hash(encodedFrames.at(-1).pixels),hash(new Uint8ClampedArray(await photo.blob.arrayBuffer())));
 // 3x keeps reference-anchored samples 13,31,49; the final hold equals its photo.
 encodedFrames.length=0;
 await send({type:'export-video',first:1,last:50,reference:13,step:6,factor:3,sensitivity:30,labels:false,id:10});
 const triple=messages.filter(m=>m.type==='video-exported').at(-1);assert.equal(triple.lastSample,49);assert.equal(triple.count,109);
 const triplePhoto=messages.filter(m=>m.type==='composed'&&m.count===3).at(-1);assert.equal(hash(encodedFrames.at(-1).pixels),hash(new Uint8ClampedArray(await triplePhoto.blob.arrayBuffer())));
 for(const index of [13,31,49])assert.equal(encodedFrames.at(-1).pixels[(index+100)*4],240);
 for(const index of [1,7,19,25,37,43,50])assert.equal(encodedFrames.at(-1).pixels[(index+100)*4],100);
 // Coarser spacing stops at its own final sampled frame and holds its own photo.
 encodedFrames.length=0;
 await send({type:'export-video',first:1,last:50,reference:13,step:6,factor:4,sensitivity:30,labels:false,id:10});
 const coarse=messages.filter(m=>m.type==='video-exported').at(-1);assert.equal(coarse.lastSample,37);assert.equal(coarse.count,97);
 const coarsePhoto=messages.filter(m=>m.type==='composed'&&m.count===2).at(-1);assert.equal(hash(encodedFrames.at(-1).pixels),hash(new Uint8ClampedArray(await coarsePhoto.blob.arrayBuffer())));
 assert.equal(encodedFrames.at(-1).pixels[(49+100)*4],100);
 encodedFrames.length=0;
 // Re-extraction must work after compressed sample buffers are released.
 await send({type:'extract',first:2,last:20,reference:8,step:3,background:0,maxDimension:640,id:10});assert.equal(messages.at(-1).type,'extracted');
});
test('manual center and source-frame preview reuse the extracted cache',async()=>{const packets=decoded.length;await send({type:'compose',first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,anchors:[{index:8,x:101.125,y:12.875,mode:'center'}],id:11});const photo=messages.at(-1);assert.equal(photo.type,'composed');const center=photo.centers.find(c=>c.index===8);assert.equal(center.confidence,'manual');assert.equal(center.x,101.125);assert.equal(center.y,12.875);await send({type:'tracking-preview',index:8,id:12});assert.equal(messages.at(-1).type,'tracking-preview');assert.equal(decoded.length,packets);});
test('worker keeps frame marks fixed across sensitivity, thinning and explicit skip',async()=>{
 const settings={first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false};
 const anchors=[{index:2,mode:'center',x:101.125,y:12.875,source:'object'},{index:8,mode:'center',x:150.625,y:80.125,source:'manual'},{index:11,mode:'skip'}],packets=decoded.length;
 await send({type:'compose',...settings,anchors,id:14});let photo=messages.at(-1);assert.equal(photo.type,'composed');const fixed=structuredClone(photo.centers);
 await send({type:'compose',...settings,anchors,sensitivity:80,id:15});assert.deepEqual(messages.at(-1).centers,fixed);
 await send({type:'compose',...settings,anchors,factor:2,id:16});photo=messages.at(-1);assert.equal(photo.centers.find(p=>p.index===2).x,101.125);assert.equal(photo.centers.find(p=>p.index===8).x,150.625);
 await send({type:'compose',...settings,anchors,id:17});assert.deepEqual(messages.at(-1).centers,fixed);assert.equal(fixed.find(p=>p.index===11).confidence,'skipped');assert.equal(fixed.find(p=>p.index===5).confidence,'unset');
 await send({type:'select-center',index:8,x:155.25,y:90.875,sensitivity:30,id:18});const selected=messages.at(-1);assert.equal(selected.type,'center-selected');assert.equal(selected.mark.index,8);assert.equal(selected.mark.x,155.25);assert.equal(selected.mark.spaceWidth,640);assert.equal(selected.mark.source,'tap');
 assert.equal(decoded.length,packets);assert.equal(anchors[0].x,101.125);
});
test('video accumulates manual and automatic centers and holds the matching final photo',async()=>{
 encodedFrames.length=0;
 const settings={first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,grid:{enabled:true,points:false},anchors:[{index:2,mode:'center',x:100.125,y:25.875},{index:8,mode:'skip'},{index:11,mode:'center',x:200.625,y:40.25,source:'auto'},{index:20,mode:'skip'}]};
 await send({type:'compose',...settings,id:40});const photo=messages.at(-1);assert.equal(photo.type,'composed');
 await send({type:'export-video',...settings,id:41});const video=messages.at(-1);assert.equal(video.type,'video-exported');assert.equal(video.lastSample,20);assert.equal(video.count,79);
 const first=[['m',100.125,0],['l',100.125,360],['m',0,25.875],['l',640,25.875]],final=[...first,['m',200.625,0],['l',200.625,360],['m',0,40.25],['l',640,40.25]];
 assert.deepEqual(encodedFrames[0].guides,first);assert.deepEqual(encodedFrames[6].guides,first);assert.deepEqual(encodedFrames[9].guides,final);assert.deepEqual(encodedFrames.at(-1).guides,final);
 const hash=a=>createHash('sha256').update(a).digest('hex');assert.equal(hash(encodedFrames.at(-1).pixels),hash(new Uint8ClampedArray(await photo.blob.arrayBuffer())));
 encodedFrames.length=0;
});
test('cancel acknowledges request and does not discard source metadata',async()=>{await send({type:'cancel',id:20});assert.equal(messages.at(-1).type,'cancelled');assert.equal(messages.at(-1).id,20);});

test('video cancellation keeps the photo cache usable and drops unfinished MP4',async()=>{const prior=messages.filter(m=>m.type==='video-exported').length;const pending=send({type:'export-video',first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,id:30});await new Promise(r=>setTimeout(r,0));await send({type:'cancel',id:31});await pending;assert.equal(messages.filter(m=>m.type==='video-exported').length,prior);await send({type:'compose',first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,id:32});assert.equal(messages.at(-1).type,'composed');});

test('automatic detection uses all extracted frames without decoding again, preserving fixed marks',async()=>{
 const settings={first:2,last:20,reference:8,step:3,factor:4,sensitivity:30};
 const anchors=[{index:8,x:70,y:34,mode:'center',source:'object'},{index:2,x:58.25,y:34.75,mode:'center',source:'manual'},{index:11,mode:'skip'},{index:5,x:999,y:999,mode:'center',source:'auto'}],original=structuredClone(anchors),packets=decoded.length;
 await send({type:'auto-detect',...settings,seedIndex:8,anchors,id:50});const result=messages.at(-1);assert.equal(result.type,'auto-detected',JSON.stringify(result));assert.deepEqual(result.marks.map(m=>m.index),[2,5,8,11,14,17,20]);
 for(const mark of original.filter(m=>m.source!=='auto'))assert.deepEqual(result.marks.find(m=>m.index===mark.index),mark);
 assert.equal(result.marks.find(m=>m.index===5).x,64);assert.equal(result.marks.find(m=>m.index===20).source,'auto');assert.deepEqual(anchors,original);assert.equal(decoded.length,packets);
 await send({type:'compose',...settings,factor:1,anchors:result.marks,id:51});const photo=messages.at(-1);assert.equal(photo.type,'composed');assert.equal(photo.centers.find(p=>p.index===5).confidence,'auto');assert.equal(photo.centers.find(p=>p.index===11).confidence,'skipped');assert.equal(photo.centers.find(p=>p.index===2).x,58.25);
});
test('automatic detection cancellation discards unfinished marks and retains the photo cache',async()=>{
 const settings={first:2,last:20,reference:8,step:3,sensitivity:30,anchors:[{index:8,x:70,y:34,mode:'center'}],seedIndex:8},prior=messages.filter(m=>m.type==='auto-detected').length,packets=decoded.length;
 const pending=send({type:'auto-detect',...settings,id:52});await send({type:'cancel',id:53});await pending;assert.equal(messages.filter(m=>m.type==='auto-detected').length,prior);assert.equal(messages.at(-1).type,'cancelled');
 await send({type:'compose',...settings,factor:1,id:54});assert.equal(messages.at(-1).type,'composed');assert.equal(decoded.length,packets);
});


test('clean guide preview reuses the photo cache and rotated single-axis video matches the photo',async()=>{
 const settings={first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,grid:{enabled:true,angle:35,vertical:false,horizontal:true,points:false},anchors:[{index:2,mode:'center',x:100,y:40},{index:11,mode:'center',x:200,y:80},{index:20,mode:'skip'}]};
 const anchors=structuredClone(settings.anchors),packets=decoded.length;
 await send({type:'compose',...settings,id:70});const photo=messages.at(-1),photoLines=convertedGuides.at(-1);assert.equal(photo.type,'composed');assert.equal(photoLines.length,4);
 for(let i=0;i<photoLines.length;i+=2){const a=photoLines[i],b=photoLines[i+1];assert(Math.abs((b[2]-a[2])/(b[1]-a[1])-Math.tan(35*Math.PI/180))<1e-8);}
 await send({type:'guide-preview',id:71});const preview=messages.at(-1);assert.equal(preview.type,'guide-preview');assert.deepEqual(preview.size,{width:640,height:360});assert.deepEqual(convertedGuides.at(-1),[]);assert.equal(decoded.length,packets);
 const count=convertedGuides.length;await send({type:'guide-preview',id:72});assert.equal(messages.at(-1).blob,preview.blob);assert.equal(convertedGuides.length,count);
 encodedFrames.length=0;await send({type:'export-video',...settings,id:73});assert.equal(messages.at(-1).type,'video-exported');assert.equal(encodedFrames[0].guides.length,2);assert.deepEqual(encodedFrames.at(-1).guides,photoLines);
 assert.deepEqual(settings.anchors,anchors);assert.equal(photo.centers[0].x,100);assert.equal(photo.centers[0].y,40);assert.equal(photo.centers.at(-1).confidence,'skipped');encodedFrames.length=0;
});

test('calibration origin stays at the first base frame through thinning, and calibrated video holds its matching photo',async()=>{
 const settings={first:2,last:20,reference:8,step:3,factor:3,sensitivity:30,labels:false,grid:{enabled:true,angle:0,vertical:true,horizontal:true,points:false},calibration:{a:{x:40,y:100},b:{x:140,y:50},length:.25,axis:'x',width:320,height:180},anchors:[{index:2,mode:'center',x:100,y:100},{index:8,mode:'center',x:120,y:80},{index:17,mode:'center',x:150,y:65}]};
 const packets=decoded.length;await send({type:'compose',...settings,id:90});const photo=messages.at(-1);assert.equal(photo.type,'composed',JSON.stringify(photo));assert.equal(photo.originCenter.index,2);assert.equal(photo.originCenter.x,100);assert.deepEqual(photo.indices,[8,17]);assert.equal(decoded.length,packets);const photoGuides=convertedGuides.at(-1);
 encodedFrames.length=0;await send({type:'export-video',...settings,id:91});const video=messages.at(-1);assert.equal(video.type,'video-exported',JSON.stringify(video));assert.equal(video.lastSample,17);assert.deepEqual(encodedFrames.at(-1).guides,photoGuides);assert.equal(createHash('sha256').update(encodedFrames.at(-1).pixels).digest('hex'),createHash('sha256').update(new Uint8ClampedArray(await photo.blob.arrayBuffer())).digest('hex'));
});

test('time display precision reaches photo and video labels without changing selected frames or duration',async()=>{
 const settings={first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:true,timeDecimals:2,grid:{enabled:false},anchors:[{index:2,mode:'center',x:100,y:40},{index:8,mode:'center',x:120,y:50}]};
 drawnLabels.length=0;await send({type:'compose',...settings,id:94});const photo=messages.at(-1);assert.equal(photo.type,'composed',JSON.stringify(photo));assert.deepEqual(photo.indices,[2,5,8,11,14,17,20]);assert.deepEqual(drawnLabels,['0.00 s','0.10 s']);
 drawnLabels.length=0;encodedFrames.length=0;await send({type:'export-video',...settings,id:95});const video=messages.at(-1);assert.equal(video.type,'video-exported',JSON.stringify(video));assert.equal(video.lastSample,20);assert.equal(video.count,79);assert(drawnLabels.every(text=>/^\d+\.\d{2} s$/.test(text)));
 drawnLabels.length=0;await send({type:'compose',...settings,timeDecimals:6,id:96});assert.deepEqual(drawnLabels,['0.000000 s','0.100000 s']);
});

test('slow MOV-style edits keep photo, CSV and graph times on source PTS and exported motion on playback time',async()=>{
 const bytes=Buffer.from(await readFile(new URL('./fixtures/projectile.mp4',import.meta.url)));
 const p=bytes.indexOf(Buffer.from('elst'));assert(p>0);
 bytes.writeUInt32BE(7200,p+12);bytes.writeInt16BE(0,p+20);bytes.writeInt16BE(16384,p+22);
 await send({type:'load',file:new Blob([bytes]),id:101});let loaded=messages.at(-1);assert.equal(loaded.type,'loaded');
 assert.equal(loaded.metadata.fps,60);assert.equal(loaded.metadata.hasRateEdits,true);
 assert(Math.abs(loaded.metadata.times[6]-.1)<1e-12);assert(Math.abs(loaded.metadata.playbackTimes[6]-.4)<1e-12);
 const settings={first:1,last:50,reference:13,step:6,factor:1,background:0,maxDimension:640,sensitivity:30,labels:true,timeDecimals:4,grid:{enabled:false},anchors:[{index:1,x:50,y:34,mode:'center'},{index:13,x:80,y:34,mode:'center'}]};
 await send({type:'extract',...settings,id:102});assert.equal(messages.at(-1).type,'extracted');
 drawnLabels.length=0;await send({type:'compose',...settings,id:103});const photo=messages.at(-1);assert.equal(photo.type,'composed');
 assert.deepEqual(drawnLabels,['0.0000 s','0.2000 s']);const c=photo.centers.find(p=>p.index===13);
 assert(Math.abs(c.time-.2)<1e-12);assert(Math.abs(c.recordedTime-13/60)<1e-12);assert(Math.abs(c.playbackTime-13/15)<1e-12);
 const {coordinateRows}=await import('../src/coordinates.js');const rows=coordinateRows({...photo,originCenter:photo.centers[0]});assert.equal(rows[2][1],'0.2000');
 const {graphData}=await import('../src/graph-data.js');
 const data=graphData({...photo,originCenter:photo.centers[0]});assert(Math.abs(data.points[1].t-.2)<1e-12);
 encodedFrames.length=0;await send({type:'export-video',...settings,id:104});const exported=messages.at(-1);assert.equal(exported.type,'video-exported',JSON.stringify(exported));
 assert.equal(exported.count,64);assert.equal(exported.lastSample,49);assert.equal(encodedFrames[1].timestamp,66667);
 assert.equal(createHash('sha256').update(encodedFrames.at(-1).pixels).digest('hex'),createHash('sha256').update(new Uint8ClampedArray(await photo.blob.arrayBuffer())).digest('hex'));
 const parsed=await parseVideo(exported.blob);assert(Math.abs(parsed.clock.times[1]-1/15)<1e-5);
 // An explicit, known capture-fps override affects analysis only; original playback is retained.
 await send({type:'compose',...settings,captureFps:120,id:105});const corrected=messages.at(-1);assert.equal(corrected.type,'composed');
 assert(Math.abs(corrected.centers.find(p=>p.index===13).time-.1)<1e-12);assert.equal(corrected.centers[2].playbackTime,c.playbackTime);
});

test('native decoder failure recovers photo and export with clean per-attempt state',async()=>{
 const Native=globalThis.VideoDecoder;let failureBudget=1,closed=0;
 globalThis.VideoDecoder=class extends Native{
  constructor(callbacks){super(callbacks);this.injectFailure=failureBudget-- >0;}
  decode(chunk){if(this.injectFailure){this.injectFailure=false;this.state='closed';this.callbacks.error(new DOMException('Injected Decoder failure','EncodingError'));return;}super.decode(chunk);}
  close(){closed++;super.close();}
 };
 try{
  const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:910});
  await send({type:'extract',first:1,last:20,reference:7,step:6,background:0,maxDimension:640,id:911});
  assert.equal(messages.at(-1).type,'extracted');
  let report=messages.filter(m=>m.type==='diagnostic'&&m.id===911).at(-1).diagnostics;
  assert.equal(report.recovered,true);assert.equal(report.attempts.length,2);
  await send({type:'compose',first:1,last:20,reference:7,step:6,factor:1,sensitivity:30,labels:false,id:912});
  assert.equal(messages.at(-1).type,'composed');
  failureBudget=1;encodedFrames.length=0;
  await send({type:'export-video',first:1,last:20,reference:7,step:6,factor:1,sensitivity:30,labels:false,id:913});
  assert.equal(messages.at(-1).type,'video-exported');
  report=messages.filter(m=>m.type==='diagnostic'&&m.id===913).at(-1).diagnostics;
  assert.equal(report.recovered,true);assert.equal(report.attempts.length,2);
  const result=messages.at(-1),reparsed=await parseVideo(result.blob);
  assert.equal(reparsed.clock.ordered.length,result.count);assert(closed>=2);
 }finally{globalThis.VideoDecoder=Native;}
});

test('two objects retain separate marks, annotations and tracking identity; video hold matches both-object photo',async()=>{
 twoObjectScene=true;try{
 const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:920});
 const settings={first:1,last:20,reference:7,step:6,factor:1,background:0,maxDimension:640,sensitivity:30,labels:true,grid:{enabled:true,points:false}};
 await send({type:'extract',...settings,id:921});assert.equal(messages.at(-1).type,'extracted');
 const objects=[{id:0,anchors:[{index:1,x:54,y:34,mode:'center',source:'manual'},{index:7,x:66,y:34,mode:'center',source:'manual'}]},{id:1,anchors:[{index:1,x:154,y:70,mode:'center',source:'manual'},{index:7,mode:'skip'},{index:13,x:180,y:70,mode:'center',source:'manual'}]}];
 drawnLabels.length=0;convertedGuides.length=0;await send({type:'compose',...settings,objects,id:922});const photo=messages.at(-1);assert.equal(photo.type,'composed',JSON.stringify(photo));
 assert.equal(photo.objects.length,2);assert.equal(photo.objects[0].centers[0].x,54);assert.equal(photo.objects[1].centers[0].x,154);assert.equal(photo.objects[1].centers[1].confidence,'skipped');assert.equal(photo.objects[0].centers[1].confidence,'manual');assert.equal(photo.originCenter.x,54);
 assert.deepEqual(drawnLabels,['0.0000 s','0.1000 s','0.0000 s','0.2000 s']);const guides=convertedGuides.at(-1);assert(guides.some(p=>p[1]===54));assert(guides.some(p=>p[1]===154));assert(guides.some(p=>p[1]===180));
 encodedFrames.length=0;drawnLabels.length=0;await send({type:'export-video',...settings,objects,id:923});assert.equal(messages.at(-1).type,'video-exported',JSON.stringify(messages.at(-1)));
 assert.deepEqual(encodedFrames.at(-1).guides,guides);
 assert.equal(createHash('sha256').update(encodedFrames.at(-1).pixels).digest('hex'),createHash('sha256').update(new Uint8ClampedArray(await photo.blob.arrayBuffer())).digest('hex'));
 // Tracking returns the requested identity and keeps its protected marks/skips.
 await send({type:'auto-detect',...settings,objectId:1,anchors:objects[1].anchors,seedIndex:1,id:924});const tracked=messages.at(-1);assert.equal(tracked.type,'auto-detected',JSON.stringify(tracked));assert.equal(tracked.objectId,1);assert.equal(tracked.marks.find(p=>p.index===1).x,154);assert.equal(tracked.marks.find(p=>p.index===7).mode,'skip');assert.equal(objects[0].anchors[0].x,54);
 }finally{twoObjectScene=false;}
});

test('delayed encoding retains every moving pose and freezes only requested samples',async()=>{
 const NativeEncoder=globalThis.VideoEncoder,NativeFrame=globalThis.VideoFrame;
 globalThis.VideoFrame=class extends NativeFrame{
  constructor(source,options){super(source,options);if(source.pixels)this.pixels=source.pixels;}
 };
 globalThis.VideoEncoder=class extends NativeEncoder{
  constructor(callbacks){super(callbacks);this.pending=[];}
  configure(config){assert.equal(config.latencyMode,'quality');super.configure(config);}
  encode(frame){this.pending.push({timestamp:frame.timestamp,duration:frame.duration,pixels:frame.pixels,guides:frame.guides});}
  async flush(){for(const frame of this.pending)super.encode(frame);this.pending=[];}
 };
 try{
  const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:990});
  await send({type:'extract',first:2,last:20,reference:8,step:3,background:0,maxDimension:640,id:991});
  encodedFrames.length=0;
  await send({type:'export-video',first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,id:992});
  assert.equal(messages.at(-1).type,'video-exported',JSON.stringify(messages.at(-1)));
  const captured=[2,5,8,11,14,17,20],live=encodedFrames.slice(0,19);
  assert.equal(live.length,19);
  for(let n=0;n<live.length;n++){
   const index=n+2;assert.equal(live[n].timestamp,Math.round(n/60*1e6));
   for(let pose=2;pose<=20;pose++)assert.equal(live[n].pixels[(pose+100)*4],pose===index||(captured.includes(pose)&&pose<=index)?240:100,`moving frame ${index}, pose ${pose}`);
  }
  for(const frame of encodedFrames.slice(19))for(let pose=2;pose<=20;pose++)assert.equal(frame.pixels[(pose+100)*4],captured.includes(pose)?240:100);
 }finally{globalThis.VideoFrame=NativeFrame;globalThis.VideoEncoder=NativeEncoder;}
});

test('240 fps playback does not insert short live frames at off-cadence capture events',async()=>{
 const bytes=Buffer.from(await readFile(new URL('./fixtures/projectile.mp4',import.meta.url))),p=bytes.indexOf(Buffer.from('elst'));assert(p>0);
 // Original 60 fps media is played four times faster, making movie PTS 240 fps.
 bytes.writeUInt32BE(450,p+12);bytes.writeInt16BE(4,p+20);bytes.writeInt16BE(0,p+22);
 await send({type:'load',file:new Blob([bytes]),id:993});assert.equal(messages.at(-1).type,'loaded');
 await send({type:'extract',first:2,last:20,reference:8,step:3,background:0,maxDimension:640,id:994});
 encodedFrames.length=0;await send({type:'export-video',first:2,last:20,reference:8,step:3,factor:1,sensitivity:30,labels:false,id:995});
 assert.equal(messages.at(-1).type,'video-exported',JSON.stringify(messages.at(-1)));
 const live=encodedFrames.slice(0,6),expected=[2,6,10,14,18,20];
 assert.deepEqual(live.map(f=>f.timestamp),expected.map(n=>Math.round((n-2)/240*1e6)));
 const captures=[2,5,8,11,14,17,20];
 for(let n=0;n<live.length;n++)for(let pose=2;pose<=20;pose++)assert.equal(live[n].pixels[(pose+100)*4],pose===expected[n]||(captures.includes(pose)&&pose<=expected[n])?240:100,`movie frame ${expected[n]}, pose ${pose}`);
 const parsed=await parseVideo(messages.at(-1).blob);
 assert.deepEqual(parsed.clock.playbackTimes.slice(0,6),live.map(f=>f.timestamp/1e6));
});

test('late HEVC-style outputs and duplicate callbacks export in exact planned order with matching overlays',async()=>{
 const Native=globalThis.VideoDecoder;
 globalThis.VideoDecoder=class extends Native{
  async flush(){const chunks=this.pending.sort((a,b)=>a.timestamp-b.timestamp);for(let n=0;n<chunks.length;n+=3){
   for(const chunk of chunks.slice(n,n+3).reverse())this.callbacks.output({timestamp:chunk.timestamp,index:Math.round((chunk.timestamp-origin)*60/1e6),close(){}});
   if(n%9===0)this.callbacks.output({timestamp:chunks[n].timestamp,index:Math.round((chunks[n].timestamp-origin)*60/1e6),close(){}});
  }this.pending=[];}
 };
 try{
  origin=undefined;const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:1500});
  const settings={first:2,last:50,reference:2,step:6,factor:1,background:0,maxDimension:640,sensitivity:30,labels:false};
  await send({type:'extract',...settings,id:1501});assert.equal(messages.at(-1).type,'extracted');
  await send({type:'compose',...settings,id:1502});const photo=messages.at(-1);assert.equal(photo.type,'composed');
  encodedFrames.length=0;await send({type:'export-video',...settings,id:1503});assert.equal(messages.at(-1).type,'video-exported',JSON.stringify(messages.at(-1)));
  const live=encodedFrames.slice(0,49);assert.equal(live.length,49);
  for(let n=0;n<live.length;n++){assert.equal(live[n].timestamp,Math.round(n/60*1e6));assert.equal(live[n].pixels[(n+2+100)*4],240);}
  assert.equal(live[5].pixels[(8+100)*4],100);assert.equal(live[6].pixels[(8+100)*4],240);
  assert.equal(createHash('sha256').update(encodedFrames.at(-1).pixels).digest('hex'),createHash('sha256').update(new Uint8Array(await photo.blob.arrayBuffer())).digest('hex'));
 }finally{globalThis.VideoDecoder=Native;}
});

test('a missing planned frame triggers fresh decode recovery rather than exporting an incomplete video',async()=>{
 const Native=globalThis.VideoDecoder;let skip=true;
 globalThis.VideoDecoder=class extends Native{
  async flush(){if(skip){skip=false;this.pending=this.pending.filter(c=>Math.abs(c.timestamp-origin-100000)>1);}await super.flush();}
 };
 try{
  origin=undefined;const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:1510});
  const settings={first:2,last:20,reference:2,step:6,factor:1,background:0,maxDimension:640,sensitivity:30,labels:false};
  skip=false;await send({type:'extract',...settings,id:1511});assert.equal(messages.at(-1).type,'extracted');
  skip=true;encodedFrames.length=0;await send({type:'export-video',...settings,id:1512});assert.equal(messages.at(-1).type,'video-exported',JSON.stringify(messages.at(-1)));
  const report=messages.filter(m=>m.id===1512&&m.type==='diagnostic').at(-1).diagnostics;
  assert.equal(report.recovered,true);assert.equal(report.attempts[0].phase,'復元コマの確認');assert.deepEqual(report.attempts[0].missingFrames,[7]);
  assert.equal(report.attempts.at(-1).status,'成功');
  const parsed=await parseVideo(messages.at(-1).blob);assert.equal(parsed.clock.ordered.length,79);
 }finally{globalThis.VideoDecoder=Native;}
});

test('five-times center dots are identical in the saved photo and exported video hold',async()=>{
 origin=undefined;const bytes=await readFile(new URL('./fixtures/projectile.mp4',import.meta.url));await send({type:'load',file:new Blob([bytes]),id:501});
 const settings={first:2,last:8,reference:2,step:3,factor:1,background:0,maxDimension:640,sensitivity:30,labels:false,grid:{enabled:true,vertical:false,horizontal:false,points:true,pointScale:5},anchors:[{index:2,mode:'center',x:100.125,y:40.25}]};
 await send({type:'extract',...settings,id:502});assert.equal(messages.at(-1).type,'extracted');
 await send({type:'compose',...settings,id:503});assert.equal(messages.at(-1).type,'composed');const photo=structuredClone(convertedGuides.at(-1));assert.deepEqual(photo,[['a',100.125,40.25,15]]);
 encodedFrames.length=0;await send({type:'export-video',...settings,id:504});assert.equal(messages.at(-1).type,'video-exported',JSON.stringify(messages.at(-1)));assert.deepEqual(encodedFrames.at(-1).guides,photo);assert(encodedFrames.every(frame=>frame.guides.some(p=>p[0]==='a'&&p[3]===15)));
});

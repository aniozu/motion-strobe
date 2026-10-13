import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVideo} from '../src/media.js';
import {exportVideo,videoDecodeWindows} from '../src/video-export.js';

test('decode recovery windows bound RGBA bytes while retaining the exact output indices',()=>{
 const indices=Array.from({length:103},(_,i)=>i*2);
 for(const [width,height] of [[768,960],[960,960],[640,360]]){
  const windows=videoDecodeWindows(indices,width,height);
  assert.deepEqual(windows.flat(),indices);
  assert(windows.every(w=>w.length*width*height*4<=32*1024*1024));
 }
 assert.deepEqual(videoDecodeWindows([],768,960),[]);
});

async function fixture(t,{dropFirst=false,cancelRecovery=false,reverse=false}={}){
 const media=await parseVideo(new Blob([await readFile(new URL('./fixtures/baseline.mp4',import.meta.url))]));
 // The same portrait/output size as a 1080 x 1350 input scaled to 960 high.
 media.config={...media.config,codedWidth:1080,codedHeight:1350};
 media.clock={...media.clock,playbackTimes:media.clock.ordered.map((_,i)=>i/30),playbackDurations:media.clock.ordered.map(()=>1/30)};
 const size={width:768,height:960},background=new Uint8ClampedArray(size.width*size.height*4);
 for(let i=0;i<background.length;i+=4)background.set([100,100,100,255],i);
 const cache=new Map([0,51,102].map(i=>[i,new Uint8ClampedArray(background)]));
 const packet=media.mp4.getSample(media.trak,0).data.slice(),config=media.config,encoded=[],decoders=[],encoders=[],reports=[];
 let cancelled=false;
 const install=(name,value)=>{const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});t.after(()=>old?Object.defineProperty(globalThis,name,old):delete globalThis[name]);};
 install('ImageData',class{constructor(data,width,height){Object.assign(this,{data,width,height});}});
 install('EncodedVideoChunk',class{constructor(options){Object.assign(this,options);}});
 install('VideoDecoder',class{
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(callbacks){Object.assign(this,{callbacks,state:'unconfigured',decodeQueueSize:0,chunks:[],held:[]});decoders.push(this);}
  configure(){this.state='configured';}
  output(chunk){const index=media.ptsToIndex.get(chunk.timestamp);if(index===0&&dropFirst)return;this.callbacks.output({timestamp:chunk.timestamp,index,close(){}});}
  decode(chunk){if(!this.chunks.length)assert.equal(chunk.type,'key');this.chunks.push(chunk);if(cancelRecovery&&decoders.length>1&&this.chunks.length===5)cancelled=true;if(reverse||media.ptsToIndex.get(chunk.timestamp)===0)this.held.push(chunk);else this.output(chunk);}
  async flush(){for(const chunk of reverse?this.held.slice().reverse():this.held)this.output(chunk);this.held=[];}
  close(){this.state='closed';this.held=[];}
 });
 install('VideoFrame',class{constructor(data,options){Object.assign(this,options);this.data=data;}close(){}});
 install('VideoEncoder',class{
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(callbacks){Object.assign(this,{callbacks,state:'unconfigured',encodeQueueSize:0,frames:[]});encoders.push(this);}
  configure(config){this.config=config;this.state='configured';}
  encode(frame){this.frames.push({timestamp:frame.timestamp,duration:frame.duration,marker:frame.data[0]});encoded.push(this.frames.at(-1));this.callbacks.output({timestamp:frame.timestamp,type:'key',byteLength:packet.length,copyTo:out=>out.set(packet)},{decoderConfig:config});}
  async flush(){}close(){this.state='closed';}
 });
 install('OffscreenCanvas',class{
  constructor(width,height){this.width=width;this.height=height;const canvas=this;this.pixels=new Uint8ClampedArray(width*height*4);
   this.ctx={save(){},restore(){},translate(){},rotate(){},scale(){},clearRect(){canvas.pixels.fill(0);},fillRect(){canvas.pixels.fill(0);},
    drawImage(source){if(Number.isInteger(source.index)){canvas.pixels.set([source.index+1,10,10,255],0);}else if(source.pixels){for(let i=0;i<canvas.pixels.length;i+=4)if(source.pixels[i+3])canvas.pixels.set(source.pixels.subarray(i,i+4),i);}},
    getImageData(){return new ImageData(new Uint8ClampedArray(canvas.pixels),width,height);},
    putImageData(image){canvas.pixels.set(image.data);},measureText(){return {width:0};},fillText(){},strokeText(){}
   };
  }
  getContext(){return this.ctx;}
 });
 const options={media,cache,background,size,settings:{first:0,last:102,reference:0,step:51,factor:1,sensitivity:30,labels:false,playbackSpeed:1},cancelled:()=>cancelled,onProgress(){},onDiagnostic:report=>{reports.push(structuredClone(report));},setActive(){}};
 return {options,media,cache,decoders,encoders,encoded,reports};
}

for(const reverse of [false,true])test(`portrait export recovers from ${reverse?'deeply reordered':'late first-frame'} output with exact frames and unchanged dimensions`,async t=>{
 const f=await fixture(t,{reverse}),result=await exportVideo(f.options);
 assert(result);assert.deepEqual([result.width,result.height],[768,960]);assert.equal(result.count,133);
 const report=f.reports.at(-1);assert.equal(report.recovered,true);assert.equal(report.attempts[0].errorName,'VideoReorderBufferError');assert.equal(report.attempts.at(-1).windowed,true);
 const successful=f.encoders.at(-1).frames;assert.equal(successful.length,133);
 assert.deepEqual(successful.slice(0,103).map(frame=>frame.marker),Array.from({length:103},(_,i)=>i+1));
 assert.deepEqual(successful.slice(0,103).map(frame=>frame.timestamp),Array.from({length:103},(_,i)=>Math.round(i/30*1e6)));
 assert(successful.slice(103).every(frame=>frame.marker===100));
 const parsed=await parseVideo(result.blob);assert.equal(parsed.clock.ordered.length,133);assert.deepEqual(parsed.clock.playbackTimes,successful.map(frame=>frame.timestamp/1e6));
 assert(f.decoders.length>2);assert(f.decoders.every(d=>d.state==='closed'));assert(f.encoders.every(e=>e.state==='closed'));
});

test('a genuinely absent frame is reported after a bounded window without inventing a pose or overflowing again',async t=>{
 const f=await fixture(t,{dropFirst:true});
 await assert.rejects(exportVideo(f.options),error=>{
  const attempts=error.diagnostics.attempts;
  assert.equal(attempts[0].errorName,'VideoReorderBufferError');
  assert(attempts.slice(1).every(d=>d.phase==='復元コマの確認'&&d.windowed));
  assert(attempts.slice(1).every(d=>JSON.stringify(d.missingFrames)==='[1]'));
  return true;
 });
 assert(f.decoders.every(d=>d.state==='closed'));assert(f.encoders.every(e=>e.state==='closed'));assert.equal(f.cache.size,3);
});

test('cancelling bounded recovery closes codecs and preserves the original photo cache',async t=>{
 const f=await fixture(t,{cancelRecovery:true});assert.equal(await exportVideo(f.options),undefined);
 assert.equal(f.encoders.length,2);assert(f.decoders.every(d=>d.state==='closed'));assert(f.encoders.every(e=>e.state==='closed'));assert.equal(f.cache.size,3);
});

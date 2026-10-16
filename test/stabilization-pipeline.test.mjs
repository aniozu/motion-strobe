// Real FFmpeg-decoded pixels + native canvas rendering. WebCodecs are adapters;
// this validates registration/composition/export pixels, not native browser codecs.
import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {parseVideo} from '../src/media.js';
let canvasModule;for(const root of [import.meta.url,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/entry.js':null].filter(Boolean))try{canvasModule=createRequire(root)('@napi-rs/canvas');break;}catch{}
test('native canvas pipeline preserves the stabilized motion, background, tracking previews and final video photo', {skip:!canvasModule&&'Native canvas adapter unavailable'},async t=>{
 const {createCanvas,ImageData,loadImage}=canvasModule,w=640,h=360,bytes=w*h*4;
 const raw=execFileSync('ffmpeg',['-v','error','-i','dist/stabilization-test-projectile.mp4','-vf',`scale=${w}:${h}`,'-fps_mode','passthrough','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:110*1024*1024}),rawCanvas=createCanvas(w,h),rawCtx=rawCanvas.getContext('2d');
 const sourceBytes=readFileSync('dist/stabilization-test-projectile.mp4'),sourceMetadata=await parseVideo(new Blob([sourceBytes]));
 const messages=[],encoded=[],configs=[],hash=a=>createHash('sha256').update(a).digest('hex');globalThis.self={};globalThis.postMessage=m=>messages.push(m);globalThis.ImageData=ImageData;
 globalThis.OffscreenCanvas=class{
  constructor(w,h){this.width=w;this.height=h;this.native=createCanvas(w,h);const ctx=this.native.getContext('2d');this.ctx=new Proxy(ctx,{get(target,key){if(key==='drawImage')return (image,...args)=>target.drawImage(image.native||image,...args);const value=target[key];return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}});}
  getContext(){return this.ctx;}async convertToBlob(){return new Blob([this.native.toBuffer('image/png')],{type:'image/png'});}
 };
 globalThis.EncodedVideoChunk=class{constructor(data){Object.assign(this,data);}};
 globalThis.VideoDecoder=class{
  static async isConfigSupported(config){return {supported:true,config};}constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.decodeQueueSize=0;this.pending=[];}configure(){this.state='configured';}decode(chunk){this.pending.push(chunk);}close(){this.state='closed';this.pending=[];}
  async flush(){for(const chunk of this.pending.sort((a,b)=>a.timestamp-b.timestamp)){const index=sourceMetadata.ptsToIndex.get(chunk.timestamp);rawCtx.putImageData(new ImageData(new Uint8ClampedArray(raw.subarray(index*bytes,(index+1)*bytes)),w,h),0,0);this.callbacks.output({timestamp:chunk.timestamp,native:rawCanvas,close(){}});}this.pending=[];}
 };
 const packetSource=await parseVideo(new Blob([readFileSync('test/fixtures/baseline.mp4')])),packet=packetSource.mp4.getSample(packetSource.trak,0).data;
 globalThis.VideoFrame=class{constructor(data,options){this.pixels=new Uint8ClampedArray(data);Object.assign(this,options);}close(){}};
 globalThis.VideoEncoder=class{
  static async isConfigSupported(config){return {supported:true,config};}constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.encodeQueueSize=0;}configure(config){this.state='configured';configs.push(config);}close(){this.state='closed';}async flush(){}
  encode(frame){encoded.push({timestamp:frame.timestamp,pixels:frame.pixels});this.callbacks.output({timestamp:frame.timestamp,type:'key',byteLength:packet.length,copyTo:out=>out.set(packet)},{decoderConfig:packetSource.config});}
 };
 await import('../src/worker.js');const send=m=>self.onmessage({data:m});
 await send({type:'load',file:new Blob([readFileSync('dist/stabilization-test-projectile.mp4')]),id:1});assert.equal(messages.at(-1).type,'loaded');
 const settings={first:16,last:88,reference:16,step:6,background:0,backgroundMode:'auto',maxDimension:640,sensitivity:30,factor:1,labels:false};
 const decodePng=async blob=>{const c=createCanvas(w,h);c.getContext('2d').drawImage(await loadImage(Buffer.from(await blob.arrayBuffer())),0,0);return c.getContext('2d').getImageData(0,0,w,h).data;};
 await send({type:'extract',...settings,stabilize:false,id:2});assert.equal(messages.at(-1).type,'extracted');await send({type:'compose',...settings,id:3});const uncorrected=await decodePng(messages.at(-1).blob);
 await send({type:'extract',...settings,stabilize:true,id:4});const extraction=messages.at(-1);assert.equal(extraction.type,'extracted',JSON.stringify(extraction));assert(extraction.stabilization);assert.equal(extraction.size.width,w);
 await send({type:'compose',...settings,id:5});const photo=messages.at(-1);assert.equal(photo.type,'composed');assert.equal(photo.count,13);const corrected=await decodePng(photo.blob),reference=raw.subarray(16*bytes,17*bytes);
 const edgeError=pixels=>{let sum=0,n=0;for(let y=15;y<h-15;y++)for(let x=12;x<w-12;x++){if(x>45&&x<w-50)continue;const p=(y*w+x)*4;for(let c=0;c<3;c++){sum+=(pixels[p+c]-reference[p+c])**2;n++;}}return sum/n;};
 const before=edgeError(uncorrected),after=edgeError(corrected);assert(after<before*.4,`${before} → ${after}`);
 // Material points are tracked on the corrected pixels, in the same coordinate system.
 await send({type:'tracking-preview',index:22,id:6});assert.equal(messages.at(-1).type,'tracking-preview');const preview=await decodePng(messages.at(-1).blob);assert(edgeError(preview)<before*.5);
 const blueCenter=pixels=>{let x=0,y=0,n=0;for(let yy=15;yy<h-15;yy++)for(let xx=35;xx<w-35;xx++){const p=(yy*w+xx)*4;if(pixels[p+2]>pixels[p]+30&&pixels[p+2]>pixels[p+1]+5){x+=xx;y+=yy;n++;}}return n?{x:x/n,y:y/n}:null;};
 const seed=blueCenter(preview);assert(seed);await send({type:'select-center',index:22,...seed,sensitivity:30,id:61});const mark=messages.at(-1).mark;assert(mark);
 await send({type:'auto-detect',...settings,seedIndex:22,anchors:[mark],id:62});const tracking=messages.at(-1);assert.equal(tracking.type,'auto-detected');let measured=0;
 for(const tracked of tracking.marks){if(tracked.mode!=='center'||tracked.uncertain)continue;await send({type:'tracking-preview',index:tracked.index,id:63});const expected=blueCenter(await decodePng(messages.at(-1).blob));assert(expected);assert(Math.hypot(tracked.x-expected.x,tracked.y-expected.y)<4,`${tracked.index}: point left the ball`);measured++;}
 assert(measured>=10,`Only ${measured}/13 corrected frames were tracked`);
 let blue=0;for(let p=0;p<corrected.length;p+=4)if(corrected[p+2]>corrected[p]+25&&corrected[p+2]>corrected[p+1]+5)blue++;assert(blue>80,'The moving ball was erased');
 await send({type:'export-video',...settings,playbackSpeed:.5,id:7});const video=messages.at(-1);assert.equal(video.type,'video-exported',JSON.stringify(video));assert.equal(video.lastSample,88);assert.equal(hash(encoded.at(-1).pixels),hash(corrected));
 for(const frame of encoded.slice(0,-30))assert(edgeError(frame.pixels)<before*.6,'Live background was not stabilized');assert(configs.at(-1).framerate<=60);
 // Rebuilding with correction disabled restores the original pixels and drops transforms.
 await send({type:'extract',...settings,stabilize:false,id:8});assert.equal(messages.at(-1).stabilization,null);await send({type:'compose',...settings,id:9});assert.equal(hash(await decodePng(messages.at(-1).blob)),hash(uncorrected));
 // Manual background uses the same reference frame and handles transparent borders.
 await send({type:'extract',...settings,backgroundMode:'manual',stabilize:true,id:10});assert.equal(messages.at(-1).type,'extracted',JSON.stringify(messages.at(-1)));await send({type:'compose',...settings,id:11});assert.equal(messages.at(-1).type,'composed');assert(edgeError(await decodePng(messages.at(-1).blob))<before*.5);
 // Resampling retains the corrected coordinate system and can use an old off-grid seed.
 const resampled={...settings,first:28,reference:28,backgroundMode:'manual',stabilize:true,reuseTrackingCoordinates:true,trackingSeeds:[22]};
 await send({type:'extract',...resampled,id:12});assert.equal(messages.at(-1).type,'extracted',JSON.stringify(messages.at(-1)));
 await send({type:'tracking-preview',index:22,id:13});assert.equal(messages.at(-1).type,'tracking-preview');
 const retainedSeed=blueCenter(await decodePng(messages.at(-1).blob));assert(retainedSeed);assert(Math.hypot(mark.x-retainedSeed.x,mark.y-retainedSeed.y)<4);
 await send({type:'auto-detect',...resampled,seedIndex:22,anchors:[mark],replay:true,id:14});const replay=messages.at(-1);assert.equal(replay.type,'auto-detected',JSON.stringify(replay));
 assert.deepEqual(replay.marks.map(m=>m.index),[28,34,40,46,52,58,64,70,76,82,88]);assert(replay.marks.filter(m=>m.mode==='center'&&!m.uncertain).length>=8);
 t.diagnostic(`Static-edge mean squared error ${before.toFixed(1)} → ${after.toFixed(1)}; ${blue} ball pixels remain; ${measured}/13 positions follow the corrected ball; ${video.count} rendered export frames; final hold matches the PNG exactly.`);
});

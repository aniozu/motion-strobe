import test from 'node:test';
import assert from 'node:assert/strict';
import {SamplingPreview} from '../src/sampling-preview.js';
import {SamplingPreviewSurface} from '../src/sampling-preview-surface.js';
import {SourcePlayer} from '../src/source-player.js';

const settle=async()=>{for(let n=0;n<6;n++)await Promise.resolve();};
function clockHarness(latencies){
 let time=0,id=0,decodes=0,allocated=0,maxAllocated=0,active=0,maxActive=0;
 const jobs=new Map(),shown=[],disposed=[];
 const schedule=(fn,ms)=>{jobs.set(++id,{at:time+ms,fn});return id;};
 const preview=new SamplingPreview({now:()=>time,schedule,cancel:id=>jobs.delete(id),prepare:(index,{signal})=>{
  active++;maxActive=Math.max(maxActive,active);
  return new Promise(resolve=>schedule(()=>{
   active--;allocated++;maxAllocated=Math.max(maxAllocated,allocated);let freed=false;
   resolve({present(){assert(!freed);assert(!signal.aborted);shown.push({index,time});},dispose(){assert(!freed);freed=true;allocated--;disposed.push(index);}});
  },latencies[decodes++%latencies.length]));
 }});
 return {preview,jobs,shown,disposed,get allocated(){return allocated;},get maxAllocated(){return maxAllocated;},get maxActive(){return maxActive;},async next(late=0){
  const [id,job]=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];jobs.delete(id);time=Math.max(time,job.at)+late;job.fn();await settle();
 }};
}

test('variable decode times below the display period produce exactly uniform visible frames and loop in order',async()=>{
 const h=clockHarness([6,180,32,215,4,90,128]);h.preview.setPlan([3,15,27]);h.preview.start();
 while(h.shown.length<30)await h.next();
 assert.deepEqual(h.shown.map(f=>f.index),Array.from({length:30},(_,i)=>[3,15,27][i%3]));
 assert(h.shown.slice(1).every((f,i)=>f.time-h.shown[i].time===250));
 assert.equal(h.maxActive,1);assert.equal(h.maxAllocated,1);
 h.preview.stop();if(h.jobs.size)await h.next();assert.equal(h.allocated,0);
});

test('a slow decode adjusts the cadence gradually and never causes short catch-up frames',async()=>{
 const h=clockHarness([10,480,30,22,40]);h.preview.setPlan([0,1,2,3,4]);h.preview.start();
 while(h.shown.length<20)await h.next();
 const intervals=h.shown.slice(1).map((f,i)=>f.time-h.shown[i].time);
 assert(intervals.every(n=>n>=250));assert.equal(intervals[0],496);
 for(let n=1;n<intervals.length;n++)assert(intervals[n]>=intervals[n-1]-8,`${intervals[n-1]} -> ${intervals[n]}`);
 h.preview.stop();if(h.jobs.size)await h.next();assert.equal(h.allocated,0);
});

test('late display timers rebase the next deadline instead of racing to catch up',async()=>{
 const h=clockHarness([10]);h.preview.setPlan([0,1,2]);h.preview.start();
 await h.next();await h.next();await h.next(900);
 while(h.shown.length<6)await h.next();
 assert(h.shown.slice(1).every((f,i)=>f.time-h.shown[i].time>=250));
 h.preview.stop();if(h.jobs.size)await h.next();
});

test('one unusually long decode cannot leave the preview permanently slowed',async()=>{
 const h=clockHarness([10,1800,...Array(50).fill(10)]);h.preview.setPlan([0,1,2]);h.preview.start();
 while(h.shown.length<36)await h.next();
 const intervals=h.shown.slice(1).map((f,i)=>f.time-h.shown[i].time);
 assert.equal(intervals[0],1800);assert(intervals.slice(1).every(n=>n>=250&&n<=500));
 assert.equal(intervals.at(-1),250);
 h.preview.stop();if(h.jobs.size)await h.next();assert.equal(h.allocated,0);
});

test('pause discards the next buffered image and a stale decode cannot reappear after a new plan',async()=>{
 const h=clockHarness([20]);h.preview.setPlan([0,10,20]);h.preview.start();await h.next();await h.next();
 assert.equal(h.allocated,1);assert.deepEqual(h.shown.map(f=>f.index),[0]);h.preview.stop();assert.equal(h.allocated,0);assert.equal(h.jobs.size,0);
 h.preview.start();h.preview.setPlan([2,4]);
 while(h.shown.length<3)await h.next();
 assert.deepEqual(h.shown.map(f=>f.index),[0,2,4]);h.preview.stop();if(h.jobs.size)await h.next();assert.equal(h.allocated,0);
});

test('a single extracted frame is displayed once without a decoding loop',async()=>{
 const h=clockHarness([8]);h.preview.setPlan([4]);h.preview.start();await h.next();
 assert.deepEqual(h.shown.map(f=>f.index),[4]);assert.equal(h.jobs.size,0);assert.equal(h.allocated,0);h.preview.stop();
});

class Canvas{
 constructor(){this.hidden=true;this.width=0;this.height=0;this.image=null;}
 setAttribute(){}
 getContext(){return {drawImage:source=>{this.image=source.image;}};}
}
function surfaceHarness(seek){
 const canvases=[],video={videoWidth:3840,videoHeight:2160,currentTime:0,readyState:2,image:'frame 0',insertAdjacentElement(){}};
 const surface=new SamplingPreviewSurface(video,{createCanvas:()=>{const c=new Canvas();canvases.push(c);return c;},seek:seek??(async(video,target)=>{video.currentTime=target.time;video.image='frame '+target.start;return true;})});
 return {surface,video,canvases};
}
test('preparing ahead keeps the visible image, number and playback time on the displayed frame',async()=>{
 const {surface,video,canvases}=surfaceHarness();surface.hold();assert.equal(surface.canvas.image,'frame 0');
 const next=await surface.prepare(8,{start:1,end:1.1,time:1.05});
 assert.equal(video.currentTime,1.05);assert.equal(surface.time,0);assert.equal(surface.frame,null);assert.equal(surface.canvas.image,'frame 0');
 assert.equal(surface.canvas.width,960);assert.equal(surface.canvas.height,540);assert.equal(canvases.length,2);
 next.present();assert.equal(surface.canvas.image,'frame 1');assert.deepEqual(surface.frame,{index:8,time:1.05});assert.equal(surface.time,1.05);
 next.dispose();assert.equal(canvases[1].width,0);assert.equal(canvases[1].height,0);
 const later=await surface.prepare(16,{start:2,end:2.1,time:2.05});assert.equal(surface.time,1.05);assert.equal(surface.frame.index,8);
 later.dispose();surface.hide({restore:true});assert.equal(video.currentTime,1.05);assert(!surface.active);assert.equal(surface.canvas.width,0);
});
test('cancelled and failed seeks never capture a wrongly decoded image',async()=>{
 const abort=new AbortController(),h=surfaceHarness(async()=>{abort.abort();return true;});
 assert.equal(await h.surface.prepare(2,{start:2,time:2.05},{signal:abort.signal}),null);assert.equal(h.canvases.length,1);
 const failed=surfaceHarness(async()=>false);assert.equal(await failed.surface.prepare(2,{start:2,time:2.05}),null);assert.equal(failed.canvases.length,1);
});
test('bottom time controls follow the visible frame while the native player seeks ahead',()=>{
 class Element extends EventTarget{constructor(){super();this.value='0';}setAttribute(){}}
 const video=new Element();Object.assign(video,{duration:20,currentTime:9,paused:true,getAttribute:()=> 'blob:video'});
 const button=new Element(),seek=new Element(),readout=new Element();let displayed=2.5;
 const player=new SourcePlayer({video,button,seek,readout,getTime:()=>displayed,labels:{play:'Play',pause:'Pause'}});
 assert.equal(seek.value,'2.5');video.currentTime=14;video.dispatchEvent(new Event('timeupdate'));assert.equal(seek.value,'2.5');assert.equal(readout.textContent,'0:02 / 0:20');
 displayed=4;player.update();assert.equal(seek.value,'4');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSampling,SamplingPreview,seekPreviewFrame,previewFrameTarget,observePreviewFrames} from '../src/sampling-preview.js';
import {framePlan} from '../src/sampling.js';
import {frameTime} from '../src/frame-clock.js';

const clock=(count,period=1/30)=>({start:0,end:count-1,count,period,times:Array.from({length:count},(_,i)=>i*period)});
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
test('default timers retain their global receiver when stopping before sample loading and advancing previews',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout,jobs=new Map();let id=0;
 // Browser timer methods reject an arbitrary receiver. Node timers do not,
 // so exercise that contract rather than replacing timers with arrow callbacks.
 globalThis.setTimeout=function(fn,ms){if(this!==globalThis)throw TypeError('Illegal invocation');assert.equal(ms,250);jobs.set(++id,fn);return id;};
 globalThis.clearTimeout=function(id){if(this!==globalThis)throw TypeError('Illegal invocation');jobs.delete(id);};
 try{
  const shown=[],preview=new SamplingPreview({show:async index=>{shown.push(index);return true;}});
  assert.doesNotThrow(()=>preview.stop());
  preview.setPlan([1,7,13]);preview.start();await settle();assert.equal(jobs.size,1);
  const [timer,fn]=jobs.entries().next().value;jobs.delete(timer);fn();await settle();assert.deepEqual(shown,[1,7]);
  preview.stop();assert.equal(jobs.size,0);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
function harness(show=async()=>true){
 const calls=[],jobs=new Map();let id=0;
 const p=new SamplingPreview({show:(index,options)=>{calls.push(index);return show(index,options);},schedule:(fn,delay)=>{assert.equal(delay,250);jobs.set(++id,fn);return id;},cancel:id=>jobs.delete(id)});
 return {p,calls,jobs,async tick(){const [id,fn]=jobs.entries().next().value; jobs.delete(id);fn();await settle();}};
}
test('defaults center the selected time range and produce about ten real extracted frames',()=>{
 for(const count of [2,5,10,30,103,512,2696,100000]){
  const s=clock(count);if(count>103)s.start=31;
  const d=initialSampling(s),indices=framePlan(s.start,s.end,d.reference,d.step);
  assert(indices.includes(d.reference));assert(d.reference>=s.start&&d.reference<=s.end);
  assert(Math.abs(frameTime(s,d.reference)-(frameTime(s,s.start)+frameTime(s,s.end))/2)<=s.period/2+1e-8);
  if(s.end-s.start>=10)assert(Math.abs(indices.length-10)<=1);else assert.equal(d.step,1);
 }
});
test('variable timestamps and capture-fps correction keep the center and sampling plan consistent',()=>{
 const s={...clock(100),start:7,end:80,variableTiming:true};
 s.times=s.times.map((t,i)=>t+(i>50?1:0));
 const d=initialSampling(s),indices=framePlan(s.start,s.end,d.reference,d.step,1,{...s,variable:true});
 assert(indices.includes(d.reference));assert(Math.abs(indices.length-10)<=1);
 const middle=(s.times[s.start]+s.times[s.end])/2;assert.equal(Math.abs(frameTime(s,d.reference)-middle),Math.min(...s.times.slice(s.start,s.end+1).map(t=>Math.abs(t-middle))));
 const capture={...s,period:1/120,times:s.times.map((_,i)=>i/120),variableTiming:false};
 const c=initialSampling(capture);assert([43,44].includes(c.reference));assert.equal(c.step,initialSampling({...capture,period:1/30,times:capture.times.map((_,i)=>i/30)}).step);
});
test('preview advances only over the exact extracted plan every quarter second and loops',async()=>{
 const h=harness();h.p.setPlan([3,15,27]);h.p.start();await settle();assert.deepEqual(h.calls,[3]);
 await h.tick();await h.tick();await h.tick();assert.deepEqual(h.calls,[3,15,27,3]);
 h.p.stop();assert.equal(h.jobs.size,0);assert(!h.p.running);
});
test('stop aborts a pending seek; stale completions never schedule another tick',async()=>{
 let complete,signal;const h=harness((_,options)=>{signal=options.signal;return new Promise(r=>complete=r);});
 h.p.setPlan([1,10]);h.p.start();assert.equal(h.jobs.size,0);h.p.stop();assert(signal.aborted);
 complete(true);await settle();assert.equal(h.jobs.size,0);assert.deepEqual(h.calls,[1]);
});
test('changing interval replaces the plan without retaining old timers or overlapping seeks',async()=>{
 const h=harness();h.p.setPlan([0,10,20]);h.p.start();await settle();
 h.p.setPlan([2,8]);await settle();assert.equal(h.jobs.size,1);assert.deepEqual(h.calls,[0,2]);
 await h.tick();assert.deepEqual(h.calls,[0,2,8]);h.p.stop();
});
test('a seek failure stops the preview without an unhandled rejection',async()=>{
 const h=harness(async()=>{throw Error('seek failed');});h.p.setPlan([0,1]);h.p.start();await settle();assert(!h.p.running);assert.equal(h.jobs.size,0);
});
test('native seeks complete on seeked and release listeners when cancelled',async()=>{
 class Video extends EventTarget{constructor(){super();this.currentTime=0;this.readyState=2;this.seeking=false;}pause(){this.paused=true;}}
 const video=new Video(),abort=new AbortController();
 const waiting=seekPreviewFrame(video,.5,{signal:abort.signal});assert.equal(video.currentTime,.5);video.dispatchEvent(new Event('seeked'));assert(await waiting);
 const cancelled=seekPreviewFrame(video,1,{signal:abort.signal});abort.abort();assert.equal(await cancelled,false);
 assert(await seekPreviewFrame(video,1));
});

class PresentedVideo extends EventTarget{
 constructor(){super();this.currentTime=0;this.readyState=2;this.seeking=false;this.frames=new Map();this.id=0;}
 pause(){this.paused=true;}
 requestVideoFrameCallback(fn){this.frames.set(++this.id,fn);return this.id;}
 cancelVideoFrameCallback(id){this.frames.delete(id);}
 present(mediaTime){const callbacks=[...this.frames.values()];this.frames.clear();for(const fn of callbacks)fn(0,{mediaTime});}
}
test('seeking completion alone cannot confirm a displayed preview frame',async()=>{
 const video=new PresentedVideo(),observed=observePreviewFrames(video),target={start:.08,end:.12,time:.10};
 video.present(0);let complete=false;
 const wait=seekPreviewFrame(video,target).then(ok=>{complete=true;return ok;});
 assert.equal(video.currentTime,.10);video.dispatchEvent(new Event('seeked'));await settle();assert(!complete);
 // The player can present an adjacent frame while currentTime already reports
 // the requested time. It must not advance the preview or claim that frame.
 video.present(.04);await settle();assert(!complete);
 video.present(.0799997);assert(await wait);assert.equal(observed.listeners.size,0);assert.equal(video.frames.size,1);
 // A paused, already verified image requires no new presentation callback.
 assert(await seekPreviewFrame(video,target));
});
test('presentation may precede seeked; cancellation removes its pending confirmation',async()=>{
 const video=new PresentedVideo();observePreviewFrames(video);
 let complete=false;
 const wait=seekPreviewFrame(video,{start:.08,end:.12,time:.10}).then(ok=>{complete=true;return ok;});
 video.present(.08);await settle();assert(!complete);video.dispatchEvent(new Event('seeked'));assert(await wait);
 const controller=new AbortController(),observed=observePreviewFrames(video);
 const cancelled=seekPreviewFrame(video,{start:.12,end:.16,time:.14},{signal:controller.signal});
 controller.abort();assert.equal(await cancelled,false);assert.equal(observed.listeners.size,0);
 video.present(.12);assert.equal(observed.listeners.size,0);video.dispatchEvent(new Event('emptied'));assert.equal(observed.mediaTime,null);assert.equal(video.frames.size,1);
});
test('mid-frame targets retain playback timing after capture-fps correction and use the last-frame duration',()=>{
 const state={count:3,period:1/240,times:[0,1/240,2/240],playbackTimes:[.02,.06,.18],playbackDurations:[.04,.12,.01]};
 assert.deepEqual(previewFrameTarget(state,1),{start:.06,end:.18,time:.12});
 const last=previewFrameTarget(state,2,.185);assert.equal(last.start,.18);assert.equal(last.end,.185);assert(last.time>.18&&last.time<.185);
});

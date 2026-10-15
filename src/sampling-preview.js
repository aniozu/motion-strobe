import {framePlan} from './sampling.js';
import {frameTime,indexAtTime} from './frame-clock.js';

// Choose the interval using the same plan as extraction, including variable PTS.
export function initialSampling(state,target=10){
 const reference=Math.max(state.start,Math.min(state.end,indexAtTime(state,(frameTime(state,state.start)+frameTime(state,state.end))/2)));
 const span=(frameTime(state,state.end)-frameTime(state,state.start))/state.period,max=Math.max(1,Math.floor(span+1e-8)),ideal=span/Math.max(1,target-1);
 const candidates=new Set([1,Math.max(1,Math.min(max,Math.round(ideal)))]);
 for(let n=Math.max(2,target-3);n<=target+3;n++)for(const step of [Math.floor(span/(n-1)),Math.ceil(span/(n-1))])candidates.add(Math.max(1,Math.min(max,step)));
 let best=null;
 for(const step of candidates){
  const count=framePlan(state.start,state.end,reference,step,1,{...state,variable:state.variableTiming}).length;
  const score=[Math.abs(count-target),Math.abs(step-ideal)];
  if(!best||score[0]<best.score[0]||score[0]===best.score[0]&&score[1]<best.score[1])best={reference,step,score};
 }
 return {reference:best.reference,step:best.step};
}

// Prepare one image ahead while the current image remains on screen. Display
// deadlines use a monotonic clock; a late frame never triggers catch-up bursts.
export class SamplingPreview{
 constructor({show,prepare,onPresent=()=>{},onChange=()=>{},delay=250,now=()=>globalThis.performance.now(),schedule=(fn,ms)=>globalThis.setTimeout(fn,ms),cancel=id=>globalThis.clearTimeout(id)}){
  Object.assign(this,{show,prepare,onPresent,onChange,delay,now,schedule,cancel,indices:[],position:0,running:false,sequence:0,interval:delay});
 }
 setPlan(indices){
  if(indices.length===this.indices.length&&indices.every((n,i)=>n===this.indices[i]))return;
  const resume=this.running;this.stop();this.indices=[...indices];this.position=0;this.interval=this.delay;if(resume)this.start();
 }
 start(){
  if(this.running||!this.indices.length)return;
  this.running=true;this.onChange(true);const sequence=++this.sequence;
  this.abort=new AbortController();this.lastPresented=null;
  if(this.prepare)this.bufferNext(sequence,this.abort.signal);else this.advance(sequence,this.abort.signal);
 }
 async bufferNext(sequence,signal){
  if(sequence!==this.sequence||!this.running||signal.aborted)return;
  const began=this.now();let frame;
  try{frame=await this.prepare(this.indices[this.position],{signal});}catch{}
  if(sequence!==this.sequence||!this.running||signal.aborted){frame?.dispose?.();return;}
  if(!frame||typeof frame.present!=='function'){frame?.dispose?.();this.stop();return;}
  this.prepared=frame;
  // Leave headroom on slower decoders, then return toward 250 ms gradually.
  // The first image is immediate; subsequent images get a full display period.
  if(this.lastPresented!==null){
   const needed=Math.max(this.delay,Math.min(this.delay*2,this.now()-began+16));
   this.interval=needed>this.interval?needed:Math.max(needed,this.interval-8);
  }
  const due=this.lastPresented===null?this.now():this.lastPresented+this.interval;
  const present=()=>{
   this.timer=null;
   if(sequence!==this.sequence||!this.running||signal.aborted)return;
   const remaining=due-this.now();
   if(remaining>0){this.timer=this.schedule(present,remaining);return;}
   this.prepared=null;
   try{frame.present();this.onPresent(this.indices[this.position]);}
   catch{frame.dispose?.();this.stop();return;}
   frame.dispose?.();this.lastPresented=this.now();
   if(this.indices.length>1){this.position=(this.position+1)%this.indices.length;this.bufferNext(sequence,signal);}
  };
  if(due<=this.now())present();else this.timer=this.schedule(present,due-this.now());
 }
 async advance(sequence,signal){
  if(sequence!==this.sequence||!this.running||signal.aborted)return;
  let shown=false;
  try{shown=await this.show(this.indices[this.position],{signal});}catch{}
  if(sequence!==this.sequence||!this.running||signal.aborted)return;
  if(shown===false){this.stop();return;}
  this.timer=this.schedule(()=>{this.position=(this.position+1)%this.indices.length;this.advance(sequence,signal);},this.delay);
 }
 stop(){this.cancel(this.timer);this.timer=null;this.sequence++;this.abort?.abort();this.prepared?.dispose?.();this.prepared=null;this.running=false;this.onChange(false);}
}

// Seek inside a frame's presentation interval, not onto its rounded boundary.
// Playback PTS remain independent from the experiment's capture-fps correction.
export function previewFrameTarget(clock,index,duration=Infinity){
 const start=frameTime(clock,index,true),count=clock.playbackTimes?.length||clock.times?.length||clock.count;
 const next=index+1<count?frameTime(clock,index+1,true):NaN;
 const lastDuration=clock.playbackDurations?.[index]||(index>0?start-frameTime(clock,index-1,true):clock.period);
 const end=Math.min(Number.isFinite(duration)&&duration>start?duration:Infinity,Number.isFinite(next)?next:start+lastDuration);
 return {start,end,time:start+(end-start)/2};
}

const presentations=new WeakMap();
// One callback per newly presented frame; paused video does not poll or decode
// extra images. Start before loading so seeking within an already shown frame
// can reuse its presentation timestamp without waiting for another callback.
export function observePreviewFrames(video,onPresented){
 if(typeof video.requestVideoFrameCallback!=='function')return null;
 let observed=presentations.get(video);
 if(!observed){
  observed={mediaTime:null,listeners:new Set()};presentations.set(video,observed);
  const request=()=>{observed.callback=video.requestVideoFrameCallback((_,metadata)=>{
   observed.mediaTime=metadata.mediaTime;request();for(const listener of [...observed.listeners])listener();
  });};
  video.addEventListener('emptied',()=>{observed.mediaTime=null;video.cancelVideoFrameCallback?.(observed.callback);request();});
  request();
 }
 if(onPresented)observed.listeners.add(onPresented);
 return observed;
}
export function presentedPreviewTime(video){return presentations.get(video)?.mediaTime;}

export function seekPreviewFrame(video,target,{signal,timeout=4000}={}){
 const range=typeof target==='number'?null:target,time=range?range.time:target;
 const observed=range?observePreviewFrames(video):null;
 return new Promise(resolve=>{
  if(signal?.aborted)return resolve(false);
  const atTarget=()=>range?video.currentTime>=range.start-.0001&&video.currentTime<range.end:Math.abs(video.currentTime-time)<.0001;
  let timer,finished=false,seeked=!video.seeking&&video.readyState>=2&&(observed?atTarget():Math.abs(video.currentTime-time)<.0001);
  const done=ok=>{if(finished)return;finished=true;clearTimeout(timer);observed?.listeners.delete(check);for(const event of ['seeked','error','emptied'])video.removeEventListener(event,finish);signal?.removeEventListener('abort',abort);resolve(ok);};
  const check=()=>{
   if(!seeked||video.seeking||video.readyState<2||!atTarget())return;
   // currentTime reflects the request, not necessarily the image on screen.
   // Match the actual frame PTS when the browser exposes it.
   if(observed&&(observed.mediaTime===null||Math.abs(observed.mediaTime-range.start)>Math.min(.0001,(range.end-range.start)/4)))return;
   done(true);
  };
  const finish=event=>{if(event.type!=='seeked')return done(false);seeked=true;check();},abort=()=>done(false);
  video.pause();
  if(observed)observed.listeners.add(check);
  check();if(finished)return;
  for(const event of ['seeked','error','emptied'])video.addEventListener(event,finish);
  signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>done(false),timeout);
  try{video.currentTime=time;}catch{done(false);}
 });
}

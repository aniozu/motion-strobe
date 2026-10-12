import {frameTime,indexAtTime} from './frame-clock.js';
import {formatSeconds} from './format.js';
export function samplingLimits(state){
 const seconds=frameTime(state,state.end)-frameTime(state,state.start);
 return {seconds,frames:Math.max(1,Math.floor(seconds/state.period+1e-8))};
}
export function bindFrameInput(input,{point,getState,onChange}){
 let edited=false;
 // A rounded display value must never be read back after a frame nudge.
 // Only an actual edit to the seconds field chooses a frame by timestamp.
 input.oninput=()=>{edited=true;};
 input.onchange=()=>{
  if(!edited)return;
  edited=false;
  const value=input.value.trim()===''?NaN:Number(input.value);
  if(Number.isFinite(value))onChange(point,indexAtTime(getState(),value));
  update();
 };
 function update(){
  edited=false;const state=getState(),[low,high]=pointBounds(state,point);
  input.value=formatSeconds(frameTime(state,state[point]));
  input.min=String(frameTime(state,low));input.max=String(frameTime(state,high));
 }
 input.onkeydown=event=>{
  if(!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const state=getState(),[low,high]=pointBounds(state,point);
  const value=Math.max(low,Math.min(high,state[point]+(event.key==='ArrowUp'?1:-1)));
  if(value!==state[point])onChange(point,value);
  update();
 };
 return {update};
}
export function pointBounds(state,point){
 const max=Math.max(0,state.count-1);
 if(point==='start')return [0,Math.max(0,state.end-1)];
 if(point==='end')return [Math.min(max,state.start+1),max];
 if(point==='reference')return [state.start,state.end];
 return [0,max];
}
export function bindFrameNudges({buttons,getState,onChange}){
 const controls=[...buttons];
 for(const b of controls)b.onclick=()=>{const s=getState(),point=b.dataset.timePoint,[low,high]=pointBounds(s,point),value=Math.max(low,Math.min(high,s[point]+Number(b.dataset.nudge)));if(value!==s[point])onChange(point,value);};
 return {update(){const s=getState();for(const b of controls){const [low,high]=pointBounds(s,b.dataset.timePoint),v=s[b.dataset.timePoint];b.disabled=Number(b.dataset.nudge)<0?v<=low:v>=high;}}};
}

export function applyTimePoint(state,point,value,autoBackground,video){
 value=Math.max(0,Math.min(state.count-1,Math.round(value)));
 if(point==='start'){
  state.start=Math.min(value,state.end-1);
  if(autoBackground)state.background=indexAtTime(state,Math.max(0,frameTime(state,state.start)-.1));
  state.reference=Math.max(state.start,Math.min(state.end,state.reference));
 }else if(point==='end'){
  state.end=Math.max(value,state.start+1);state.reference=Math.max(state.start,Math.min(state.end,state.reference));
 }else if(point==='reference')state.reference=Math.max(state.start,Math.min(state.end,value));
 else {state.background=value;autoBackground=false;}
 video.pause();video.currentTime=frameTime(state,state[point],true);
 return autoBackground;
}

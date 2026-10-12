import {frameTime} from './frame-clock.js';
// A selected-frame label describes a paused, fully sought frame, never a playing clip.
export function previewFrameRole(state,point,video){
 const selected=state.stage==='range'&&['start','end'].includes(point)||state.stage==='sampling'&&point==='reference';
 if(!selected||!video.paused||video.seeking||video.hidden)return null;
 const target=frameTime(state,state[point],true);
 return Number.isFinite(video.currentTime)&&Math.abs(video.currentTime-target)<.0001?point:null;
}

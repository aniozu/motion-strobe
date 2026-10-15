import {frameTime,indexAtTime} from './frame-clock.js';
import {presentedPreviewTime,previewFrameTarget} from './sampling-preview.js';
// A selected-frame label describes a paused, fully sought frame, never a playing clip.
export function previewFrameRole(state,point,video){
 const selected=state.stage==='range'&&(['start','end'].includes(point)||point==='background'&&state.backgroundMode==='manual')||state.stage==='sampling'&&point==='reference';
 if(!selected||!video.paused||video.seeking||video.hidden)return null;
 const target=frameTime(state,state[point],true);
 return Number.isFinite(video.currentTime)&&Math.abs(video.currentTime-target)<.0001?point:null;
}

// Automatic extraction previews keep their own identity, including the reference
// frame. A manual reference selection deliberately restores the reference label.
export function previewFrameInfo(state,point,video,indices=[]){
 if(state.stage==='sampling'&&state.samplingPreviewMode==='manual')return null;
 if(state.stage==='sampling'&&state.samplingPreviewMode==='extract'){
  if(!video.paused||video.seeking||video.hidden||!Number.isFinite(video.currentTime))return null;
  const presented=presentedPreviewTime(video);if(presented===null)return null;
  const time=presented??video.currentTime;
  let index=indexAtTime(state,time,true);
  // Without presentation metadata, currentTime falls within the frame interval
  // rather than necessarily on its PTS; nearest-timestamp lookup can pick next.
  if(presented===undefined&&frameTime(state,index,true)>time+1e-9)index--;
  const position=indices.indexOf(index);if(position<0)return null;
  const {start,end}=previewFrameTarget(state,index,video.duration);
  if(video.currentTime<start-.0001||video.currentTime>=end)return null;
  return {role:'extract',position:position+1,total:indices.length};
 }
 const role=previewFrameRole(state,point,video);
 return role?{role}:null;
}

export function stablePreviewFrameInfo(state,point,video,indices,lastInfo=null){
 const info=previewFrameInfo(state,point,video,indices);
 if(info)return info;
 // Seeking changes currentTime before the next image is decoded. Keep the
 // previous displayed frame's label and border until the seek finishes.
 if(state.stage==='sampling'&&state.samplingPreviewMode==='extract'&&video.paused&&!video.hidden&&lastInfo?.role==='extract')return lastInfo;
 return null;
}

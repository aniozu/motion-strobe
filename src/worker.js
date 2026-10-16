import {shutterAudioConfig} from './shutter-audio.js';
import {decodeRange,runDecodeRecovery,DecodeFailure} from './decode-recovery.js';
import {analysisClock,frameTime} from './frame-clock.js';
import {setTimeDecimals} from './format.js';
import {withCalibrationOrigin,coordinateOrigin} from './calibration.js';
import {parseVideo} from './media.js';
import {exportVideo} from './video-export.js';
import {framePlan,outputSize} from './sampling.js';
import {backgroundIndices,estimateBackground} from './background.js';
import {foregroundMask,mergeLayer,drawAnnotations,drawCornerBadge} from './annotations.js';
import {pickObjectCenter,centersFromMarks,findCandidates,trackCandidates} from './tracking.js';
import {trackSelectedPoint} from './point-tracking.js';
import {registerFrames} from './stabilization.js';
let media,cache=new Map(),background,size,job=0,activeDecoder,activeEncoder,photoBase=null,stabilization=null;
const yieldTurn=()=>new Promise(r=>setTimeout(r,0));
function centersFor(m,marks=m.anchors||[]){
 const clock=analysisClock(media.clock,m.captureFps);
 return centersFromMarks(framePlan(m.first,m.last,m.reference,m.step,1,clock),marks,size.width,size.height)
  .map(p=>({...p,time:frameTime(clock,p.index)-frameTime(clock,m.first),recordedTime:frameTime(media.clock,p.index),playbackTime:frameTime(media.clock,p.index,true),approximate:false}));
}
function tracksFor(m){
 return (m.objects||[{id:0,anchors:m.anchors||[]}]).map((object,n)=>({id:object.id??n,centers:centersFor(m,object.anchors||[])}));
}
self.onmessage=async({data:m})=>{
 if(Number.isInteger(m.timeDecimals))setTimeDecimals(m.timeDecimals);
 const send=(type,data={})=>postMessage({type,id:m.id,...data});
 if(m.type==='cancel'){job++;if(activeDecoder?.state!=='closed')activeDecoder?.close();if(activeEncoder?.state!=='closed')activeEncoder?.close();send('cancelled');return;}
 const current=++job;
 try{
 if(m.type==='load'){
  media=null;cache.clear();background=null;photoBase=null;stabilization=null;
  if(typeof VideoDecoder==='undefined'||typeof OffscreenCanvas==='undefined')throw Error('このブラウザーは正確なコマ抽出に対応していません。Chrome、Edge、Safariを最新にしてお試しください。');
  const parsed=await parseVideo(m.file,p=>{if(job!==current)throw Error('キャンセル');send('progress',{stage:'動画を読み込み中',value:p*.9});});if(job!==current)return;
  if(!(await VideoDecoder.isConfigSupported(parsed.config)).supported)throw Error('この動画形式はブラウザーで処理できません。H.264形式のMP4でお試しください。');
  media=parsed;const {clock,track,rotation}=media;
  send('loaded',{metadata:{fps:clock.fps,period:clock.period,times:clock.times,playbackTimes:clock.playbackTimes,variableTiming:clock.variable,hasRateEdits:clock.hasRateEdits,count:clock.ordered.length,width:rotation%180?track.video.height:track.video.width,height:rotation%180?track.video.width:track.video.height,rotation,codec:track.codec,approximateTiming:clock.approximate,canShutterSound:!!(await shutterAudioConfig()),canExportVideo:typeof VideoEncoder!=='undefined'}});
 }else if(m.type==='extract'){
  if(!media)throw Error('動画を選び直してください。');
  const previousReference=m.reuseTrackingCoordinates?stabilization?.referenceIndex:null;
  cache=new Map();const extractionCache=cache;background=null;photoBase=null;stabilization=null;
  const targets=framePlan(m.first,m.last,m.reference,m.step,1,analysisClock(media.clock,m.captureFps));if(targets.length>240)throw Error('画像が多すぎます。時間間隔を広げるか、範囲を短くしてください（最大240枚）。');
  const autoBackground=m.backgroundMode==='auto';
  const backgroundTargets=autoBackground?backgroundIndices(m.first,m.last,analysisClock(media.clock,m.captureFps)):[m.background];
  const fallbackReferenceIndex=Math.floor(m.first+(m.last-m.first)*.25);
  const referenceIndex=Number.isInteger(previousReference)?previousReference:m.first;
  const trackingSeeds=(m.trackingSeeds||[]).filter(index=>Number.isInteger(index)&&index>=0&&index<media.clock.ordered.length);
  const required=new Set([...targets,...backgroundTargets,...trackingSeeds,...(m.stabilize?[referenceIndex,fallbackReferenceIndex]:[])]);const rotated=media.rotation%180!==0;
  size=outputSize(rotated?media.track.video.height:media.track.video.width,rotated?media.track.video.width:media.track.video.height,required.size,m.maxDimension);
  const canvas=new OffscreenCanvas(size.width,size.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const extracted=await runDecodeRecovery({media,operation:'コマ抽出',requested:{first:m.first+1,last:m.last+1,background:m.background+1,frames:targets.length},cancelled:()=>job!==current,
   onDiagnostic:diagnostics=>send('diagnostic',{diagnostics}),onRetry:(attempt,label)=>send('progress',{stage:`自動再試行 ${attempt}/3 · ${label}`,value:0}),
   run:async(strategy,diagnostic)=>{
    cache.clear();ctx.clearRect(0,0,size.width,size.height);
    await decodeRange({media,first:Math.min(...required),last:Math.max(...required),strategy,diagnostic,cancelled:()=>job!==current,
     setActive:decoder=>{if(decoder||job===current)activeDecoder=decoder;},
     onProgress:p=>send('progress',{stage:`画像を抽出中 ${cache.size}/${required.size}${diagnostic.attempt>1?` · 再試行${diagnostic.attempt}`:''}`,value:p*(m.stabilize?.8:.9)}),
     onFrame:(frame,index)=>{
      if(job!==current||!required.has(index)||cache.has(index))return;
      ctx.save();try{ctx.clearRect(0,0,size.width,size.height);ctx.translate(size.width/2,size.height/2);ctx.rotate(media.rotation*Math.PI/180);
       const w=rotated?size.height:size.width,h=rotated?size.width:size.height;ctx.drawImage(frame,-w/2,-h/2,w,h);
      }finally{ctx.restore();}
      cache.set(index,ctx.getImageData(0,0,size.width,size.height).data);
     }});
    if(job!==current)return;
    const missing=[...required].filter(index=>!cache.has(index));
    if(missing.length)throw new DecodeFailure(Error('指定したコマを全て抽出できませんでした。'),{...diagnostic,phase:'必要なコマの確認',missingFrames:missing.slice(0,16).map(n=>n+1)});
    return true;
   }});
  if(extracted&&job===current){
   let referencePixels;
   if(m.stabilize){
    referencePixels=cache.get(referenceIndex);
    const registration=await registerFrames({indices:[...required].sort((a,b)=>a-b),getFrame:index=>cache.get(index),width:size.width,height:size.height,referenceIndex,fallbackReferenceIndex,timeForIndex:index=>frameTime(media.clock,index,true),cancelled:()=>job!==current,yieldTurn,onProgress:p=>send('progress',{stage:'背景を照合してカメラの動きを補正中',value:.8+p*.15})});
    if(!registration||job!==current)return;
    const aligned=new OffscreenCanvas(size.width,size.height),alignedCtx=aligned.getContext('2d',{willReadFrequently:true});
    for(const index of required){
     if(job!==current)return;ctx.putImageData(new ImageData(cache.get(index),size.width,size.height),0,0);alignedCtx.clearRect(0,0,size.width,size.height);alignedCtx.save();try{alignedCtx.transform(...registration.transforms.get(index));alignedCtx.drawImage(canvas,0,0);}finally{alignedCtx.restore();}
     cache.set(index,alignedCtx.getImageData(0,0,size.width,size.height).data);await yieldTurn();
    }
    stabilization={...registration,videoTransforms:new Map(registration.transforms)};
   }
   let estimated;
   try{estimated=autoBackground?await estimateBackground(backgroundTargets.map(index=>cache.get(index)),{cancelled:()=>job!==current,yieldTurn,onProgress:p=>send('progress',{stage:'背景を自動作成中',value:(m.stabilize?.95:.9)+p*(m.stabilize?.05:.1)})}):cache.get(m.background);}
   finally{const retained=new Set([...targets,...trackingSeeds]);for(const index of extractionCache.keys())if(!retained.has(index))extractionCache.delete(index);}
   if(job!==current)return;
   if(referencePixels){estimated=new Uint8ClampedArray(estimated);for(let p=0;p<estimated.length;p+=4)if(estimated[p+3]<255)estimated.set(referencePixels.subarray(p,p+4),p);}
   background=estimated;
   send('extracted',{size,indices:targets,backgroundMode:autoBackground?'auto':'manual',stabilization:stabilization?.summary||null});
  }
 }else if(m.type==='select-center'){
  const frame=cache.get(m.index);if(!frame||!Number.isFinite(m.x)||!Number.isFinite(m.y))throw Error('このコマを表示し直してから指定してください。');
  const picked=pickObjectCenter(background,frame,size.width,size.height,m.x,m.y,m.sensitivity);
  if(job===current)send('center-selected',{mark:{index:m.index,...picked,mode:'center',spaceWidth:size.width,spaceHeight:size.height}});
 }else if(m.type==='auto-detect'){
  if(!background)throw Error('写真を作成してから物体を選んでください。');
  const targets=framePlan(m.first,m.last,m.reference,m.step,1,analysisClock(media.clock,m.captureFps)),wanted=new Set(targets);
  const indices=[...new Set([...targets,...(m.replay&&cache.has(m.seedIndex)?[m.seedIndex]:[])])].sort((a,b)=>a-b);
  if(m.trackingMode==='point'){
   const marks=await trackSelectedPoint({indices,getFrame:index=>cache.get(index),background,width:size.width,height:size.height,marks:m.anchors||[],seedIndex:m.seedIndex,sensitivity:m.sensitivity,cancelled:()=>job!==current,yieldTurn,onProgress:value=>send('progress',{stage:'指定した点の色・回転を照合中',value})});
   if(marks&&job===current)send('auto-detected',{marks:marks.filter(mark=>wanted.has(mark.index)),objectId:m.objectId??0});
   return;
  }
  const frames=[];
  for(let n=0;n<indices.length;n++){
   if(job!==current)return;const index=indices[n],frame=cache.get(index);
   if(!frame)throw Error('画像が不足しています。写真を作り直してください。');
   const mark=(m.anchors||[]).find(a=>a.index===index&&a.source!=='auto'&&a.mode==='center');
   const tap=mark?{x:mark.x*size.width/(mark.spaceWidth||size.width),y:mark.y*size.height/(mark.spaceHeight||size.height)}:null;
   const candidates=findCandidates(foregroundMask(background,frame,m.sensitivity,size.width).pixels,frame,size.width,size.height,background,tap?{tap,all:true}:{all:true});
   frames.push({index,candidates});send('progress',{stage:`物体を検出中 ${n+1}/${indices.length}`,value:.9*(n+1)/indices.length});await yieldTurn();
  }
  if(job!==current)return;
  send('progress',{stage:'コマ間の動きを照合中',value:.95});await yieldTurn();if(job!==current)return;
  const marks=trackCandidates(frames,size.width,size.height,m.anchors||[],m.seedIndex);
  if(job===current)send('auto-detected',{marks:marks.filter(mark=>wanted.has(mark.index)),objectId:m.objectId??0});
 }else if(m.type==='guide-preview'){
  if(!photoBase)throw Error('写真を作成してからグリッドを設定してください。');
  if(!photoBase.blob){
   const canvas=new OffscreenCanvas(size.width,size.height);
   canvas.getContext('2d').putImageData(new ImageData(photoBase.pixels,size.width,size.height),0,0);
   const blob=await canvas.convertToBlob({type:'image/png'});if(job!==current)return;photoBase.blob=blob;
  }
  if(job===current)send('guide-preview',{blob:photoBase.blob,size});
 }else if(m.type==='tracking-preview'){
  const frame=cache.get(m.index);if(!frame)throw Error('このコマは抽出されていません。写真を作り直してください。');
  const canvas=new OffscreenCanvas(size.width,size.height);canvas.getContext('2d').putImageData(new ImageData(frame,size.width,size.height),0,0);
  const blob=await canvas.convertToBlob({type:'image/png'});if(job===current)send('tracking-preview',{blob,index:m.index,size});
 }else if(m.type==='export-video'){
  if(!media||!background)throw Error('写真を作成してから動画を作成してください。');
  const tracks=tracksFor(m),centers=tracks.flatMap(o=>o.centers.map(p=>({...p,objectId:o.id})));
  const result=await exportVideo({media,cache,background,size,stabilization,settings:{...m,centers,calibration:withCalibrationOrigin(m.calibration,[coordinateOrigin({objects:tracks})],size)},cancelled:()=>job!==current,onProgress:p=>send('progress',p),onDiagnostic:diagnostics=>send('diagnostic',{diagnostics}),setActive:(decoder,encoder)=>{if(decoder||job===current){activeDecoder=decoder;activeEncoder=encoder;}}});
  if(result&&job===current)send('video-exported',{...result,stabilization:stabilization?{...stabilization.summary,videoEstimatedFrames:stabilization.videoEstimatedIndices?.size||0}:null});
 }else if(m.type==='compose'){
  if(!background)throw Error('画像を抽出してください。');const indices=framePlan(m.first,m.last,m.reference,m.step,m.factor,analysisClock(media.clock,m.captureFps));
  const tracks=tracksFor(m),originCenter=coordinateOrigin({objects:tracks}),centers=tracks.flatMap(o=>o.centers.filter(p=>indices.includes(p.index)).map(p=>({...p,objectId:o.id})));
  const key=JSON.stringify([indices,m.sensitivity]);
  if(photoBase?.key!==key){
   const out=new Uint8ClampedArray(background);
   for(let n=0;n<indices.length;n++){
    if(job!==current)return;const frame=cache.get(indices[n]);if(!frame)throw Error('画像が不足しています。範囲の画面から作り直してください。');
    mergeLayer(out,foregroundMask(background,frame,m.sensitivity,size.width).pixels);
    if(n%3===0){send('progress',{stage:`写真を合成中 ${n+1}/${indices.length}`,value:.9*(n+1)/indices.length});await yieldTurn();}
   }
   if(job!==current)return;photoBase={key,pixels:out};
  }
  if(job!==current)return;
  const canvas=new OffscreenCanvas(size.width,size.height),ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(photoBase.pixels,size.width,size.height),0,0);
  drawAnnotations(ctx,centers,size.width,size.height,{...m,calibration:withCalibrationOrigin(m.calibration,[originCenter],size)});
  if(m.photoRate)drawCornerBadge(ctx,size.width,size.height,`${m.samplingRate.toFixed(1)} コマ/秒`);
  send('progress',{stage:'指定したグリッドを反映中',value:.95});
  const blob=await canvas.convertToBlob({type:'image/png'});if(job!==current)return;send('composed',{blob,count:indices.length,centers:tracks[0].centers.filter(p=>indices.includes(p.index)),objects:tracks.map(o=>({...o,centers:o.centers.filter(p=>indices.includes(p.index))})),size,indices,originCenter});
 }
 }catch(e){if(job===current)send('error',{message:e.message||String(e),diagnostics:e.diagnostics||null});}
};

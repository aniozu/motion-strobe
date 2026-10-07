import {shutterAudioConfig} from './shutter-audio.js';
import {decodeRange,runDecodeRecovery,DecodeFailure} from './decode-recovery.js';
import {analysisClock,frameTime} from './frame-clock.js';
import {setTimeDecimals} from './format.js';
import {withCalibrationOrigin} from './calibration.js';
import {parseVideo} from './media.js';
import {exportVideo} from './video-export.js';
import {framePlan,outputSize} from './sampling.js';
import {foregroundMask,mergeLayer,drawAnnotations,drawCornerBadge} from './annotations.js';
import {pickObjectCenter,centersFromMarks,findCandidates,trackCandidates} from './tracking.js';
let media,cache=new Map(),background,size,job=0,activeDecoder,activeEncoder,photoBase=null;
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
  media=null;cache.clear();background=null;photoBase=null;
  if(typeof VideoDecoder==='undefined'||typeof OffscreenCanvas==='undefined')throw Error('このブラウザーは正確なコマ抽出に対応していません。Chrome、Edge、Safariを最新にしてお試しください。');
  const parsed=await parseVideo(m.file,p=>{if(job!==current)throw Error('キャンセル');send('progress',{stage:'動画を読み込み中',value:p*.9});});if(job!==current)return;
  if(!(await VideoDecoder.isConfigSupported(parsed.config)).supported)throw Error('この動画形式はブラウザーで処理できません。H.264形式のMP4でお試しください。');
  media=parsed;const {clock,track,rotation}=media;
  send('loaded',{metadata:{fps:clock.fps,period:clock.period,times:clock.times,playbackTimes:clock.playbackTimes,variableTiming:clock.variable,hasRateEdits:clock.hasRateEdits,count:clock.ordered.length,width:rotation%180?track.video.height:track.video.width,height:rotation%180?track.video.width:track.video.height,rotation,codec:track.codec,approximateTiming:clock.approximate,canShutterSound:!!(await shutterAudioConfig()),canExportVideo:typeof VideoEncoder!=='undefined'}});
 }else if(m.type==='extract'){
  if(!media)throw Error('動画を選び直してください。');
  cache.clear();background=null;photoBase=null;
  const targets=framePlan(m.first,m.last,m.reference,m.step,1,analysisClock(media.clock,m.captureFps));if(targets.length>240)throw Error('画像が多すぎます。時間間隔を広げるか、範囲を短くしてください（最大240枚）。');
  const required=new Set([...targets,m.background]);const rotated=media.rotation%180!==0;
  size=outputSize(rotated?media.track.video.height:media.track.video.width,rotated?media.track.video.width:media.track.video.height,required.size,m.maxDimension);
  const canvas=new OffscreenCanvas(size.width,size.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const extracted=await runDecodeRecovery({media,operation:'コマ抽出',requested:{first:m.first+1,last:m.last+1,background:m.background+1,frames:targets.length},cancelled:()=>job!==current,
   onDiagnostic:diagnostics=>send('diagnostic',{diagnostics}),onRetry:(attempt,label)=>send('progress',{stage:`自動再試行 ${attempt}/3 · ${label}`,value:0}),
   run:async(strategy,diagnostic)=>{
    cache.clear();ctx.clearRect(0,0,size.width,size.height);
    await decodeRange({media,first:Math.min(...required),last:Math.max(...required),strategy,diagnostic,cancelled:()=>job!==current,
     setActive:decoder=>{if(decoder||job===current)activeDecoder=decoder;},
     onProgress:p=>send('progress',{stage:`画像を抽出中 ${cache.size}/${required.size}${diagnostic.attempt>1?` · 再試行${diagnostic.attempt}`:''}`,value:p*.9}),
     onFrame:(frame,index)=>{
      if(!required.has(index)||cache.has(index))return;
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
  if(extracted&&job===current){background=cache.get(m.background);send('extracted',{size,indices:targets});}
 }else if(m.type==='select-center'){
  const frame=cache.get(m.index);if(!frame||!Number.isFinite(m.x)||!Number.isFinite(m.y))throw Error('このコマを表示し直してから指定してください。');
  const picked=pickObjectCenter(background,frame,size.width,size.height,m.x,m.y,m.sensitivity);
  if(job===current)send('center-selected',{mark:{index:m.index,...picked,mode:'center',spaceWidth:size.width,spaceHeight:size.height}});
 }else if(m.type==='auto-detect'){
  if(!background)throw Error('写真を作成してから物体を選んでください。');
  const indices=framePlan(m.first,m.last,m.reference,m.step,1,analysisClock(media.clock,m.captureFps)),frames=[];
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
  if(job===current)send('auto-detected',{marks,objectId:m.objectId??0});
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
  const result=await exportVideo({media,cache,background,size,settings:{...m,centers,calibration:withCalibrationOrigin(m.calibration,tracks[0].centers,size)},cancelled:()=>job!==current,onProgress:p=>send('progress',p),onDiagnostic:diagnostics=>send('diagnostic',{diagnostics}),setActive:(decoder,encoder)=>{if(decoder||job===current){activeDecoder=decoder;activeEncoder=encoder;}}});
  if(result&&job===current)send('video-exported',result);
 }else if(m.type==='compose'){
  if(!background)throw Error('画像を抽出してください。');const indices=framePlan(m.first,m.last,m.reference,m.step,m.factor,analysisClock(media.clock,m.captureFps));
  const tracks=tracksFor(m),allCenters=tracks[0].centers,centers=tracks.flatMap(o=>o.centers.filter(p=>indices.includes(p.index)).map(p=>({...p,objectId:o.id})));
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
  drawAnnotations(ctx,centers,size.width,size.height,{...m,calibration:withCalibrationOrigin(m.calibration,allCenters,size)});
  if(m.photoRate)drawCornerBadge(ctx,size.width,size.height,`${m.samplingRate.toFixed(1)} コマ/秒`);
  send('progress',{stage:'指定したグリッドを反映中',value:.95});
  const blob=await canvas.convertToBlob({type:'image/png'});if(job!==current)return;send('composed',{blob,count:indices.length,centers:tracks[0].centers.filter(p=>indices.includes(p.index)),objects:tracks.map(o=>({...o,centers:o.centers.filter(p=>indices.includes(p.index))})),size,indices,originCenter:allCenters[0]});
 }
 }catch(e){if(job===current)send('error',{message:e.message||String(e),diagnostics:e.diagnostics||null});}
};

// A lightweight preview uses the same timestamp decoder, background estimator,
// foreground mask and merge as saved photos. Only raw frames of matching size
// are passed to the final extractor.
import {decodeRange,runDecodeRecovery,DecodeFailure} from './decode-recovery.js';
import {analysisClock,frameTime} from './frame-clock.js';
import {framePlan,outputSize} from './sampling.js';
import {backgroundIndices,estimateBackground} from './background.js';
import {foregroundMask,mergeLayer} from './annotations.js';
import {registerFrames} from './stabilization.js';
import {PreviewFrameStore} from './preview-frame-store.js';
const defaultPreviewDimension=480;
const yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0));
const previewFrameFormat=(size,rotation)=>JSON.stringify([size.width,size.height,rotation]);

export function createPhotoPreview({getMedia,respond}){
 let job=0,decoder,backgroundMemo;
 const frames=new PreviewFrameStore(192*1024*1024);
 function cancel(keepFrames=false){
  job++;
  if(decoder&&decoder.state!=='closed')decoder.close();
  decoder=null;
  if(!keepFrames){frames.clear();backgroundMemo=null;}
 }
 function takeFrames(size,rotation,indices){
  cancel(true);
  const matching=new Map();
  if(frames.format===previewFrameFormat(size,rotation))for(const index of indices){
   const pixels=frames.get(index);
   if(pixels)matching.set(index,pixels);
  }
  frames.clear();
  backgroundMemo=null;
  return matching;
 }
 async function handle(m){
  if(m.type==='cancel'){cancel(m.keepFrames);return;}
  if(m.type!=='render')return;
  const send=(type,data={})=>respond({type,id:m.id,channel:'photo-preview',...data});
  const current=++job,cancelled=()=>job!==current;
  const media=getMedia();
  try{
   send('progress',{value:0});
   if(!media)throw Error('動画を選び直してください。');
   const clock=analysisClock(media.clock,m.captureFps),targets=framePlan(m.first,m.last,m.reference,m.step,1,clock);
   if(!targets.length||targets.length>240)throw Error('画像が多すぎます。時間間隔を広げるか、範囲を短くしてください（最大240枚）。');
   const auto=m.backgroundMode==='auto',backgroundTargets=auto?backgroundIndices(m.first,m.last,clock):[m.background],fallbackReferenceIndex=Math.floor(m.first+(m.last-m.first)*.25);
   const required=new Set([...targets,...backgroundTargets,...(m.stabilize?[m.first,fallbackReferenceIndex]:[])]),rotated=media.rotation%180!==0;
   const size=outputSize(rotated?media.track.video.height:media.track.video.width,rotated?media.track.video.width:media.track.video.height,required.size,m.maxDimension??defaultPreviewDimension);
   const {width,height}=size,format=previewFrameFormat(size,media.rotation);
   frames.configure(format);const cache=new Map();for(const index of required){const pixels=frames.get(index);if(pixels)cache.set(index,pixels);}
   const reusedIndices=new Set(cache.keys()),cachedCount=cache.size,canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
   const missing=[...required].filter(index=>!cache.has(index)),warm=(m.last-m.first+1)*width*height*4<=frames.budget;
   if(missing.length)await runDecodeRecovery({media,operation:'コマ抽出',cancelled,run:async(strategy,diagnostic)=>{
    for(const index of cache.keys())if(!reusedIndices.has(index))cache.delete(index);
    if(diagnostic.attempt>1){frames.clear();frames.configure(format);}
    // In a short range, retain every frame crossed by decoding so that a new
    // reference or interval can be composed without decoding again.
    const needed=[...required].filter(index=>!cache.has(index));
    await decodeRange({media,first:Math.min(...needed),last:Math.max(...needed),strategy,diagnostic,cancelled,onProgress:value=>send('progress',{value:Math.min(.8,value*.8)}),setActive:active=>{if(active||!cancelled())decoder=active;},onFrame:(frame,index)=>{
     if(cancelled()||!Number.isInteger(index)||cache.has(index)||!(required.has(index)||warm&&index>=m.first&&index<=m.last))return;
     ctx.save();try{ctx.clearRect(0,0,width,height);ctx.translate(width/2,height/2);ctx.rotate(media.rotation*Math.PI/180);const w=rotated?height:width,h=rotated?width:height;ctx.drawImage(frame,-w/2,-h/2,w,h);}finally{ctx.restore();}
     const pixels=ctx.getImageData(0,0,width,height).data;frames.set(index,pixels);if(required.has(index))cache.set(index,pixels);
    }});
    if(cancelled())return;
    const absent=[...required].filter(index=>!cache.has(index));if(absent.length)throw new DecodeFailure(Error('指定したコマを全て抽出できませんでした。'),{...diagnostic,missingFrames:absent.map(n=>n+1)});
    return true;
   }});
   if(cancelled())return;
   send('progress',{value:.8});
   let referencePixels;
   if(m.stabilize){
    referencePixels=cache.get(m.first);const registration=await registerFrames({indices:[...required].sort((a,b)=>a-b),getFrame:index=>cache.get(index),width,height,referenceIndex:m.first,fallbackReferenceIndex,timeForIndex:index=>frameTime(media.clock,index,true),cancelled,yieldTurn});if(cancelled()||!registration)return;
    const aligned=new OffscreenCanvas(width,height),alignedCtx=aligned.getContext('2d',{willReadFrequently:true});
    for(const index of required){if(cancelled())return;ctx.putImageData(new ImageData(cache.get(index),width,height),0,0);alignedCtx.clearRect(0,0,width,height);alignedCtx.save();try{alignedCtx.transform(...registration.transforms.get(index));alignedCtx.drawImage(canvas,0,0);}finally{alignedCtx.restore();}cache.set(index,alignedCtx.getImageData(0,0,width,height).data);await yieldTurn();}
   }
   const backgroundKey=JSON.stringify([format,backgroundTargets]);let background,reusedBackground=false;
   if(!m.stabilize&&backgroundMemo?.key===backgroundKey){background=backgroundMemo.pixels;reusedBackground=true;}
   else{background=auto?await estimateBackground(backgroundTargets.map(index=>cache.get(index)),{cancelled,yieldTurn,onProgress:value=>send('progress',{value:.8+value*.15})}):cache.get(m.background);if(cancelled())return;if(!m.stabilize)backgroundMemo={key:backgroundKey,pixels:background};}
   if(referencePixels){background=new Uint8ClampedArray(background);for(let p=0;p<background.length;p+=4)if(background[p+3]<255)background.set(referencePixels.subarray(p,p+4),p);}
   if(cancelled())return;
   send('progress',{value:.95});
   const pixels=new Uint8ClampedArray(background);
   for(let n=0;n<targets.length;n++){if(cancelled())return;mergeLayer(pixels,foregroundMask(background,cache.get(targets[n]),30,size.width).pixels);if(n%8===0)await yieldTurn();}
   if(cancelled())return;ctx.putImageData(new ImageData(pixels,width,height),0,0);
   const blob=await canvas.convertToBlob({type:'image/webp',quality:.55});if(cancelled())return;
   send('progress',{value:1});
   send('composed',{blob,count:targets.length,indices:targets,size,stats:{cachedFrames:cachedCount,requiredFrames:required.size,decoded:missing.length>0,reusedBackground}});
  }catch(error){if(!cancelled())send('error',{message:error.message});}
 }
 return {handle,cancel,takeFrames};
}

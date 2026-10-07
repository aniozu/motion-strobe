import {shutterAudioConfig,shutterEventTimes,addShutterAudio} from './shutter-audio.js';
import {decodeRange,runDecodeRecovery} from './decode-recovery.js';
import {analysisClock,frameTime} from './frame-clock.js';
import {createFile} from 'mp4box';
import {foregroundMask,mergeLayer,drawAnnotations,drawCornerBadge} from './annotations.js';
export {foregroundMask,drawTimeLabel} from './annotations.js';
import {framePlan} from './sampling.js';
export function videoPlan(first,last,sourceFps,maxFps=60){const stride=Math.max(1,Math.ceil(sourceFps/maxFps));return {stride,fps:sourceFps/stride,count:Math.floor((last-first)/stride)+1};}
export function timedVideoPlan(first,last,clock,maxFps=60){
 const indices=[first],spacing=1/maxFps;
 for(let index=first+1;index<=last;index++)if(frameTime(clock,index,true)-frameTime(clock,indices.at(-1),true)>=spacing-1e-8)indices.push(index);
 if(indices.at(-1)!==last)indices.push(last);
 const span=frameTime(clock,last,true)-frameTime(clock,first,true);
 return {indices,fps:Math.min(maxFps,span>0?(indices.length-1)/span:maxFps),count:indices.length};
}
export function videoPlaybackSpeed(value){const speed=Number(value??1);if(![1,.5,.25].includes(speed))throw Error('動画の再生速度を選び直してください。');return speed;}
export function slowedTimestampUs(seconds,speed){return Math.round(seconds/videoPlaybackSpeed(speed)*1e6);}
// Read back the completed pixels before the canvas is reused for another pose.
// The encoder gets a private RGBA frame, independent of queued canvas/GPU work.
export function snapshotVideoFrame(ctx,width,height,timestamp,duration){
 return new VideoFrame(ctx.getImageData(0,0,width,height).data,{format:'RGBA',codedWidth:width,codedHeight:height,timestamp,duration});
}
export function drawSpeedBadge(ctx,width,height,speed){
 if(speed===1)return;
 drawCornerBadge(ctx,width,height,`×${speed}`);
}
export class Mp4Writer{
 constructor(width,height,durationUs){this.file=createFile();this.file.init({timescale:1e6,duration:durationUs,brands:['isom','iso6','avc1','mp41']});this.width=width;this.height=height;this.durationUs=durationUs;this.track=null;this.bytes=0;this.count=0;this.lastTimestamp=-1;}
 add(chunk,metadata,duration){
  if(!Number.isFinite(duration)||duration<=0)throw Error('動画のコマの長さを取得できませんでした。');
  if(chunk.timestamp<=this.lastTimestamp)throw Error('この端末の動画エンコーダーでは、コマ順を保って書き出せませんでした。');
  if(!this.track){const description=metadata?.decoderConfig?.description;if(!description)throw Error('MP4の動画情報を取得できませんでした。');const data=description instanceof ArrayBuffer?description:description.buffer.slice(description.byteOffset,description.byteOffset+description.byteLength);this.track=this.file.addTrack({type:'avc1',hdlr:'vide',name:'Motion Strobe',width:this.width,height:this.height,timescale:1e6,duration:this.durationUs,media_duration:this.durationUs,avcDecoderConfigRecord:data});}
  const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);this.bytes+=data.byteLength;if(this.bytes>100*1024*1024)throw Error('合成動画が大きすぎます。範囲を短くしてお試しください。');
  const sample=this.file.addSample(this.track,data,{dts:chunk.timestamp,cts:chunk.timestamp,duration:Math.max(1,duration),is_sync:chunk.type==='key'});
  // addSample stores the payload in mdat; do not retain a second copy on its sample table.
  sample.data=null;this.lastTimestamp=chunk.timestamp;this.count++;
 }
 finish(){if(!this.count)throw Error('動画のコマが作成されませんでした。');return new Blob([this.file.getBuffer().buffer],{type:'video/mp4'});}
}
export async function exportVideo(options){
 const {media,settings,cancelled,onProgress,onDiagnostic=()=>{}}=options;
 return runDecodeRecovery({media,operation:'合成動画の作成',requested:{first:settings.first+1,last:settings.last+1},cancelled,onDiagnostic,
  onRetry:(attempt,label)=>onProgress({stage:`動画を自動再試行 ${attempt}/3 · ${label}`,value:0}),
  run:(strategy,diagnostic)=>exportVideoAttempt({...options,strategy,diagnostic})});
}
async function exportVideoAttempt({media,cache,background,size,settings,cancelled,onProgress,setActive,strategy,diagnostic}){
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw Error('このブラウザーはMP4の書き出しに未対応です。写真の保存は引き続き使えます。');
 const {first,last,reference,step,factor,sensitivity}=settings,speed=videoPlaybackSpeed(settings.playbackSpeed);
 const indices=framePlan(first,last,reference,step,factor,analysisClock(media.clock,settings.captureFps));if(indices.some(n=>!cache.has(n)))throw Error('写真を作り直してから動画を作成してください。');
 const lastSample=indices.at(-1);const audioConfig=settings.shutterSound?await shutterAudioConfig():null;if(settings.shutterSound&&!audioConfig)throw Error('このブラウザーはシャッター音の書き出しに未対応です。音をオフにしてお試しください。');
 let plan,config,width,height;
 for(const maxFps of [60,30]){
  // Capture events update the frozen overlay at the next output frame. They
  // must not inject extra live poses between the chosen playback frames.
  plan=timedVideoPlan(first,lastSample,media.clock,maxFps);const scale=Math.min(1,(maxFps===60?960:720)/Math.max(size.width,size.height));width=Math.max(2,Math.floor(size.width*scale/2)*2);height=Math.max(2,Math.floor(size.height*scale/2)*2);
  const span=frameTime(media.clock,lastSample,true)-frameTime(media.clock,first,true),encodeFps=span>0?(plan.count-1)/span:plan.fps;
  // Baseline AVC avoids B-frame reordering; quality mode forbids frame drops.
  const candidate={codec:maxFps===60?'avc1.420028':'avc1.42001f',width,height,framerate:Math.max(1,encodeFps*speed),bitrate:Math.max(1e6,Math.min(8e6,Math.round(width*height*encodeFps*speed*.14))),latencyMode:'quality',avc:{format:'avc'}};
  try{const support=await VideoEncoder.isConfigSupported(candidate);if(support.supported){config=support.config;break;}}catch{}
 }
 if(!config)throw Error('この端末はH.264形式のMP4作成に対応していません。写真の保存は引き続き使えます。');
 if(cancelled())return;
 const holdCount=Math.max(1,Math.round(plan.fps*speed)),holdPeriod=1/holdCount,firstPlayback=frameTime(media.clock,first,true),liveDuration=frameTime(media.clock,lastSample,true)-firstPlayback+(media.clock.playbackDurations?.[lastSample]||media.clock.period),durationUs=slowedTimestampUs(liveDuration,speed)+1e6,writer=new Mp4Writer(width,height,durationUs),totalCount=plan.count+holdCount,outputIndices=new Set(plan.indices);
 const centerMap=new Map();for(const p of settings.centers||[]){if(!centerMap.has(p.index))centerMap.set(p.index,[]);centerMap.get(p.index).push(p);}
 const finalPhoto=new OffscreenCanvas(size.width,size.height),finalCtx=finalPhoto.getContext('2d'),photoPixels=new Uint8ClampedArray(background);
 for(let n=0;n<indices.length;n++){if(cancelled())return;mergeLayer(photoPixels,foregroundMask(background,cache.get(indices[n]),sensitivity,size.width).pixels);if(n%3===0){onProgress({stage:`ストロボ写真を準備中 ${n+1}/${indices.length}`,value:.1*(n+1)/indices.length});await new Promise(r=>setTimeout(r,0));}}
 finalCtx.putImageData(new ImageData(photoPixels,size.width,size.height),0,0);drawAnnotations(finalCtx,(settings.centers||[]).filter(p=>indices.includes(p.index)),size.width,size.height,settings);
 const durations=new Map();let failure,encoded=0,rendered=0,nextOverlay=0,visibleCenters=[],lastActivity=Date.now(),lastRenderedTimestamp=-1,decoder,encoder;
 const sourceCanvas=new OffscreenCanvas(width,height),ctx=sourceCanvas.getContext('2d',{willReadFrequently:true});const overlay=new OffscreenCanvas(size.width,size.height),overlayCtx=overlay.getContext('2d');const maskCanvas=new OffscreenCanvas(size.width,size.height),maskCtx=maskCanvas.getContext('2d');
 const yieldTurn=()=>new Promise(r=>setTimeout(r,0));
 const progress=()=>onProgress({stage:`動画を作成中 ${encoded}/${totalCount}コマ`,value:Math.min(.97,.1+encoded/totalCount*.87)});
 try{
  encoder=new VideoEncoder({error:e=>failure=e,output:(chunk,metadata)=>{try{if(cancelled())return;if(!durations.has(chunk.timestamp))throw Error('書き出したコマの時刻が一致しません。');writer.add(chunk,metadata,durations.get(chunk.timestamp));durations.delete(chunk.timestamp);encoded++;lastActivity=Date.now();}catch(e){failure=e;}}});encoder.configure(config);
  await decodeRange({media,first,last:lastSample,strategy,diagnostic,cancelled,
   setActive:value=>{decoder=value;setActive(decoder,encoder);},
   beforeDecode:async()=>{while(encoder.encodeQueueSize>6){if(cancelled())return;if(failure)throw failure;if(Date.now()-lastActivity>30000)throw Error('動画の書き出しが停止しました。');progress();await yieldTurn();}if(failure)throw failure;},
   onProgress:progress,onFrame:(frame,index)=>{
    if(cancelled()||failure)return;lastActivity=Date.now();if(index===undefined||!outputIndices.has(index))return;
    while(nextOverlay<indices.length&&indices[nextOverlay]<=index){const n=indices[nextOverlay++],mask=foregroundMask(background,cache.get(n),sensitivity,size.width);maskCtx.putImageData(new ImageData(mask.pixels,size.width,size.height),0,0);overlayCtx.drawImage(maskCanvas,0,0);if(centerMap.has(n))visibleCenters.push(...centerMap.get(n));}
    ctx.save();ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.translate(width/2,height/2);ctx.rotate(media.rotation*Math.PI/180);const rotated=media.rotation%180!==0;ctx.drawImage(frame,-(rotated?height:width)/2,-(rotated?width:height)/2,rotated?height:width,rotated?width:height);ctx.restore();
    ctx.drawImage(overlay,0,0,width,height);ctx.save();ctx.scale(width/size.width,height/size.height);drawAnnotations(ctx,visibleCenters,size.width,size.height,settings);ctx.restore();drawSpeedBadge(ctx,width,height,speed);
    const timestamp=slowedTimestampUs(frameTime(media.clock,index,true)-firstPlayback,speed),position=plan.indices.indexOf(index),next=plan.indices[position+1],duration=slowedTimestampUs(next===undefined?liveDuration:frameTime(media.clock,next,true)-firstPlayback,speed)-timestamp;
    if(duration<=0||timestamp<0||(rendered&&timestamp<=lastRenderedTimestamp))throw Error('動画のコマ順または再生時間が不正です。');lastRenderedTimestamp=timestamp;
    durations.set(timestamp,duration);const outputFrame=snapshotVideoFrame(ctx,width,height,timestamp,duration);try{encoder.encode(outputFrame,{keyFrame:rendered%Math.max(1,Math.round(plan.fps*2))===0});}finally{outputFrame.close();}rendered++;
   }});
  diagnostic.phase='合成動画の書き出し';if(failure)throw failure;if(cancelled())return;
  let timeout;try{await Promise.race([(async()=>{
   // The final second is the very same annotated photo, not an extra source pose.
   ctx.drawImage(finalPhoto,0,0,width,height);
   for(let n=0;n<holdCount;n++){
    if(cancelled())return;if(failure)throw failure;
    while(encoder.encodeQueueSize>6){if(cancelled())return;if(failure)throw failure;progress();await yieldTurn();}
    const timestamp=slowedTimestampUs(liveDuration,speed)+Math.round(n*holdPeriod*1e6),duration=slowedTimestampUs(liveDuration,speed)+Math.round((n+1)*holdPeriod*1e6)-timestamp;
    durations.set(timestamp,duration);const frame=snapshotVideoFrame(ctx,width,height,timestamp,duration);try{encoder.encode(frame,{keyFrame:n===0});}finally{frame.close();}rendered++;if(n%8===0){progress();await yieldTurn();}
   }
   await encoder.flush();})(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('動画処理が停止しました。範囲を短くしてお試しください。')),45000);})]);}finally{clearTimeout(timeout);}
  if(cancelled())return;if(failure)throw failure;if(rendered!==totalCount||writer.count!==totalCount||durations.size)throw Error('動画の全コマを作成できませんでした。範囲を短くしてお試しください。');
  if(audioConfig){diagnostic.phase='シャッター音の書き出し';await addShutterAudio({writer,events:shutterEventTimes(indices,first,media.clock,speed),config:audioConfig,cancelled,onProgress,setActive});if(cancelled())return;}
  diagnostic.phase='MP4の仕上げ';onProgress({stage:'MP4を仕上げ中',value:.99});await yieldTurn();if(cancelled())return;const blob=writer.finish();return {blob,width,height,fps:plan.fps*speed,count:writer.count,lastSample,holdSeconds:1,playbackSpeed:speed};
 }finally{if(decoder&&decoder.state!=='closed')decoder.close();if(encoder&&encoder.state!=='closed')encoder.close();setActive(null,null);}
}

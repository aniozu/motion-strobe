import {BoxParser} from 'mp4box';
import {frameTime} from './frame-clock.js';
export const shutterSampleRate=48000;
export function shutterEventTimes(indices,first,clock,speed){return indices.map(index=>(frameTime(clock,index,true)-frameTime(clock,first,true))/speed);}
// One reusable, deterministic two-pulse shutter. Its duration/pitch never changes
// with video speed; only the event timestamps do. No recording or external asset.
export function shutterWaveform(rate=shutterSampleRate){
 const out=new Float32Array(Math.round(rate*.028));let seed=0x23456789,lastNoise=0;
 for(let n=0;n<out.length;n++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=n/rate;
  const envelope=Math.exp(-t/.004)+.45*(t>=.012?Math.exp(-(t-.012)/.005):0);
  out[n]=.3*(noise-lastNoise*.65)*envelope*Math.min(1,n/8);lastNoise=noise;
 }
 return out;
}
export function shutterBlock(first,length,events,wave=shutterWaveform(),rate=shutterSampleRate){
 const out=new Float32Array(length);
 for(const time of events){const offset=Math.round(time*rate),a=Math.max(first,offset),b=Math.min(first+length,offset+wave.length);for(let n=a;n<b;n++)out[n-first]+=wave[n-offset];}
 for(let n=0;n<out.length;n++)out[n]=Math.max(-.8,Math.min(.8,out[n]));
 return out;
}
export async function shutterAudioConfig(){
 if(typeof AudioEncoder==='undefined'||typeof AudioData==='undefined')return null;
 try{const support=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:shutterSampleRate,numberOfChannels:1,bitrate:96000});return support.supported?support.config:null;}catch{return null;}
}
function descriptor(tag,data){const size=data.length,bytes=[];let n=size;do{bytes.unshift(n&127);n>>>=7;}while(n);for(let i=0;i<bytes.length-1;i++)bytes[i]|=128;return [tag,...bytes,...data];}
export function aacDescription(description){
 const bytes=description instanceof ArrayBuffer?new Uint8Array(description):new Uint8Array(description.buffer,description.byteOffset,description.byteLength);
 const decoder=descriptor(4,[0x40,0x15,0,0,0,0,1,0x77,0,0,1,0x77,0,...descriptor(5,[...bytes])]);
 const payload=new Uint8Array(descriptor(3,[0,1,0,...decoder,...descriptor(6,[2])]));
 return {type:'esds',size:payload.length+12,write(stream){stream.writeUint32(payload.length+12);stream.writeString('esds');stream.writeUint32(0);stream.writeUint8Array(payload);}};
}
export function addAudioPackets(writer,packets,description,config){
 if(!packets.length||!description)throw Error('シャッター音を作成できませんでした。');
 const rate=config.sampleRate,offset=Math.max(0,-packets[0].timestamp);
 const track=writer.file.addTrack({type:'mp4a',hdlr:'soun',name:'Shutter sound',timescale:rate,samplerate:rate,channel_count:1,samplesize:16,duration:writer.durationUs,media_duration:Math.ceil((writer.durationUs+offset)*rate/1e6),description:aacDescription(description)});
 const trak=writer.file.getTrackById(track);trak.tkhd.width=0;trak.tkhd.height=0;
 // AAC may emit a negative-time priming packet. Retain decoder warm-up, then
 // trim it with an MP4 edit so audio time zero equals video time zero.
 const edit=trak.addBox(new BoxParser.box.edts()).addBox(new BoxParser.box.elst());
 edit.entries=[{segment_duration:writer.durationUs,media_time:Math.round(offset*rate/1e6),media_rate_integer:1,media_rate_fraction:0}];
 for(let n=0;n<packets.length;n++){
  const packet=packets[n],start=Math.round((packet.timestamp+offset)*rate/1e6),next=packets[n+1];
  const duration=next?Math.round((next.timestamp+offset)*rate/1e6)-start:Math.round((packet.duration||1024/rate*1e6)*rate/1e6);
  const sample=writer.file.addSample(track,packet.data,{dts:start,cts:start,duration:Math.max(1,duration),is_sync:true});sample.data=null;
 }
}
export async function addShutterAudio({writer,events,config,cancelled,onProgress,setActive}){
 let failure,description,lastActivity=Date.now();const packets=[],rate=config.sampleRate,frames=Math.ceil(writer.durationUs*rate/1e6),wave=shutterWaveform(rate);
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 const encoder=new AudioEncoder({error:error=>failure=error,output:(chunk,metadata)=>{
  if(cancelled())return;const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);packets.push({timestamp:chunk.timestamp,duration:chunk.duration,data});lastActivity=Date.now();
  if(metadata?.decoderConfig?.description)description=metadata.decoderConfig.description;
 }});
 try{
  encoder.configure(config);setActive(null,encoder);
  for(let first=0;first<frames;first+=1024){
   if(cancelled())return;if(failure)throw failure;
   while(encoder.encodeQueueSize>8){if(cancelled())return;if(failure)throw failure;if(Date.now()-lastActivity>30000)throw Error('音声処理が停止しました。');await tick();}
   const length=Math.min(1024,frames-first),data=new AudioData({format:'f32-planar',sampleRate:rate,numberOfChannels:1,numberOfFrames:length,timestamp:Math.round(first/rate*1e6),data:shutterBlock(first,length,events,wave,rate)});
   try{encoder.encode(data);}finally{data.close();}
   if(first%16384===0){onProgress({stage:'シャッター音を作成中',value:.97+.02*first/frames});await tick();}
  }
  let timer;try{await Promise.race([encoder.flush(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('音声処理が停止しました。')),30000);})]);}finally{clearTimeout(timer);}
  if(cancelled())return;if(failure)throw failure;addAudioPackets(writer,packets,description,config);
 }finally{if(encoder.state!=='closed')encoder.close();setActive(null,null);}
}

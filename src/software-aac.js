// Loaded only when native AAC encoding is unavailable (including iPadOS 17).
import {registerAacEncoder} from '@mediabunny/aac-encoder';
import {AudioSample,AudioSampleSource,Output,Mp4OutputFormat,NullTarget} from 'mediabunny';
import {shutterBlock,shutterWaveform} from './shutter-audio.js';
registerAacEncoder();
export async function encodeSoftwareShutter({durationUs,events,config,cancelled=()=>false,onProgress=()=>{},setActive=()=>{}}){
 const rate=config.sampleRate,frames=Math.ceil(durationUs*rate/1e6),wave=shutterWaveform(rate),packets=[];let description,aborted=false;
 const output=new Output({format:new Mp4OutputFormat(),target:new NullTarget()});
 const source=new AudioSampleSource({codec:'aac',bitrate:config.bitrate,onEncodedPacket:(packet,metadata)=>{
  // libavcodec AAC-LC emits one 1024-sample priming packet. The extension
  // numbers that packet at input time zero; expose its true negative PTS so
  // the shared MP4 edit trims priming, keeping clicks sample-aligned.
  packets.push({data:packet.data,timestamp:Math.round((packet.timestamp-1024/rate)*1e6),duration:Math.round(packet.duration*1e6)});
  if(metadata?.decoderConfig?.description)description=metadata.decoderConfig.description;
 }});
 output.addAudioTrack(source);
 const active={state:'configured',close(){if(this.state==='closed')return;this.state='closed';aborted=true;if(output.state!=='finalized')void output.cancel().catch(()=>{});}};
 setActive(null,active);
 const check=()=>cancelled()||aborted;
 let timer;
 const bounded=promise=>Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('音声処理が停止しました。')),30000);})]).finally(()=>clearTimeout(timer));
 try{
  await bounded(output.start());
  for(let first=0;first<frames;first+=16384){
   if(check())return;
   const sample=new AudioSample({format:'f32-planar',sampleRate:rate,numberOfChannels:1,timestamp:first/rate,data:shutterBlock(first,Math.min(16384,frames-first),events,wave,rate)});
   try{await bounded(source.add(sample));}finally{sample.close();}
   if(check())return;onProgress({stage:'シャッター音を作成中',value:.97+.02*Math.min(frames,first+16384)/frames});
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await bounded(output.finalize());if(check())return;return {packets,description};
 }catch(error){if(!check())throw error;}
 finally{clearTimeout(timer);active.close();setActive(null,null);}
}

import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {shutterEventTimes,shutterWaveform,shutterBlock,addAudioPackets,addShutterAudio} from '../src/shutter-audio.js';
import {Mp4Writer} from '../src/video-export.js';import {parseVideo} from '../src/media.js';
test('shutter timing follows actual playback PTS and all three speeds, without an end click',()=>{
 const clock={period:1/60,playbackTimes:[2,2.08,2.18,2.31,2.43,2.55]};
 for(const speed of [1,.5,.25]){
  const events=shutterEventTimes([1,3,4],0,clock,speed);
  assert.equal(events.length,3);for(let n=0;n<3;n++)assert(Math.abs(events[n]-[.08,.31,.43][n]/speed)<1e-10);
  const wave=shutterWaveform(),samples=shutterBlock(0,Math.ceil(4*48000),events,wave);
  for(const t of events){const at=Math.round(t*48000);assert.equal(samples[at+20],wave[20]);assert.equal(samples[at-1],0);}
  assert(samples.subarray(Math.round(events.at(-1)*48000)+wave.length).every(v=>v===0));
 }
});
test('AAC muxing decodes to correctly timed clicks including encoder priming, with silent final hold',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'strobe-audio-'));
 try{
  const baseline=await parseVideo(new Blob([await readFile(new URL('./fixtures/baseline.mp4',import.meta.url))]));
  for(const speed of [1,.5,.25]){
   const duration=1/speed+1,events=[.1/speed,.4/speed,.7/speed],pcm=shutterBlock(0,Math.round(duration*48000),events);
   await writeFile(join(folder,'audio.f32'),new Uint8Array(pcm.buffer));
   execFileSync('ffmpeg',['-v','error','-y','-f','f32le','-ar','48000','-ac','1','-i',join(folder,'audio.f32'),'-c:a','aac','-b:a','96k','-f','adts',join(folder,'audio.aac')]);
   const adts=await readFile(join(folder,'audio.aac')),packets=[];let offset=0;
   while(offset<adts.length){const size=((adts[offset+3]&3)<<11)|(adts[offset+4]<<3)|(adts[offset+5]>>5),header=(adts[offset+1]&1)?7:9;packets.push({timestamp:Math.round((packets.length-1)*1024/48000*1e6),duration:1024/48000*1e6,data:adts.subarray(offset+header,offset+size)});offset+=size;}
   const writer=new Mp4Writer(320,240,Math.round(duration*1e6)),packet=baseline.mp4.getSample(baseline.trak,0).data;
   writer.add({timestamp:0,type:'key',byteLength:packet.length,copyTo:out=>out.set(packet)},{decoderConfig:baseline.config},Math.round(duration*1e6));
   addAudioPackets(writer,packets,new Uint8Array([0x11,0x88]),{sampleRate:48000});
   await writeFile(join(folder,'out.mp4'),new Uint8Array(await writer.finish().arrayBuffer()));
   const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',join(folder,'out.mp4')]).toString());
   const audio=info.streams.find(s=>s.codec_type==='audio');assert(audio);assert.equal(audio.codec_name,'aac');assert.equal(audio.sample_rate,'48000');assert(Math.abs(Number(audio.start_time))<.0001);
   const decoded=execFileSync('ffmpeg',['-v','error','-i',join(folder,'out.mp4'),'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','-'],{maxBuffer:4e6});const signal=new Float32Array(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength));
   for(const time of events){let peak=0,peakAt=0;for(let n=Math.round((time-.01)*48000);n<Math.round((time+.035)*48000);n++)if(Math.abs(signal[n])>peak){peak=Math.abs(signal[n]);peakAt=n;}assert(peak>.04);assert(Math.abs(peakAt/48000-time)<.01,`${speed}: onset ${time}, peak ${peakAt/48000}`);}
   assert(signal.subarray(Math.round((events.at(-1)+.1)*48000)).every(v=>Math.abs(v)<.002));
  }
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('audio encoder cancellation closes resources and does not add an audio track',async()=>{
 const saved={AudioEncoder:globalThis.AudioEncoder,AudioData:globalThis.AudioData};let cancel=false,closed=false,muxed=false;
 globalThis.AudioData=class{constructor(options){Object.assign(this,options);}close(){}};
 globalThis.AudioEncoder=class{constructor(){this.state='configured';this.encodeQueueSize=0;}configure(){}encode(){cancel=true;}async flush(){}close(){closed=true;this.state='closed';}};
 try{await addShutterAudio({writer:{durationUs:3e6,file:{addTrack(){muxed=true;}}},events:[0],config:{sampleRate:48000},cancelled:()=>cancel,onProgress(){},setActive(){}});assert(closed);assert(!muxed);}finally{Object.assign(globalThis,saved);}
});

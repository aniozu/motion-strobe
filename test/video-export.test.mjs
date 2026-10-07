import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {parseVideo} from '../src/media.js';import {Mp4Writer,foregroundMask,videoPlan} from '../src/video-export.js';
test('video cadence is uniform, source time is retained, and no endpoint is appended',()=>{assert.deepEqual(videoPlan(3,14,240),{stride:4,fps:60,count:3});assert.deepEqual(videoPlan(3,14,59.94),{stride:1,fps:59.94,count:12});assert.deepEqual(videoPlan(3,14,60,30),{stride:2,fps:30,count:6});});
test('foreground layer is transparent outside the extracted object',()=>{const bg=new Uint8ClampedArray(400).fill(100);for(let i=3;i<400;i+=4)bg[i]=255;const image=new Uint8ClampedArray(bg);image.set([250,0,0,255],40);const mask=foregroundMask(bg,image,30,10);assert.deepEqual([...mask.pixels.slice(40,44)],[250,0,0,255]);assert.deepEqual([...mask.pixels.slice(80,84)],[0,0,0,0]);});
test('MP4 writer produces a seekable H264 file that FFmpeg decodes fully',async()=>{const bytes=await readFile(new URL('./fixtures/baseline.mp4',import.meta.url));const source=await parseVideo(new Blob([bytes]));const count=source.samples.length,period=source.clock.period;const writer=new Mp4Writer(source.track.video.width,source.track.video.height,Math.round(count*period*1e6));for(let i=0;i<count;i++){const s=source.mp4.getSample(source.trak,i);const timestamp=Math.round((s.cts-source.clock.ordered[0].cts)/s.timescale*1e6),duration=Math.round((i+1)*period*1e6)-Math.round(i*period*1e6);writer.add({timestamp,type:s.is_sync?'key':'delta',byteLength:s.data.byteLength,copyTo:out=>out.set(s.data)},{decoderConfig:source.config},duration);}const result=writer.finish();const remux=await parseVideo(result);assert.equal(remux.clock.ordered.length,count);assert.equal(remux.config.codec,source.config.codec);assert.equal(Math.round(remux.clock.fps),60);assert.equal(remux.clock.origin,0);
 let ffmpeg;try{ffmpeg=execFileSync('ffmpeg',['-version'],{encoding:'utf8'});}catch{}if(ffmpeg){const temp=await mkdtemp(join(tmpdir(),'strobe-mp4-'));try{const path=join(temp,'output.mp4');await writeFile(path,new Uint8Array(await result.arrayBuffer()));const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}));assert.equal(Number(probe.streams[0].nb_read_frames),108);assert.equal(Number(probe.format.duration),1.8);execFileSync('ffmpeg',['-v','error','-i',path,'-f','null','-']);}finally{await rm(temp,{recursive:true,force:true});}}
});
test('writer refuses absent codec metadata and non-monotonic encoder timestamps',()=>{const w=new Mp4Writer(2,2,1e6);assert.throws(()=>w.add({timestamp:0,byteLength:4,type:'key',copyTo(){}},{},1000),/動画情報/);});

test('queued video snapshots stay fixed when a later pose changes the same canvas backing pixels',async()=>{
 const {snapshotVideoFrame}=await import('../src/video-export.js');
 const original=globalThis.VideoFrame;
 globalThis.VideoFrame=class{constructor(data,options){this.data=new Uint8Array(data);Object.assign(this,options);}};
 try{
  const pixels=new Uint8ClampedArray([240,10,10,255]),ctx={getImageData:()=>({data:new Uint8ClampedArray(pixels)})};
  const first=snapshotVideoFrame(ctx,1,1,0,4167);pixels.set([10,10,240,255]);
  const second=snapshotVideoFrame(ctx,1,1,4167,8333);pixels.fill(0);
  assert.deepEqual([...first.data],[240,10,10,255]);assert.deepEqual([...second.data],[10,10,240,255]);
  assert.equal(first.timestamp,0);assert.equal(second.timestamp,4167);assert.equal(second.duration,8333);
 }finally{globalThis.VideoFrame=original;}
});

test('variable capture timestamps survive MP4 muxing with no extra hold or missing source frames',async()=>{
 const bytes=await readFile(new URL('./fixtures/baseline.mp4',import.meta.url)),source=await parseVideo(new Blob([bytes]));
 const count=source.samples.length,durations=Array.from({length:count},(_,n)=>[4167,12500,16666,8333][n%4]);
 const timestamps=[];let total=0;for(const duration of durations){timestamps.push(total);total+=duration;}
 const writer=new Mp4Writer(source.track.video.width,source.track.video.height,total);
 for(let n=0;n<count;n++){const s=source.mp4.getSample(source.trak,n);writer.add({timestamp:timestamps[n],type:s.is_sync?'key':'delta',byteLength:s.data.length,copyTo:out=>out.set(s.data)},{decoderConfig:source.config},durations[n]);}
 const output=writer.finish(),parsed=await parseVideo(output);
 assert.deepEqual(parsed.samples.map(s=>s.cts),timestamps);assert.deepEqual(parsed.samples.map(s=>s.duration),durations);
 const temp=await mkdtemp(join(tmpdir(),'strobe-vfr-'));
 try{
  const before=join(temp,'before.mp4'),after=join(temp,'after.mp4');await writeFile(before,bytes);await writeFile(after,new Uint8Array(await output.arrayBuffer()));
  const hashes=path=>execFileSync('ffmpeg',['-v','error','-i',path,'-fps_mode','passthrough','-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1).trim());
  assert.deepEqual(hashes(after),hashes(before));
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_packets','-show_entries','packet=pts_time','-of','json',after],{encoding:'utf8'}));
  // The reused AVC bitstream advertises 60 fps. FFmpeg reports that SPS
  // duration per packet; verify the actual container durations above and PTS here.
  assert.equal(probe.packets.length,count);
  for(let n=0;n<count;n++){assert(Math.abs(Number(probe.packets[n].pts_time)-timestamps[n]/1e6)<1e-6);}
 }finally{await rm(temp,{recursive:true,force:true});}
});

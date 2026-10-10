// Offline only: small muted H.264 previews, using the app's own strobe mask.
// Requires ffmpeg; normal app builds use the committed MP4s without running this.
import {spawnSync} from 'node:child_process';
import {stat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {samples} from '../src/samples.js';
import {foregroundMask,mergeLayer} from '../src/annotations.js';

const width=360,height=204,fps=24,frameBytes=width*height*4;
const analyzed=JSON.parse(await readFile(new URL('./analyzed-preview-sources.json',import.meta.url),'utf8'));
const analyzedDirectory=process.argv[2];
const scale=`scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
const providedScale="scale=w='min(480,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
function ffmpeg(args,input){
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-threads','2',...args],{input,maxBuffer:64*1024*1024});
 if(result.status!==0)throw Error(result.stderr?.toString()||'ffmpeg failed');
 return result.stdout;
}
for(const sample of samples){
 const provided=analyzed[sample.id];
 if(provided){
  const path=`dist/sample-preview-${sample.id}.mp4`;
  // Preserve the supplied analysis, including guides, timing, and playback speed.
  if(analyzedDirectory){
   const input=join(analyzedDirectory,provided.file);
   const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',input],{encoding:'utf8'});
   if(probe.status!==0)throw Error(probe.stderr||'ffprobe failed');
   const stream=JSON.parse(probe.stdout).streams[0];
   const [numerator,denominator]=stream.r_frame_rate.split('/').map(Number);
   const previewFps=Math.min(numerator/denominator,24);
   if(!Number.isFinite(previewFps)||previewFps<=0)throw Error(`Invalid frame rate: ${sample.id}`);
   ffmpeg(['-y','-i',input,'-map','0:v:0','-vf',`${providedScale},fps=${previewFps},setsar=1`,'-an','-c:v','libx264','-threads','2','-preset','medium','-crf','24','-profile:v','baseline','-level','3.0','-pix_fmt','yuv420p','-movflags','+faststart',path]);
  }
  console.log(`${sample.id}: provided analysis, ${(await stat(path)).size} bytes`);
  continue;
 }
 const {start,end,background}=sample.range,span=end-start,duration=Math.min(3.5,Math.max(1.5,span)),count=Math.round(duration*fps);
 const file=`dist/${sample.video}`;
 const backgroundPixels=new Uint8ClampedArray(ffmpeg(['-ss',String(background),'-i',file,'-vf',scale,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']));
 if(backgroundPixels.length!==frameBytes)throw Error(`Missing background: ${sample.id}`);
 const raw=ffmpeg(['-ss',String(start),'-t',String(span),'-i',file,'-vf',`${scale},setpts=(PTS-STARTPTS)*${duration/span},fps=${fps},tpad=stop_mode=clone:stop_duration=1`,'-frames:v',String(count),'-f','rawvideo','-pix_fmt','rgba','pipe:1']);
 if(raw.length!==count*frameBytes)throw Error(`Missing frames: ${sample.id}`);
 const output=Buffer.alloc((count+fps)*frameBytes),overlay=new Uint8ClampedArray(frameBytes),photo=new Uint8ClampedArray(backgroundPixels);
 const interval=Math.max(1,Math.round((count-1)/11));
 for(let n=0;n<count;n++){
  const frame=new Uint8ClampedArray(raw.buffer,raw.byteOffset+n*frameBytes,frameBytes);
  if(n%interval===0||n===count-1){
   const mask=foregroundMask(backgroundPixels,frame,30,width).pixels;
   mergeLayer(overlay,mask);mergeLayer(photo,mask);
  }
  const composed=new Uint8ClampedArray(frame);mergeLayer(composed,overlay);output.set(composed,n*frameBytes);
 }
 for(let n=count;n<count+fps;n++)output.set(photo,n*frameBytes);
 const path=`dist/sample-preview-${sample.id}.mp4`;
 ffmpeg(['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','medium','-crf','27','-profile:v','baseline','-level','3.0','-pix_fmt','yuv420p','-movflags','+faststart',path],output);
 console.log(`${sample.id}: ${(await stat(path)).size} bytes`);
}

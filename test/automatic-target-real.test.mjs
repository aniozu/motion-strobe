import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {samples} from '../src/samples.js';
import {parseVideo} from '../src/media.js';
import {indexAtTime} from '../src/frame-clock.js';
import {framePlan,outputSize} from '../src/sampling.js';
import {initialSampling} from '../src/sampling-preview.js';
import {backgroundIndices,estimateBackground} from '../src/background.js';
import {foregroundMask} from '../src/annotations.js';
import {findDiscoveryCandidates,pickObjectCenter,trackCandidates} from '../src/tracking.js';
import {discoverObject} from '../src/automatic-target.js';

const truth=JSON.parse(await readFile(new URL('./fixtures/automatic-target-samples.json',import.meta.url)));
for(const sample of samples)test(`hint-free selection: ${sample.id}, default range and sampling`,async t=>{
 const file='dist/'+sample.video,media=await parseVideo(new Blob([await readFile(file)]));
 const clock=media.clock,first=indexAtTime(clock,sample.range.start),last=indexAtTime(clock,sample.range.end);
 const sampling=initialSampling({...clock,start:first,end:last,count:clock.ordered.length});
 const indices=framePlan(first,last,sampling.reference,sampling.step,1,clock),backs=backgroundIndices(first,last,clock);
 const required=[...new Set([...indices,...backs])].sort((a,b)=>a-b);
 const {width,height}=outputSize(media.track.video.width,media.track.video.height,required.length,960),bytes=width*height*4;
 const raw=execFileSync('ffmpeg',['-v','error','-threads','1','-filter_threads','1','-i',file,'-vf',`select='${required.map(n=>`eq(n,${n})`).join('+')}',scale=${width}:${height}`,'-fps_mode','passthrough','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:160*1024*1024});
 assert.equal(raw.length,required.length*bytes);
 const cache=new Map(required.map((index,i)=>[index,raw.subarray(i*bytes,(i+1)*bytes)]));
 const background=await estimateBackground(backs.map(index=>cache.get(index)),{yieldTurn:async()=>{}});
 const began=performance.now();
 const frames=indices.map(index=>{
  const frame=cache.get(index),pixels=foregroundMask(background,frame,30,width).pixels;
  return {index,candidates:findDiscoveryCandidates(pixels,frame,width,height,background)};
 });
 const marks=await discoverObject(frames,width,height),expected=truth.samples[sample.id];
 assert.equal(marks.length,expected.positions.length);let confirmed=0;
 for(let i=0;i<marks.length;i++){
  const mark=marks[i];assert.equal(mark.source,'auto');assert.equal(mark.index,indices[i]);
  if(mark.mode!=='center'||mark.uncertain)continue;
  confirmed++;
  const tapped=pickObjectCenter(background,cache.get(mark.index),width,height,mark.x,mark.y,30);
  assert.equal(tapped.source,'object',`frame ${mark.index} must be a measured object region`);
  assert.equal(tapped.x,mark.x,`tap and automatic x differ at frame ${mark.index}`);
  assert.equal(tapped.y,mark.y,`tap and automatic y differ at frame ${mark.index}`);
  assert.deepEqual(tapped.bounds,mark.bounds);
  if(expected.maximumHeight)assert(mark.bounds.h<=expected.maximumHeight,`frame ${mark.index} includes the table reflection`);
 }
 const paths=[expected.positions,...(expected.alternatives||[])];
 assert(paths.some(path=>marks.every((m,i)=>m.mode!=='center'||m.uncertain||path[i]&&Math.hypot(m.x-path[i][0],m.y-path[i][1])<expected.radius)),`confirmed frames must follow one physical object throughout: ${JSON.stringify(marks)}`);
 assert(confirmed>=expected.minimum,`only ${confirmed}/${marks.length} confirmed`);
 const seed=marks.filter(m=>m.mode==='center'&&!m.uncertain)[Math.floor(confirmed/2)];
 const hint={...seed,source:'object'};delete hint.uncertain;
 const seeded=trackCandidates(frames,width,height,[hint],hint.index);
 assert.deepEqual(seeded.find(m=>m.index===hint.index),hint);
 for(const mark of seeded){
  if(mark.source!=='auto'||mark.mode!=='center'||mark.uncertain)continue;
  const tapped=pickObjectCenter(background,cache.get(mark.index),width,height,mark.x,mark.y,30);
  assert.equal(tapped.source,'object');assert.equal(tapped.x,mark.x);assert.equal(tapped.y,mark.y);assert.deepEqual(tapped.bounds,mark.bounds);
 }
 t.diagnostic(`${confirmed}/${marks.length} confirmed in checked target regions; tap/automatic/seeded centers agree; ${Math.round(performance.now()-began)} ms at ${width}×${height}.`);
});

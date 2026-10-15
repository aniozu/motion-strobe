import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVideo} from '../src/media.js';
import {samples} from '../src/samples.js';
import {framePlan} from '../src/sampling.js';
import {analysisClock} from '../src/frame-clock.js';
import {initialSampling,previewFrameTarget} from '../src/sampling-preview.js';

function displayedFrame(timestamps,time){
 const tick=Math.floor(time*1e6);let low=0,high=timestamps.length;
 while(low<high){const middle=(low+high)>>>1;if(timestamps[middle]<=tick)low=middle+1;else high=middle;}
 return low-1;
}
test('all sample videos retain the extraction plan under rounded playback timestamps and changed settings',async()=>{
 let cases=0,boundaryMismatches=0;
 for(const sample of samples){
  const media=await parseVideo(new Blob([await readFile('dist/'+sample.video)])),source=media.clock;
  const pts=source.playbackTimes.map(t=>Math.round(t*1e6)),count=pts.length;
  for(const captureFps of [null,120])for(const [start,end] of [[0,count-1],[Math.floor(count*.13),Math.floor(count*.73)]]){
   const analysis=analysisClock(source,captureFps),state={...analysis,count,start,end,variableTiming:analysis.variable};Object.assign(state,initialSampling(state));
   for(const [reference,step] of [[state.reference,state.step],[start,1],[end,Math.max(1,Math.round((end-start)/17))]]){
    // UI uses normalized timing flags; extraction independently reconstructs the
    // analysis clock from the original demuxed data and requested capture fps.
    const preview=framePlan(start,end,reference,step,1,{...state,variable:state.variableTiming});
    const extracted=framePlan(start,end,reference,step,1,analysisClock(source,captureFps));
    assert.deepEqual(preview,extracted,sample.id);
    for(const index of preview){
     const target=previewFrameTarget(state,index);
     assert(target.time>target.start&&target.time<target.end,sample.id);
     assert.equal(displayedFrame(pts,target.time),index,`${sample.id} frame ${index}`);
     if(displayedFrame(pts,target.start)!==index)boundaryMismatches++;
    }
    cases++;
   }
  }
 }
 assert.equal(cases,samples.length*12);assert(boundaryMismatches>0,'the model exercises the previous boundary-seek failure');
});

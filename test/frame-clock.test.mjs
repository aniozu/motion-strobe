import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {timing,framePlan} from '../src/sampling.js';
import {frameTime,indexAtTime,analysisClock,applyMovieEdits} from '../src/frame-clock.js';
import {parseVideo} from '../src/media.js';
import {timedVideoPlan} from '../src/video-export.js';
import {applyTimePoint} from '../src/time-controls.js';
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const samples=Array.from({length:241},(_,i)=>({cts:i*100,duration:100}));
const clock=()=>timing(samples,24000);
const edit=(duration,start=0,integer=1,fraction=0)=>({segment_duration:duration,media_time:start,media_rate_integer:integer,media_rate_fraction:fraction});

test('presentation timestamps survive sorting, nonzero origin and fractional bar positions',()=>{
 const c=timing([{cts:1070},{cts:1000},{cts:1010},{cts:1030}],1000);
 assert.deepEqual(c.times,[0,.01,.03,.07]);near(frameTime(c,2),.03);near(frameTime(c,1.5),.02);
 assert.equal(indexAtTime(c,.048),2);assert.equal(indexAtTime(c,100),3);assert.equal(indexAtTime(c,-1),0);
 assert.notEqual(frameTime(c,2),2*c.period);
});
test('1/4-speed QuickTime edit separates 240 fps media time from 60 fps playback',()=>{
 const c=applyMovieEdits(clock(),[edit(4000,0,0,16384)],1000,24000);
 assert.equal(c.times.length,240);near(c.fps,240);near(c.times[24],.1);near(c.playbackTimes[24],.4);
 near(c.playbackDurations[24],1/60);assert.equal(c.hasRateEdits,true);
 const full=timedVideoPlan(0,239,c);assert.equal(full.count,240);near(full.fps,60);
});
test('empty edits and source trims keep media time separate from movie time',()=>{
 const c=applyMovieEdits(clock(),[edit(500,-1),edit(2000,6000,0,16384)],1000,24000);
 assert.equal(c.ordered[0].cts,6000);near(c.times[0],0);near(c.times[24],.1);
 near(c.playbackTimes[0],.5);near(c.playbackTimes[24],.9);near(c.origin,.25);
});
test('speed changes and signed 16-bit fractions use each segment mapping',()=>{
 const c=applyMovieEdits(clock(),[edit(250),edit(2000,6000,0,16384),edit(250,18000)],1000,24000);
 near(c.times[120],.5);near(c.playbackTimes[120],1.25);
 near(c.playbackTimes[180],2.25);near(c.playbackDurations[59],1/240);near(c.playbackDurations[179],1/60);
 const signed=applyMovieEdits(clock(),[edit(1000,0,0,-16384)],1000,24000);
 near(signed.playbackTimes[24],.1/.75);
});
test('unmodified files do not invent capture fps or normalize browser playback origin',()=>{
 const c=timing([{cts:100,duration:10},{cts:110,duration:10},{cts:125,duration:10}],1000);
 const mapped=applyMovieEdits(c,null,1000,1000);
 assert.deepEqual(mapped.times,[0,.01,.025]);
 assert.deepEqual(mapped.playbackTimes,[.1,.11,.125]);assert.equal(mapped.hasRateEdits,false);
 const fixed=analysisClock(mapped,120);near(fixed.times[2],2/120);assert.equal(fixed.variable,false);
 assert.equal(fixed.playbackTimes,mapped.playbackTimes);assert.equal(analysisClock(mapped,null),mapped);
 assert.equal(mapped.times[2],.025);
});
test('unsupported freeze, reverse and repeated edits produce explicit errors',()=>{
 for(const rate of [0,-1])assert.throws(()=>applyMovieEdits(clock(),[edit(1000,0,rate)],1000,24000),/停止・逆再生/);
 assert.throws(()=>applyMovieEdits(clock(),[edit(500),edit(500)],1000,24000),/繰り返す/);
});
test('variable timestamp sampling is anchored to real reference time without appending an endpoint',()=>{
 const c=timing([0,10,20,100,120,140].map(cts=>({cts})),1000);
 assert.deepEqual(framePlan(0,5,3,1,1,c),[2,3,4]);
 const finer=framePlan(0,5,3,1,1,{...c,period:.001});assert.equal(new Set(finer).size,finer.length);assert(finer.includes(3));
 assert.deepEqual(framePlan(0,4,3,1,1,{...c,period:.025}),[0,2,3]);
 const uniform=timing(samples,24000);assert.deepEqual(framePlan(0,239,24,24,1,uniform),[0,24,48,72,96,120,144,168,192,216]);
});
test('frame nudges seek movie playback time while numeric fields retain media time',()=>{
 const c=applyMovieEdits(clock(),[edit(4000,0,0,16384)],1000,24000);
 const state={...c,count:c.times.length,start:0,end:239,background:0,reference:0};
 const video={currentTime:0,pause(){}};applyTimePoint(state,'reference',24,false,video);
 near(frameTime(state,state.reference),.1);near(video.currentTime,.4);
 applyTimePoint(state,'start',48,true,video);near(frameTime(state,state.background),.1);near(video.currentTime,.8);
});
test('real H264 file with a slow edit retains source PTS and decoder index mapping',async()=>{
 const bytes=Buffer.from(await readFile(new URL('./fixtures/projectile.mp4',import.meta.url)));
 const p=bytes.indexOf(Buffer.from('elst'));assert(p>0);
 bytes.writeUInt32BE(7200,p+12);bytes.writeInt16BE(0,p+20);bytes.writeInt16BE(16384,p+22);
 const media=await parseVideo(new Blob([bytes]));
 assert.equal(media.clock.ordered.length,108);near(media.clock.fps,60);
 near(media.clock.times[6],.1);near(media.clock.playbackTimes[6],.4);
 const sample=media.clock.ordered[6];assert.equal(media.ptsToIndex.get(Math.round(sample.cts*1e6/sample.timescale)),6);
 assert.deepEqual(framePlan(1,50,13,6,1,media.clock),[1,7,13,19,25,31,37,43,49]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFrameRole,previewFrameInfo,stablePreviewFrameInfo} from '../src/preview-frame.js';
import {guideSectionUrl} from '../src/guide-navigation.js';
import {observePreviewFrames,previewFrameTarget} from '../src/sampling-preview.js';
test('boundary indicators use actual playback timestamps and disappear during playback and seeking',()=>{
 const state={stage:'range',start:1,end:3,period:1/120,times:[0,.01,.02,.03],playbackTimes:[0,.04,.08,.12]},video={paused:true,seeking:false,hidden:false,currentTime:.04};
 assert.equal(previewFrameRole(state,'start',video),'start');
 assert.equal(previewFrameRole(state,'end',video),null);video.currentTime=.12;assert.equal(previewFrameRole(state,'end',video),'end');
 for(const patch of [{paused:false},{seeking:true},{hidden:true},{currentTime:.08}])assert.equal(previewFrameRole(state,'end',{...video,...patch}),null);
 assert.equal(previewFrameRole({...state,stage:'sampling'},'end',video),null);
 assert.equal(previewFrameRole(state,'background',video),null);
});

test('extraction overlay stays uniform on the reference frame, including after pausing',()=>{
 const state={stage:'sampling',reference:2,period:1/120,playbackTimes:[0,.04,.08,.12],samplingPreviewMode:'extract'},indices=[0,2,3];
 const video={paused:true,seeking:false,hidden:false,currentTime:.08};
 assert.deepEqual(previewFrameInfo(state,'reference',video,indices),{role:'extract',position:2,total:3});
 assert.deepEqual(previewFrameInfo(state,'reference',{...video,currentTime:.12},indices),{role:'extract',position:3,total:3});
 for(const patch of [{paused:false},{seeking:true},{hidden:true},{currentTime:.04},{currentTime:.2}])assert.equal(previewFrameInfo(state,'reference',{...video,...patch},indices),null);
});

test('manual reference selection restores its reference overlay using playback timestamps',()=>{
 const state={stage:'sampling',reference:2,period:1/120,playbackTimes:[0,.04,.08,.12],samplingPreviewMode:'reference'};
 const video={paused:true,seeking:false,hidden:false,currentTime:.08};
 assert.deepEqual(previewFrameInfo(state,'reference',video,[0,2,3]),{role:'reference'});
 assert.equal(previewFrameInfo(state,'reference',{...video,currentTime:.02},[0,2,3]),null);
});

test('extraction seeks preserve the border and displayed number until the next image is ready',()=>{
 const state={stage:'sampling',reference:2,period:1/30,playbackTimes:[0,.04,.08,.12],samplingPreviewMode:'extract'},indices=[0,2,3];
 let video={paused:true,seeking:false,hidden:false,currentTime:0};
 const first=stablePreviewFrameInfo(state,'reference',video,indices);
 assert.deepEqual(first,{role:'extract',position:1,total:3});
 video={...video,currentTime:.08,seeking:true};
 assert.deepEqual(stablePreviewFrameInfo(state,'reference',video,indices,first),first);
 const second=stablePreviewFrameInfo(state,'reference',{...video,seeking:false},indices,first);
 assert.deepEqual(second,{role:'extract',position:2,total:3});
 assert.deepEqual(stablePreviewFrameInfo({...state,samplingPreviewMode:'reference'},'reference',{...video,seeking:false},indices,second),{role:'reference'});
 assert.equal(stablePreviewFrameInfo({...state,samplingPreviewMode:'manual'},'reference',{...video,seeking:false},indices,second),null);
 assert.equal(stablePreviewFrameInfo({...state,stage:'result'},'reference',video,indices,second),null);
});
test('extraction labels describe the presented image, not the requested seek timestamp',()=>{
 class Video extends EventTarget{
  constructor(){super();this.currentTime=.02;this.paused=true;this.readyState=2;this.seeking=false;this.frames=new Map();this.id=0;}
  requestVideoFrameCallback(fn){this.frames.set(++this.id,fn);return this.id;}
  present(mediaTime){const callbacks=[...this.frames.values()];this.frames.clear();for(const fn of callbacks)fn(0,{mediaTime});}
 }
 const state={stage:'sampling',count:5,reference:2,period:.04,playbackTimes:[0,.04,.08,.12,.16],samplingPreviewMode:'extract'},indices=[0,2,4],video=new Video();observePreviewFrames(video);
 assert.equal(previewFrameInfo(state,'reference',video,indices),null);
 video.present(0);const first=previewFrameInfo(state,'reference',video,indices);assert.deepEqual(first,{role:'extract',position:1,total:3});
 video.currentTime=previewFrameTarget(state,2).time;
 assert.equal(previewFrameInfo(state,'reference',video,indices),null);
 assert.deepEqual(stablePreviewFrameInfo(state,'reference',video,indices,first),first);
 video.present(.04);assert.equal(previewFrameInfo(state,'reference',video,indices),null);
 video.present(.08);assert.deepEqual(previewFrameInfo(state,'reference',video,indices),{role:'extract',position:2,total:3});
});
test('header help preserves the hosting base and opens the current guide section',()=>{
 for(const baseURI of ['https://aniozu.github.io/motion-strobe/','https://motion-strobe-lab.workspace-552571.chatgpt.site/'])for(const lang of ['ja','en','ru','ko']){
  const doc={baseURI,documentElement:{lang}},guide=baseURI+(lang==='ja'?'':'en/')+'guide/';
  assert.equal(guideSectionUrl(doc,'range',false),guide+'#section-1');
  for(const [stage,section] of [['range',2],['sampling',3],['result',4]])assert.equal(guideSectionUrl(doc,stage,true),guide+`#section-${section}`);
 }
});

test('sampling reference indicator uses the selected source frame and clears for playback, seek and other stages',()=>{
 const state={stage:'sampling',start:0,end:3,reference:2,period:1/120,times:[0,.01,.02,.03],playbackTimes:[0,.04,.08,.12]},video={paused:true,seeking:false,hidden:false,currentTime:.08};
 assert.equal(previewFrameRole(state,'reference',video),'reference');
 for(const patch of [{paused:false},{seeking:true},{hidden:true},{currentTime:.02},{currentTime:.12}])assert.equal(previewFrameRole(state,'reference',{...video,...patch}),null);
 for(const stage of ['range','result'])assert.equal(previewFrameRole({...state,stage},'reference',video),null);
 assert.equal(previewFrameRole(state,'start',video),null);
});

test('manual background selection shows its frame indicator only at the selected paused playback time',()=>{
 const state={stage:'range',start:1,end:3,background:2,backgroundMode:'manual',period:1/120,times:[0,.01,.02,.03],playbackTimes:[0,.04,.08,.12]},video={paused:true,seeking:false,hidden:false,currentTime:.08};
 assert.equal(previewFrameRole(state,'background',video),'background');
 for(const patch of [{paused:false},{seeking:true},{hidden:true},{currentTime:.02}])assert.equal(previewFrameRole(state,'background',{...video,...patch}),null);
 assert.equal(previewFrameRole({...state,backgroundMode:'auto'},'background',video),null);
 for(const stage of ['sampling','result'])assert.equal(previewFrameRole({...state,stage},'background',video),null);
});

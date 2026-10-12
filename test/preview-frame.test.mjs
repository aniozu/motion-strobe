import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFrameRole} from '../src/preview-frame.js';
import {guideSectionUrl} from '../src/guide-navigation.js';
test('boundary indicators use actual playback timestamps and disappear during playback and seeking',()=>{
 const state={stage:'range',start:1,end:3,period:1/120,times:[0,.01,.02,.03],playbackTimes:[0,.04,.08,.12]},video={paused:true,seeking:false,hidden:false,currentTime:.04};
 assert.equal(previewFrameRole(state,'start',video),'start');
 assert.equal(previewFrameRole(state,'end',video),null);video.currentTime=.12;assert.equal(previewFrameRole(state,'end',video),'end');
 for(const patch of [{paused:false},{seeking:true},{hidden:true},{currentTime:.08}])assert.equal(previewFrameRole(state,'end',{...video,...patch}),null);
 assert.equal(previewFrameRole({...state,stage:'sampling'},'end',video),null);
 assert.equal(previewFrameRole(state,'background',video),null);
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

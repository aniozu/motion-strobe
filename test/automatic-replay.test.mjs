import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReplayPlan} from '../src/automatic-replay.js';
import {switchTrackingMethod} from '../src/tracking-method.js';

test('re-extraction opts in only previously automated objects and retains fixed positions and skips',()=>{
 const seed={index:8,x:70,y:34,mode:'center',source:'object',spaceWidth:640,spaceHeight:360};
 const skip={index:11,mode:'skip'},automatic={index:14,x:80,y:34,mode:'center',source:'auto'};
 const objects=[{id:0,autoEnabled:true,anchors:[seed,skip,automatic],seedIndex:8},{id:1,anchors:[{...seed,index:5}],seedIndex:5}];
 const before=structuredClone(objects),plan=automaticReplayPlan(objects,50);
 assert.deepEqual(plan,[{objectId:0,seedIndex:8,anchors:[seed,skip]}]);
 assert.deepEqual(objects,before);assert.equal(plan[0].anchors[0].spaceWidth,640);
});
test('both objects keep independent seeds even when a new extraction grid does not contain them',()=>{
 const objects=[0,1].map(id=>({id,autoEnabled:true,seedIndex:8+id,anchors:[{index:8+id,x:30+id*100,y:40,mode:'center',source:'manual'}]}));
 assert.deepEqual(automaticReplayPlan(objects,50).map(entry=>[entry.objectId,entry.seedIndex]),[[0,8],[1,9]]);
 objects[0].anchors[0].index=100;assert.deepEqual(automaticReplayPlan(objects,50).map(entry=>entry.objectId),[1]);
});
test('automatic replay eligibility follows the selected tracking method',()=>{
 const object={id:0,autoEnabled:true,anchors:[{index:6,x:30,y:40,mode:'center',source:'manual'}],seedIndex:6};
 switchTrackingMethod(object,'point');assert.equal(automaticReplayPlan([object],20).length,0);
 switchTrackingMethod(object,'center');assert.equal(automaticReplayPlan([object],20).length,1);
});

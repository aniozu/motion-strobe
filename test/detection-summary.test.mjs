import test from 'node:test';
import assert from 'node:assert/strict';
import {detectionSummary,reviewFramePositions,nextReviewPosition} from '../src/detection-summary.js';

test('all-frame result distinguishes detected, protected, uncertain and skipped positions',()=>{
 const marks=[
  {mode:'center',source:'manual',x:1,y:2},
  {mode:'center',source:'object',x:3,y:4},
  {mode:'center',source:'auto',x:5,y:6},
  {mode:'center',source:'auto',x:7,y:8,uncertain:true},
  {mode:'missing',source:'auto'},
  {mode:'skip'},
  {mode:'center',source:'auto',x:NaN,y:0}
 ];
 const before=structuredClone(marks);
 assert.deepEqual(detectionSummary(marks),{total:7,successful:3,automatic:1,fixed:2,missing:2,uncertain:1,skipped:1});
 assert.deepEqual(marks,before);
});

test('review navigation follows extraction order, wraps and excludes deliberate skips and old frames',()=>{
 const indices=[2,5,8,11,14,17];
 const centers=[{index:17,confidence:'missing'},{index:14,x:20,y:30,confidence:'auto'},{index:11,x:20,y:30,confidence:'uncertain'},{index:8,confidence:'skipped'},{index:5,confidence:'missing'},{index:2,x:4,y:5,confidence:'manual'},{index:99,confidence:'missing'}];
 assert.deepEqual(reviewFramePositions(indices,centers),[1,3,5]);
 assert.equal(nextReviewPosition(indices,centers),1);assert.equal(nextReviewPosition(indices,centers,1),3);assert.equal(nextReviewPosition(indices,centers,5),1);
 assert.deepEqual(reviewFramePositions([1,2],[]),[0,1]);
 assert.equal(nextReviewPosition([8,14],centers),null);
});

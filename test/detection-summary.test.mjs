import test from 'node:test';
import assert from 'node:assert/strict';
import {detectionSummary} from '../src/detection-summary.js';

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

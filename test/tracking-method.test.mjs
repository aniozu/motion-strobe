import test from 'node:test';import assert from 'node:assert/strict';
import {switchTrackingMethod} from '../src/tracking-method.js';
test('center and material-point measurements retain separate seeds, manual fixes and skips across method switches',()=>{
 const center=[{index:6,x:30,y:40,source:'manual',mode:'center'},{index:9,mode:'skip'}],summary={fixed:1},object={anchors:center,seedIndex:6,summary};
 switchTrackingMethod(object,'point');assert.deepEqual(object.anchors,[]);assert.equal(object.seedIndex,null);
 const point=[{index:12,x:50.125,y:60.875,mode:'center',source:'manual'}];object.anchors=point;object.seedIndex=12;
 switchTrackingMethod(object,'center');assert.equal(object.anchors,center);assert.equal(object.seedIndex,6);assert.equal(object.summary,summary);
 switchTrackingMethod(object,'point');assert.equal(object.anchors,point);assert.equal(object.seedIndex,12);assert.deepEqual(center,[{index:6,x:30,y:40,source:'manual',mode:'center'},{index:9,mode:'skip'}]);
});

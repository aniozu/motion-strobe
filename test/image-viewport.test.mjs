import test from 'node:test';import assert from 'node:assert/strict';import {ImageViewport} from '../src/image-viewport.js';
test('zoom is bounded and the crop stays within the source through repeated edge zooms and pans',()=>{
 const v=new ImageViewport(960,540);
 for(let i=0;i<20;i++){v.zoom(1.5,100,70);v.pan(-200,200);assert(v.scale<=8);assert(v.x-960/(2*v.scale)>=-1e-9);assert(v.x+960/(2*v.scale)<=960+1e-9);assert(v.y-540/(2*v.scale)>=-1e-9);assert(v.y+540/(2*v.scale)<=540+1e-9);}
 v.zoom(.0001);assert.equal(v.scale,1);assert.deepEqual(v.point(100,70),{x:100,y:70});
});

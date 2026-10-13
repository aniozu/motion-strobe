import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFrames,registrationImage,interpolateCameraTransform,cameraTransformFromNeighbors,invertTransform,identityTransform,transformPoint} from '../src/stabilization.js';
import {cameraTransformForVideo} from '../src/video-export.js';
import {cameraMatrix,texturedBackground,movingObject,transformed,errorAtGrid,width,height} from './stabilization-fixtures.mjs';
const blank=()=>{const pixels=new Uint8ClampedArray(width*height*4);for(let i=0;i<pixels.length;i+=4)pixels.set([120,120,120,255],i);return pixels;};

test('a missing photo uses time-based interpolation between independently matched poses',async()=>{
 const bg=texturedBackground(),last=cameraMatrix({dx:12,dy:4,angle:.03,scale:1.004}),frames=new Map([[0,bg],[2,blank()],[5,transformed(movingObject(bg,225,120),last)]]),times={0:0,2:.02,5:.12};
 const result=await registerFrames({indices:[0,2,5],getFrame:i=>frames.get(i),width,height,timeForIndex:i=>times[i],yieldTurn:async()=>{}});
 assert.equal(result.summary.interpolatedFrames,1);assert.equal(result.summary.heldFrames,0);assert.equal(result.measuredTransforms.has(2),false);
 const expected=invertTransform(interpolateCameraTransform(identityTransform(),last,1/6,width,height));
 assert(errorAtGrid(result.transforms.get(2),expected).max<.1);
 assert(errorAtGrid(result.transforms.get(2),invertTransform(interpolateCameraTransform(identityTransform(),last,.4,width,height))).mean>2);
});

test('consecutive and long gaps continue without promoting estimated poses to measured anchors',async()=>{
 const bg=texturedBackground(),last=cameraMatrix({dx:8,dy:-4,angle:.02}),frames=[bg,blank(),blank(),blank(),transformed(movingObject(bg,230,130),last)],times=[0,.3,.8,1.4,2];
 const result=await registerFrames({indices:[0,1,2,3,4],getFrame:i=>frames[i],width,height,timeForIndex:i=>times[i],yieldTurn:async()=>{}});
 assert.equal(result.transforms.size,5);assert.equal(result.summary.interpolatedFrames,3);assert.equal(result.measuredTransforms.size,2);
 for(const index of [1,2,3])assert(errorAtGrid(result.transforms.get(index),invertTransform(interpolateCameraTransform(identityTransform(),last,times[index]/2,width,height))).max<.1);
});

test('missing boundary frames hold the closest measured pose and preserve affine invertibility',()=>{
 const left=cameraMatrix({dx:4,angle:Math.PI-.02}),right=cameraMatrix({dx:12,angle:-Math.PI+.02}),middle=interpolateCameraTransform(left,right,.5,width,height);
 assert(Math.abs(Math.hypot(middle[0],middle[1])-1)<1e-10);assert(invertTransform(middle));
 const center=transformPoint(middle,width/2,height/2);assert(Math.abs(center.x-width/2-8)<1e-10);
 const measured=new Map([[3,invertTransform(left)],[9,invertTransform(right)]]);
 for(const [index,anchor] of [[0,3],[12,9]]){const result=cameraTransformFromNeighbors(measured,index,{width,height});assert.equal(result.mode,'held');assert.deepEqual(result.matrix,measured.get(anchor));}
 const a=[1.02,.03,.04,.97,4,-2],b=[.96,-.02,-.03,1.04,-3,5];for(let t=0;t<=1;t+=.05){const m=interpolateCameraTransform(a,b,t,width,height);assert(m[0]*m[3]-m[1]*m[2]>0);}
});

test('unmatched video frames use future photo anchors, stay cached and never seed subsequent interpolation',()=>{
 const bg=texturedBackground(),last=cameraMatrix({dx:12,dy:4,angle:.03}),measured=new Map([[0,identityTransform()],[4,invertTransform(last)]]),stabilization={reference:registrationImage(bg,width,height),transforms:new Map(measured),measuredTransforms:new Map(measured),videoTransforms:new Map(measured),estimatedFrames:new Map(),timeForIndex:i=>[0,.01,.03,.07,.1][i]};
 for(const index of [1,2,3]){
  const m=cameraTransformForVideo(stabilization,blank(),width,height,index),expected=invertTransform(interpolateCameraTransform(identityTransform(),last,stabilization.timeForIndex(index)/.1,width,height));
  assert(errorAtGrid(m,expected).max<1e-8);assert.deepEqual(cameraTransformForVideo(stabilization,null,width,height,index),m);
 }
 assert.equal(stabilization.measuredTransforms.size,2);assert.equal(stabilization.videoEstimatedIndices.size,3);assert.equal(stabilization.estimatedFrames.size,3);
});

test('photo and video interpolate in the same fixed-template space after an affine first-frame conversion',async()=>{
 const bg=texturedBackground(),frames=[bg,transformed(movingObject(bg,125,110),[1.025,.01,.025,.985,-4,-1]),blank(),transformed(movingObject(bg,235,130),[1.04,.02,.045,.975,-8,-1])];
 const result=await registerFrames({indices:[0,1,2,3],getFrame:i=>frames[i],width,height,matchingReferenceIndex:1,yieldTurn:async()=>{}});
 assert.equal(result.summary.interpolatedFrames,1);assert.equal(result.measuredTransforms.has(2),false);
 const stabilization={...result,videoTransforms:new Map(result.measuredTransforms)};
 cameraTransformForVideo(stabilization,null,width,height,0);
 const inferred=cameraTransformForVideo(stabilization,frames[2],width,height,2);
 assert(errorAtGrid(inferred,result.transforms.get(2)).max<1e-8);
});

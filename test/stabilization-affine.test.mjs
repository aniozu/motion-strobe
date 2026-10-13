import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationImage,estimateCameraTransform,registerFrames,invertTransform,identityTransform,transformPoint} from '../src/stabilization.js';
import {cameraTransformForVideo} from '../src/video-export.js';
import {cameraMatrix,texturedBackground,movingObject,width,height,transformed,errorAtGrid} from './stabilization-fixtures.mjs';

test('mild camera shear and unequal scale are corrected without following a moving foreground object',()=>{
 const bg=texturedBackground(),reference=movingObject(bg,65,100);
 for(const matrix of [[1.04,.02,.045,.975,-8,-1],[.96,-.035,-.045,1.025,10,5],[1,.01,.055,1,-4,0]]){
  const object={x:210,y:115},frame=transformed(movingObject(bg,object.x,object.y),matrix);
  const result=estimateCameraTransform(registrationImage(reference,width,height),registrationImage(frame,width,height));
  assert(result);assert.equal(result.model,'affine');assert(result.inliers>=14);
  assert(errorAtGrid(result.matrix,invertTransform(matrix)).max<.1);
  const observed=transformPoint(matrix,object.x,object.y),corrected=transformPoint(result.matrix,observed.x,observed.y);
  assert(Math.hypot(corrected.x-object.x,corrected.y-object.y)<.1);
 }
});

test('an alternate fixed matching template keeps photo and video coordinates anchored to the first frame',async()=>{
 const bg=texturedBackground(),matrices=[identityTransform(),[1.025,.01,.025,.985,-4,-1],[1.04,.02,.045,.975,-8,-1]],frames=matrices.map((m,n)=>transformed(movingObject(bg,70+n*65,105),m));
 const registration=await registerFrames({indices:[0,1],getFrame:i=>frames[i],width,height,referenceIndex:0,matchingReferenceIndex:1,yieldTurn:async()=>{}});
 assert.equal(registration.referenceIndex,0);assert.equal(registration.matchingReferenceIndex,1);
 assert.deepEqual(registration.transforms.get(0),identityTransform());
 for(const i of [0,1])assert(errorAtGrid(registration.transforms.get(i),invertTransform(matrices[i])).max<.1);
 const stabilization={...registration,videoTransforms:new Map(registration.transforms)};
 assert.deepEqual(cameraTransformForVideo(stabilization,null,width,height,1),registration.transforms.get(1));
 const matrix=cameraTransformForVideo(stabilization,frames[2],width,height,2);
 assert(errorAtGrid(matrix,invertTransform(matrices[2])).max<.1);
 assert.deepEqual(cameraTransformForVideo(stabilization,null,width,height,2),matrix);
});

test('a failed first-template batch retries once from a fixed decoded template without accumulating drift',async()=>{
 const bg=texturedBackground(),matrices=[1,1.04,1.08,1.12,1.16,1.20].map(scale=>cameraMatrix({scale}));
 const frames=matrices.map((m,i)=>transformed(movingObject(bg,65+i*25,105),m)),settings={indices:frames.map((_,i)=>i),getFrame:i=>frames[i],width,height,referenceIndex:0,yieldTurn:async()=>{}};
 const estimated=await registerFrames(settings);assert.equal(estimated.summary.heldFrames,2);
 assert.deepEqual(estimated.transforms.get(4),estimated.transforms.get(3));assert.equal(estimated.measuredTransforms.has(4),false);
 const progress=[],result=await registerFrames({...settings,fallbackReferenceIndex:2,onProgress:p=>progress.push(p)});
 assert.equal(result.matchingReferenceIndex,2);assert.equal(result.referenceIndex,0);assert.equal(result.transforms.size,frames.length);
 for(let i=1;i<progress.length;i++)assert(progress[i]>=progress[i-1]);
 for(let i=0;i<frames.length;i++)assert(errorAtGrid(result.transforms.get(i),invertTransform(matrices[i])).max<.1);
 assert.deepEqual(result.transforms.get(0),identityTransform());
});

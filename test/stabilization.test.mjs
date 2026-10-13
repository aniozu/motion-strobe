import test from 'node:test';import assert from 'node:assert/strict';
import {identityTransform,registrationImage,estimateCameraTransform,registerFrames,invertTransform,combineTransforms,scaledTransform,transformPoint,warpPixels} from '../src/stabilization.js';
import {series,width,height,cameraMatrix,texturedBackground,movingObject,transformed,errorAtGrid} from './stabilization-fixtures.mjs';
test('background registration corrects translation, rotation and scale without cancelling object motion',async t=>{
 const {frames,truth}=series(),original=frames.map(f=>new Uint8ClampedArray(f)),start=performance.now();
 const result=await registerFrames({indices:frames.map((_,i)=>i),getFrame:i=>frames[i],width,height,yieldTurn:async()=>{}});
 let before=0,after=0,max=0;
 for(let n=1;n<frames.length;n++){
  const expected=invertTransform(truth[n].matrix),matrix=result.transforms.get(n),error=errorAtGrid(matrix,expected);after+=error.mean;max=Math.max(max,error.max);before+=errorAtGrid(identityTransform(),expected).mean;
  const observed=transformPoint(truth[n].matrix,truth[n].object.x,truth[n].object.y),corrected=transformPoint(matrix,observed.x,observed.y);
  assert(Math.hypot(corrected.x-truth[n].object.x,corrected.y-truth[n].object.y)<.55,`${n}: object moved incorrectly`);
  assert(error.max<.55,`${n}: ${JSON.stringify(error)}`);assert.deepEqual(frames[n],original[n]);
 }
 t.diagnostic(`${frames.length} cached 320×192 frames, ${Math.round(performance.now()-start)} ms; camera error ${before/(frames.length-1)} → ${after/(frames.length-1)} px; max ${max} px.`);
});
test('a larger camera jump uses recovery matching instead of following the foreground',()=>{
 const bg=texturedBackground(),ref=movingObject(bg,65,100),truth=cameraMatrix({dx:27,dy:-17,angle:.035,scale:1.012}),frame=transformed(movingObject(bg,225,120),truth);
 const result=estimateCameraTransform(registrationImage(ref,width,height),registrationImage(frame,width,height));
 assert(result,'registration failed');assert(errorAtGrid(result.matrix,invertTransform(truth)).max<.7);
});
test('featureless background and unrelated content are rejected instead of inventing a correction',async()=>{
 const flat=new Uint8ClampedArray(width*height*4);for(let p=0;p<flat.length;p+=4)flat.set([110,110,110,255],p);
 assert.equal(estimateCameraTransform(registrationImage(flat,width,height),registrationImage(flat,width,height)),null);
 await assert.rejects(registerFrames({indices:[0,1],getFrame:()=>flat,width,height}),/模様/);
 const bg=texturedBackground(),other=new Uint8ClampedArray(bg);for(let y=0;y<height;y++)for(let x=0;x<width;x++)other.set(bg.subarray(((height-1-y)*width+width-1-x)*4,((height-1-y)*width+width-1-x)*4+4),(y*width+x)*4);
 assert.equal(estimateCameraTransform(registrationImage(bg,width,height),registrationImage(other,width,height)),null);
});
test('motion outside the allowed camera range is rejected',()=>{
 const bg=texturedBackground(),frame=transformed(bg,cameraMatrix({angle:.5}));
 assert.equal(estimateCameraTransform(registrationImage(bg,width,height),registrationImage(frame,width,height)),null);
});
test('registration cancellation discards the incomplete batch and releases control between images',async()=>{
 const {frames}=series(5);let stop=false,progress=0;
 const result=await registerFrames({indices:[0,1,2,3,4],getFrame:i=>frames[i],width,height,cancelled:()=>stop,yieldTurn:async()=>{stop=true;},onProgress:()=>progress++});
 assert.equal(result,null);assert.equal(progress,1);
});
test('transform inversion, combination, scaling and border validity preserve coordinates',()=>{
 const m=cameraMatrix({dx:8,dy:-4,angle:.015,scale:1.01}),inverse=invertTransform(m),product=combineTransforms(m,inverse);
 for(let i=0;i<6;i++)assert(Math.abs(product[i]-identityTransform()[i])<1e-10);
 const full=transformPoint(m,100,70),half=transformPoint(scaledTransform(m,.5),50,35);assert(Math.abs(half.x-full.x/2)<1e-10);assert(Math.abs(half.y-full.y/2)<1e-10);
 const out=warpPixels(texturedBackground(),width,height,[1,0,0,1,8,0]);assert.equal(out[3],0);assert.equal(out[(50*width+20)*4+3],255);
 assert.equal(invertTransform([0,0,0,0,1,1]),null);
});

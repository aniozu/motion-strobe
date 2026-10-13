import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {registrationImage,estimateCameraTransform,invertTransform,identityTransform,warpPixels,transformPoint} from '../src/stabilization.js';
import {cameraMatrix,errorAtGrid} from './stabilization-fixtures.mjs';
import {readFileSync} from 'node:fs';
import {cameraTransformForVideo} from '../src/video-export.js';
import {combineTransforms,registerFrames} from '../src/stabilization.js';
test('real projectile sample with artificial camera shake aligns to its stationary background',async t=>{
 const w=960,h=540,bytes=w*h*4;
 const raw=execFileSync('ffmpeg',['-v','error','-i','dist/sample-parabolic-motion.mp4','-vf',"select='between(n,16,88)*not(mod(n-16,6))',scale=960:540",'-fps_mode','passthrough','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:40*1024*1024});
 const frames=Array.from({length:13},(_,i)=>raw.subarray(i*bytes,(i+1)*bytes)),ref=registrationImage(frames[0],w,h);const start=performance.now();let max=0,average=0;
 for(let n=1;n<frames.length;n++){
  const matrix=cameraMatrix({dx:14*Math.sin(n*1.7),dy:10*Math.cos(n*.8),angle:.012*Math.sin(n*1.2),scale:1+.004*Math.sin(n*.6)},w,h),shaken=warpPixels(frames[n],w,h,matrix),result=estimateCameraTransform(ref,registrationImage(shaken,w,h));
  assert(result,`frame ${16+n*6} failed registration`);const error=errorAtGrid(result.matrix,invertTransform(matrix),w,h);max=Math.max(max,error.max);average+=error.mean;
  assert(error.max<1.5,`${n}: ${JSON.stringify(error)}`);
 }
 t.diagnostic(`Real background + known camera motion, 13×960×540: ${Math.round(performance.now()-start)} ms (including JS warping); mean error ${average/12} px, max ${max} px.`);
});

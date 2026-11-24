import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';
import {registrationImage,estimateCameraTransform,invertTransform,combineTransforms,identityTransform,transformPoint,scaledTransform,registerFrames} from '../src/stabilization.js';
import {cameraTransformForVideo} from '../src/video-export.js';
import {createRequire} from 'node:module';
import {width,height,texturedBackground,movingObject,transformed,cameraMatrix,errorAtGrid} from './stabilization-fixtures.mjs';
let canvasModule;for(const root of [import.meta.url,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/entry.js':null].filter(Boolean))try{canvasModule=createRequire(root)('@napi-rs/canvas');break;}catch{}

function lineFit(points){let sx=0,sy=0,sxx=0,sxy=0;for(const {t,x} of points){sx+=t;sy+=x;sxx+=t*t;sxy+=t*x;}const n=points.length,slope=(n*sxy-sx*sy)/(n*sxx-sx*sx),offset=(sy-slope*sx)/n;return {slope,offset,rms:Math.sqrt(points.reduce((sum,p)=>sum+(p.x-offset-slope*p.t)**2,0)/n)};}
function greenCenter(frame,w,h){let x=0,y=0,n=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const p=(yy*w+xx)*4;if(frame[p+1]>frame[p]+18&&frame[p+1]>frame[p+2]+16&&frame[p+1]>40){x+=xx;y+=yy;n++;}}return n>20?{x:x/n,y:y/n}:null;}
function decode(path,w,h){return execFileSync('ffmpeg',['-v','error','-i',path,'-vf',`scale=${w}:${h}`,'-fps_mode','passthrough','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:180*1024*1024});}

test('a long constant-motion sequence corrects slow drift without accumulating alignment error',async t=>{
 const bg=texturedBackground(),count=120,frames=[],truth=[];
 for(let n=0;n<count;n++){const u=n/(count-1),matrix=cameraMatrix({dx:24*u+1.5*Math.sin(n*.22),dy:-5*u+.6*Math.sin(n*.31),angle:.006*u,scale:1+.003*u}),object={x:45+200*u,y:90};frames.push(transformed(movingObject(bg,object.x,object.y),matrix));truth.push({matrix,object});}
 const start=performance.now(),result=await registerFrames({indices:frames.map((_,n)=>n),getFrame:n=>frames[n],width,height,yieldTurn:async()=>{}});let early=0,late=0,max=0;
 const measured=[],raw=[];
 for(let n=0;n<count;n++){
  const matrix=result.transforms.get(n),error=errorAtGrid(matrix,invertTransform(truth[n].matrix));max=Math.max(max,error.max);if(n<20)early+=error.mean;if(n>=100)late+=error.mean;
  const observed=transformPoint(truth[n].matrix,truth[n].object.x,truth[n].object.y),corrected=transformPoint(matrix,observed.x,observed.y);measured.push({t:n*.25,x:corrected.x});raw.push({t:n*.25,x:observed.x});
 }
 const cleanSlope=200/((count-1)*.25),correctedFit=lineFit(measured),rawFit=lineFit(raw);assert(max<.7);assert(late/20<.3);assert(Math.abs(correctedFit.slope/cleanSlope-1)<.002);
 t.diagnostic(`120 images over 29.75 s: first/last 20 mean camera error ${(early/20).toFixed(4)}/${(late/20).toFixed(4)} px, max ${max.toFixed(4)} px. Velocity error ${(100*(rawFit.slope/cleanSlope-1)).toFixed(3)}% → ${(100*(correctedFit.slope/cleanSlope-1)).toFixed(3)}%; ${Math.round(performance.now()-start)} ms.`);
});

for(const profile of ['side','top'])test(`real constant-speed ${profile} sample retains trajectory and velocity after gentle shake and drift`,async t=>{
 const truth=JSON.parse(readFileSync(`test/fixtures/stabilization-drift-${profile}-truth.json`)),w=profile==='side'?640:800,h=profile==='side'?360:200,bytes=w*h*4,source=decode('dist/'+truth.source,w,h),shaken=decode(`dist/stabilization-test-drift-${profile}.mp4`,w,h),sx=w/truth.width,sy=h/truth.height;
 assert.equal(source.length,shaken.length);const count=source.length/bytes,originalRef=registrationImage(source.subarray(0,bytes),w,h),ref=registrationImage(shaken.subarray(0,bytes),w,h),stabilization={reference:ref,videoTransforms:new Map([[0,identityTransform()]])};
 const range=profile==='side'?[.85,1.6]:[.95,1.65],clean=[],uncorrected=[],corrected=[],nativePositions=[];let baselineForward=null,mean=0,max=0,lastError=0;const start=performance.now();
 let sourceCanvas,outputCanvas,sourceCtx,outputCtx;if(canvasModule){sourceCanvas=canvasModule.createCanvas(w,h);outputCanvas=canvasModule.createCanvas(w,h);sourceCtx=sourceCanvas.getContext('2d');outputCtx=outputCanvas.getContext('2d');}
 for(let n=0;n<count;n++){
  const orig=source.subarray(n*bytes,(n+1)*bytes),current=shaken.subarray(n*bytes,(n+1)*bytes),matrix=cameraTransformForVideo(stabilization,current,w,h,n),baseline=n?estimateCameraTransform(originalRef,registrationImage(orig,w,h),{initial:baselineForward}):{matrix:identityTransform(),forward:identityTransform()};
  assert(baseline,`Unaltered frame ${n} could not be matched`);baselineForward=baseline.forward;
  const expected=combineTransforms(baseline.matrix,invertTransform(scaledTransform(truth.matrices[n],sx,sy))),error=errorAtGrid(matrix,expected,w,h);mean+=error.mean;max=Math.max(max,error.max);lastError=error.mean;
  assert(error.max<1.5,`${n}: ${JSON.stringify(error)}`);
  const time=n/truth.fps;if(time<range[0]||time>range[1])continue;const p=greenCenter(orig,w,h),q=greenCenter(current,w,h);if(!p||p.x<25||p.x>w-25)continue;assert(q,`Visible object ${n} was lost`);
  const baselinePoint=transformPoint(baseline.matrix,p.x,p.y),measured=transformPoint(matrix,q.x,q.y);clean.push({t:time,x:baselinePoint.x});uncorrected.push({t:time,x:q.x});corrected.push({t:time,x:measured.x});
  if(canvasModule){sourceCtx.putImageData(new canvasModule.ImageData(new Uint8ClampedArray(current.buffer,current.byteOffset,current.byteLength),w,h),0,0);outputCtx.clearRect(0,0,w,h);outputCtx.save();outputCtx.transform(...matrix);outputCtx.drawImage(sourceCanvas,0,0);outputCtx.restore();const center=greenCenter(outputCtx.getImageData(0,0,w,h).data,w,h);assert(center);nativePositions.push({t:time,x:center.x});}
 }
 assert(clean.length>=15);const cleanFit=lineFit(clean),rawFit=lineFit(uncorrected),fit=lineFit(corrected),positionRms=Math.sqrt(corrected.reduce((sum,p,i)=>sum+(p.x-clean[i].x)**2,0)/corrected.length),speedError=Math.abs(fit.slope/cleanFit.slope-1);
 assert(positionRms<1);assert(speedError<.006);assert(lastError<.7);
 if(canvasModule){const nativeFit=lineFit(nativePositions),nativeRms=Math.sqrt(nativePositions.reduce((sum,p,i)=>sum+(p.x-clean[i].x)**2,0)/clean.length);assert(nativeRms<1);assert(Math.abs(nativeFit.slope/cleanFit.slope-1)<.006);t.diagnostic(`Actual native-canvas pixels: position RMS ${nativeRms} px; velocity error ${100*Math.abs(nativeFit.slope/cleanFit.slope-1)}%.`);}
 // Exercise the first-selected-frame reference used by the actual editor.
 const first=Math.round(range[0]*truth.fps),last=Math.round(range[1]*truth.fps),step=Math.round(.1*truth.fps),indices=[...new Set([...Array.from({length:Math.floor((last-first)/step)+1},(_,n)=>first+n*step),...Array.from({length:8},(_,n)=>Math.round(first+n*(last-first)/7))])].sort((a,b)=>a-b);
 const selected=await registerFrames({indices,getFrame:n=>shaken.subarray(n*bytes,(n+1)*bytes),width:w,height:h,referenceIndex:first,yieldTurn:async()=>{}});assert.equal(selected.transforms.size,indices.length);
 const editorStabilization={...selected,videoTransforms:new Map(selected.transforms)};for(let n=first;n<=last;n++)assert(cameraTransformForVideo(editorStabilization,shaken.subarray(n*bytes,(n+1)*bytes),w,h,n));
 t.diagnostic(`${profile}: ${count} frames, ${Math.round(performance.now()-start)} ms (two independent registration sequences). Camera mean ${mean/count} px/max ${max} px/end ${lastError} px. Object ${clean.length} points: position RMS ${positionRms} px; velocity ${cleanFit.slope} → raw ${rawFit.slope} → corrected ${fit.slope} px/s, error ${100*speedError}%.`);
});
test('a static camera with a moving object does not acquire artificial drift',async()=>{
 const bg=texturedBackground(),frames=Array.from({length:40},(_,n)=>movingObject(bg,45+n*5,90)),result=await registerFrames({indices:frames.map((_,n)=>n),getFrame:n=>frames[n],width,height,yieldTurn:async()=>{}});
 for(const m of result.transforms.values())assert(errorAtGrid(m,identityTransform()).max<.05);
});

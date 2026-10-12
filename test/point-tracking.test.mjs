import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {trackSelectedPoint} from '../src/point-tracking.js';
import {measuredCenters} from '../src/annotations.js';
import {centersFromMarks} from '../src/tracking.js';
const width=240,height=180;
function image({x=90,y=80,angle=0,scale=1,missing=false,drift=0,mark=true,distractor=false}={}){
 const frame=new Uint8ClampedArray(width*height*4),co=Math.cos(angle),si=Math.sin(angle);
 for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
  let rgb=[35+drift,42+drift,48+drift],u=((xx-x)*co+(yy-y)*si)/scale,v=(-(xx-x)*si+(yy-y)*co)/scale;
  if(!missing){
   if(u>=-5&&u<=5&&v>=-5&&v<=40)rgb=[155+drift,112+drift,65+drift];
   if(u>=-23&&u<=23&&v>=-19&&v<=-6)rgb=[195+drift,180+drift,148+drift];
   if(mark&&Math.hypot(u,v)<=3.5)rgb=[220+drift,35+drift,30+drift];
  }
  if(distractor&&xx>=180&&xx<=215&&yy>=110&&yy<=150)rgb=[220,35,30];
  frame.set([...rgb,255],(yy*width+xx)*4);
 }
 return frame;
}
const background=image({missing:true});
const run=(frames,marks,seedIndex=0,options={})=>trackSelectedPoint({indices:frames.map((_,i)=>i),getFrame:i=>frames[i],background,width,height,marks,seedIndex,...options});
test('marked rotating hammer tracks the selected material point, not the silhouette centroid, in both directions',async()=>{
 const positions=Array.from({length:7},(_,i)=>({x:65+i*14.25,y:80+(i-3)**2*.7,angle:(i-3)*Math.PI/5,scale:1+i*.025,drift:i*2,distractor:true}));
 const seed=3,marks=[{index:seed,mode:'center',x:positions[seed].x,y:positions[seed].y,source:'manual'}],original=structuredClone(marks);
 const result=await run(positions.map(image),marks,seed);
 assert.deepEqual(marks,original);assert.deepEqual(result[seed],marks[0]);
 for(let i=0;i<result.length;i++){
  assert.equal(result[i].mode,'center',JSON.stringify(result));
  assert(!result[i].uncertain,JSON.stringify(result));
  assert(Math.hypot(result[i].x-positions[i].x,result[i].y-positions[i].y)<3.5,`${i}: ${JSON.stringify(result[i])}`);
 }
});
test('missing frames never become coordinates, and exact manual corrections and skips stay fixed',async()=>{
 const frames=Array.from({length:6},(_,i)=>image({x:65+i*12,angle:i*.25,missing:i===2,distractor:true}));
 const marks=[{index:0,x:65,y:80,mode:'center',source:'manual'},{index:3,mode:'skip'},{index:4,x:113.125,y:80.25,mode:'center',source:'manual'}];
 const result=await run(frames,marks);
 assert.equal(result[2].mode,'missing');assert.deepEqual(result[3],marks[1]);assert.deepEqual(result[4],marks[2]);assert.equal(result[5].mode,'center');
 assert(!measuredCenters(centersFromMarks([0,1,2,3,4,5],result,width,height)).some(p=>p.index===2||p.index===3));
});

test('an unmarked point inside the handle follows the same material location using the surrounding object',async()=>{
 const positions=Array.from({length:5},(_,i)=>({x:70+i*17,y:80,angle:i*.45,mark:false})),frames=positions.map(image);
 const result=await run(frames,[{index:0,x:70,y:100,mode:'center',source:'manual'}]);
 for(let i=1;i<result.length;i++){const p=positions[i];assert.equal(result[i].mode,'center');assert(Math.hypot(result[i].x-(p.x-20*Math.sin(p.angle)),result[i].y-(p.y+20*Math.cos(p.angle)))<3.5,JSON.stringify(result[i]));}
});
test('cancellation releases processing between frames and invalid seeds give actionable errors',async()=>{
 let stop=false,progress=0;
 const frames=Array.from({length:6},(_,i)=>image({x:65+i*12}));
 const result=await run(frames,[{index:0,x:65,y:80,mode:'center'}],0,{cancelled:()=>stop,yieldTurn:async()=>{stop=true;},onProgress:()=>progress++});
 assert.equal(result,null);assert.equal(progress,1);
 await assert.rejects(run(frames,[]),/手動/);
 await assert.rejects(run(frames,[{index:0,x:5,y:5,mode:'center'}]),/指定し直して/);
});

test('real hammer sample follows the painted marker through rotation, flagging overlap and exiting frames',async t=>{
 let raw;try{raw=execFileSync('ffmpeg',['-v','error','-i','dist/sample-hammer.mp4','-vf',"select='eq(n,50)+between(n,174,282)*not(mod(n-174,6))',scale=960:540",'-fps_mode','passthrough','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:64*1024*1024});}catch(e){if(e.code==='ENOENT'){t.skip('FFmpeg unavailable');return;}throw e;}
 const w=960,h=540,bytes=w*h*4,bg=raw.subarray(0,bytes),frames=Array.from({length:19},(_,i)=>raw.subarray((i+1)*bytes,(i+2)*bytes)),indices=frames.map((_,i)=>174+i*6);
 const references=frames.map(frame=>{
  let x=0,y=0,n=0;for(let yy=35;yy<430;yy++)for(let xx=100;xx<850;xx++){const p=(yy*w+xx)*4,r=frame[p],g=frame[p+1],b=frame[p+2];if(r>100&&r-g>55&&r-b>55&&g<r*.62){x+=xx;y+=yy;n++;}}
  return n?{x:x/n,y:y/n}:null;
 });
 const seed=5,start=performance.now(),marks=await trackSelectedPoint({indices,getFrame:index=>frames[(index-174)/6],background:bg,width:w,height:h,marks:[{index:indices[seed],...references[seed],mode:'center',source:'manual'}],seedIndex:indices[seed]});
 for(let i=1;i<12;i++){assert.equal(marks[i].mode,'center');assert(!marks[i].uncertain);assert(Math.hypot(marks[i].x-references[i].x,marks[i].y-references[i].y)<2.5,`${i}: ${JSON.stringify(marks[i])}`);}
 assert(marks[0].uncertain);assert(marks[13].uncertain);assert.equal(marks[18].mode,'missing');
 t.diagnostic(`19 cached 960×540 frames: ${Math.round(performance.now()-start)} ms; independent red-marker comparison <2.5 px on unobstructed frames.`);
});

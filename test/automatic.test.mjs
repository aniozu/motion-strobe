import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {trackCandidates,findCandidates,pickObjectCenter,centersFromMarks} from '../src/tracking.js';import {foregroundMask,measuredCenters} from '../src/annotations.js';
function candidate(x,y,patch={}){return {x,y,area:100,r:30,g:60,b:90,quality:2,bounds:{x:x-5,y:y-5,w:11,h:11},...patch};}
test('automatic tracking follows a seeded object both ways, retaining manual and skipped frames',()=>{
 const frames=Array.from({length:7},(_,i)=>({index:i*3,candidates:[candidate(20+i*12,30+(i-3)**2),candidate(160,70,{area:400,r:220,g:40,b:20,quality:3})]}));
 const anchors=[{index:9,mode:'center',x:56.125,y:30.5,source:'manual'},{index:3,mode:'skip'},{index:15,mode:'center',x:81.875,y:34.125,source:'manual'}],original=structuredClone(anchors);
 const marks=trackCandidates(frames,240,160,anchors,9);assert.deepEqual(anchors,original);assert.equal(marks.length,7);
 for(const mark of original)assert.deepEqual(marks.find(m=>m.index===mark.index),mark);
 for(const i of [0,2,4,6]){assert.equal(marks[i].source,'auto');assert.equal(marks[i].x,20+i*12);assert.equal(marks[i].uncertain,false);}
 const all=centersFromMarks(frames.map(f=>f.index),marks,240,160),coarse=centersFromMarks([3,9,15],marks,240,160);assert.deepEqual(coarse,[all[1],all[3],all[5]]);
});
test('missing object and far identical distractor do not acquire invented coordinates',()=>{
 const frames=[{index:0,candidates:[candidate(20,30)]},{index:3,candidates:[candidate(32,35)]},{index:6,candidates:[candidate(220,150)]},{index:9,candidates:[]}];
 const marks=trackCandidates(frames,240,160,[{index:0,x:20,y:30,mode:'center'}],0);
 assert.equal(marks[1].x,32);assert.equal(marks[2].mode,'missing');assert.equal(marks[3].mode,'missing');assert.equal(measuredCenters(centersFromMarks([0,3,6,9],marks,240,160)).length,2);
 assert.throws(()=>trackCandidates(frames,240,160,[],0),/手動/);assert.throws(()=>trackCandidates(frames,240,160,[{index:0,x:100,y:100,mode:'center'}],0),/検出できません/);
});
test('similar competing paths need confirmation, and manually corrected coordinates stay exact',()=>{
 const frames=[{index:0,candidates:[candidate(20,30)]},{index:3,candidates:[candidate(40,20),candidate(40,40)]},{index:6,candidates:[candidate(60,20),candidate(60,40)]}];
 const anchors=[{index:0,x:20,y:30,mode:'center'}],marks=trackCandidates(frames,240,160,anchors,0);
 assert(marks.slice(1).some(m=>m.uncertain));assert.equal(measuredCenters(centersFromMarks([0,3,6],marks,240,160)).length,1);
 const corrected=trackCandidates(frames,240,160,[...anchors,{index:6,x:60,y:20,mode:'center'}],0);assert.equal(corrected[1].y,20);assert.deepEqual(corrected[2],{index:6,x:60,y:20,mode:'center'});
 const fixed=trackCandidates(frames,240,160,[...anchors,{index:3,x:40.125,y:20.875,mode:'center'},{index:6,x:60,y:20,mode:'center'}],0);assert.equal(fixed[1].x,40.125);assert.equal(fixed[1].y,20.875);assert.equal(measuredCenters(centersFromMarks([0,3,6],fixed,240,160)).length,3);
});
test('real spring sample tracks all twelve frames from a single selected middle-frame object',t=>{
 let data;try{data=execFileSync('ffmpeg',['-v','error','-i','dist/sample-motion.mp4','-vf',"select='eq(n,15)+between(n,90,123)*not(mod(n-90,3))',scale=960:540",'-fps_mode','passthrough','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:40*1024*1024});}catch(e){if(e.code==='ENOENT'){t.skip('FFmpeg unavailable');return;}throw e;}
 const width=960,height=540,bytes=width*height*4,bg=data.subarray(0,bytes),expected=[[414,110],[442,130],[466,131],[486,108],[506,81],[528,72],[552,87],[578,113],[604,131],[628,125],[648,99],[666,78]],frames=expected.map((_,i)=>{const frame=data.subarray((i+1)*bytes,(i+2)*bytes);return {index:90+i*3,candidates:findCandidates(foregroundMask(bg,frame,30,width).pixels,frame,width,height,bg)};});
 const seed=pickObjectCenter(bg,data.subarray(6*bytes,7*bytes),width,height,...expected[5],30),anchors=[{index:105,...seed,mode:'center'}],marks=trackCandidates(frames,width,height,anchors,105);
 for(let i=0;i<expected.length;i++){assert.equal(marks[i].mode,'center');assert(!marks[i].uncertain);assert(Math.hypot(marks[i].x-expected[i][0],marks[i].y-expected[i][1])<8);}
 const rerun=trackCandidates(frames,width,height,[...marks,{index:123,mode:'skip'}],105);assert.equal(rerun.at(-1).mode,'skip');assert.deepEqual(rerun[5],anchors[0]);
});

test('nearby seeded object wins over a clearer similar object and distant clutter',()=>{
 const frames=Array.from({length:6},(_,i)=>({index:i*3,candidates:[candidate(25+i*8,45,{quality:.2}),candidate(60+i*8,45,{quality:3.8}),...Array.from({length:20},(_,j)=>candidate(170+j,100,{quality:4}))]}));
 const marks=trackCandidates(frames,240,160,[{index:0,x:25,y:45,mode:'center'}],0);
 for(let i=1;i<marks.length;i++){assert.equal(marks[i].x,25+i*8);assert.equal(marks[i].mode,'center');assert(!marks[i].uncertain);}
});
test('a manually corrected location anchors the next frame even without a foreground region',()=>{
 const frames=[{index:0,candidates:[candidate(25,45)]},{index:3,candidates:[candidate(33,45)]},{index:6,candidates:[]},{index:9,candidates:[candidate(111,45),candidate(49,45,{quality:3})]}];
 const anchors=[{index:0,x:25,y:45,mode:'center'},{index:6,x:103,y:45,mode:'center',source:'manual'}];
 const marks=trackCandidates(frames,240,160,anchors,0);
 assert.deepEqual(marks[2],anchors[1]);assert.equal(marks[3].x,111);
});
test('tracking candidate extraction retains small local objects beyond the top sixteen',()=>{
 const width=240,height=160,bg=new Uint8ClampedArray(width*height*4),frame=new Uint8ClampedArray(bg);
 for(let p=0;p<width*height;p++)bg.set([190,190,190,255],p*4);frame.set(bg);
 function square(x,y,s,color){for(let yy=y;yy<y+s;yy++)for(let xx=x;xx<x+s;xx++)frame.set([...color,255],(yy*width+xx)*4);}
 square(12,12,3,[120,120,120]);
 for(let i=0;i<20;i++)square(60+(i%5)*32,12+Math.floor(i/5)*32,10,[20,20,20]);
 const pixels=foregroundMask(bg,frame,30,width).pixels;
 const ranked=findCandidates(pixels,frame,width,height,bg),all=findCandidates(pixels,frame,width,height,bg,{all:true});
 assert.equal(ranked.length,16);assert(!ranked.some(c=>c.x===13));assert(all.some(c=>c.x===13&&c.y===13));
 const marks=trackCandidates([{index:0,candidates:all},{index:3,candidates:all}],width,height,[{index:0,x:13,y:13,mode:'center'}],0);
 assert.equal(marks[1].x,13);assert(!marks[1].uncertain);
});

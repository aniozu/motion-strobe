import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundIndices,estimateBackground} from '../src/background.js';
import {Timeline} from '../src/timeline.js';
const options={yieldTurn:async()=>{}};
const pixel=rgb=>new Uint8ClampedArray([...rgb,255]);

test('a moving object is removed, while similar background colors are averaged',async()=>{
 const frames=[[98,102,99],[100,100,100],[102,98,101],[230,10,10],[10,10,230]].map(pixel);
 assert.deepEqual([...await estimateBackground(frames,options)],[100,100,100,255]);
});
test('temporal median avoids the intermediate color selected by an ordinary mean',async()=>{
 const frames=[pixel([200,200,200]),pixel([201,199,200]),pixel([199,201,200]),pixel([20,20,20]),pixel([80,80,80])];
 assert.deepEqual([...await estimateBackground(frames,options)],[200,200,200,255]);
});
test('an unsupported RGB median falls back to an observed color rather than black',async()=>{
 const frames=[[0,0,255],[0,255,0],[255,0,0]].map(pixel),result=await estimateBackground(frames,options);
 assert(frames.some(frame=>frame.every((value,i)=>value===result[i])));
});
test('a single frame and constant scenes retain exact colors',async()=>{
 const frame=new Uint8ClampedArray([12,75,130,255,255,255,255,255]);
 assert.deepEqual(await estimateBackground([frame],options),frame);
 assert.deepEqual(await estimateBackground(Array(32).fill(frame),options),frame);
});
test('sampling covers the selected time range, is capped, and handles irregular timestamps',()=>{
 const clock={count:201,period:.01,times:Array.from({length:201},(_,i)=>i*.01)};
 const plan=backgroundIndices(10,190,clock);assert.equal(plan.length,8);assert.equal(plan[0],10);assert.equal(plan.at(-1),190);assert.equal(new Set(plan).size,8);
 assert.deepEqual(backgroundIndices(10,12,clock),[10,11,12]);
 const irregular={count:5,period:.25,times:[0,.01,.02,.5,1]};assert.deepEqual(backgroundIndices(0,4,irregular,3),[0,3,4]);
});
test('estimation yields, reports progress and supports cancellation during processing',async()=>{
 let cancelled=false,yields=0;
 await assert.rejects(estimateBackground([new Uint8ClampedArray(50000)],{cancelled:()=>cancelled,yieldTurn:async()=>{yields++;cancelled=true;}}),/キャンセル/);
 assert.equal(yields,1);
 const progress=[];await estimateBackground([pixel([1,2,3])],{...options,onProgress:value=>progress.push(value)});assert.equal(progress.at(-1),1);
 await assert.rejects(estimateBackground([],options),/背景用/);
});
test('automatic background removes the editable background marker while manual retains it',()=>{
 const timeline=Object.create(Timeline.prototype),state={stage:'range',backgroundMode:'auto'};timeline.getState=()=>state;
 assert.deepEqual(timeline.pointKeys(),['start','end']);state.stage='sampling';assert.deepEqual(timeline.pointKeys(),['start','end','reference']);
 state.backgroundMode='manual';assert.deepEqual(timeline.pointKeys(),['start','end','background','reference']);
});

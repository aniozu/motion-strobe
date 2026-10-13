import test from 'node:test';import assert from 'node:assert/strict';import {estimateBackground} from '../src/background.js';import {foregroundMask,mergeLayer} from '../src/annotations.js';
test('missing transformed borders never affect background colors or illumination drift',async()=>{
 const frames=[new Uint8ClampedArray([0,0,0,0,100,110,120,255]),new Uint8ClampedArray([40,50,60,255,0,0,0,0]),new Uint8ClampedArray([45,55,65,252,100,110,120,255])];
 const bg=await estimateBackground(frames,{yieldTurn:async()=>{}});assert.deepEqual([...bg],[40,50,60,255,100,110,120,255]);
 const mask=foregroundMask(bg,frames[0],30,2);assert.deepEqual([...mask.pixels],Array(8).fill(0));
 const result=new Uint8ClampedArray(bg);mergeLayer(result,mask.pixels);assert.deepEqual(result,bg);
});
test('a wholly missing background pixel stays transparent until the reference fallback is applied',async()=>{
 const bg=await estimateBackground([new Uint8ClampedArray([0,0,0,0]),new Uint8ClampedArray([40,50,60,252])],{yieldTurn:async()=>{}});assert.deepEqual([...bg],[0,0,0,0]);
});

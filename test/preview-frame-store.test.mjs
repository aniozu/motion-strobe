import test from 'node:test';import assert from 'node:assert/strict';
import {PreviewFrameStore} from '../src/preview-frame-store.js';
test('preview cache retains source-frame identity within a fixed memory budget',()=>{
 const store=new PreviewFrameStore(12),one=new Uint8ClampedArray([1,2,3,4]),two=new Uint8ClampedArray([5,6,7,8]);store.configure('320x180');store.set(13,one);store.set(14,two);assert.equal(store.get(13),one);store.set(15,new Uint8ClampedArray(4));store.set(16,new Uint8ClampedArray(4));assert.equal(store.get(14),undefined);assert.equal(store.get(13),one);assert.equal(store.bytes,12);store.set(13,new Uint8ClampedArray([9,8,7,6]));assert.equal(store.bytes,12);assert.deepEqual([...store.get(13)],[9,8,7,6]);
});
test('a new resolution or source discards incompatible preview pixels',()=>{
 const store=new PreviewFrameStore();store.configure('320x180');store.set(1,new Uint8ClampedArray(16));store.configure('180x320');assert.equal(store.get(1),undefined);assert.equal(store.bytes,0);store.set(1,new Uint8ClampedArray(16));store.clear();assert.equal(store.get(1),undefined);
});

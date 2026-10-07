import test from 'node:test';import assert from 'node:assert/strict';
import {downloadSample} from '../src/sample-download.js';
const chunks=[new Uint8Array([1,2]),new Uint8Array([3,4]),new Uint8Array([5,6])];
const response=length=>new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(chunk);c.close();}}),{headers:length?{'Content-Length':String(length)}:{}});
test('sample bytes report increasing progress across chunks and yield before completion',async()=>{
 const progress=[],turns=[];const blob=await downloadSample('sample',{fetcher:async()=>response(6),onProgress:p=>progress.push(p.value),yieldTurn:async()=>turns.push(progress.at(-1))});
 assert.deepEqual(progress,[0,1/3,2/3,.99,1]);assert.equal(turns.length,3);assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[1,2,3,4,5,6]);
});
test('known sample length supplies progress when the server omits Content-Length',async()=>{
 const progress=[];await downloadSample('sample',{expectedSize:6,fetcher:async()=>response(),onProgress:p=>progress.push(p.value),yieldTurn:async()=>{}});assert.deepEqual(progress,[0,1/3,2/3,.99,1]);
});
test('unknown length remains indeterminate until completion rather than displaying false percentages',async()=>{
 const progress=[];await downloadSample('sample',{fetcher:async()=>response(),onProgress:p=>progress.push(p.value),yieldTurn:async()=>{}});assert.deepEqual(progress,[null,null,null,null,1]);
});
test('cancelled download stops reading and never reports completion',async()=>{
 const control=new AbortController(),progress=[];
 await assert.rejects(downloadSample('sample',{signal:control.signal,fetcher:async()=>response(6),onProgress:p=>progress.push(p.value),yieldTurn:async()=>control.abort()}),{name:'AbortError'});
 assert.deepEqual(progress,[0,1/3]);
});

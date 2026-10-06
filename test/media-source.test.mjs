import test from 'node:test';
import assert from 'node:assert/strict';
import {safeVideoBlob,probeVideoBlob} from '../src/media-source.js';

test('picked MOV File is converted to a Blob view with an inferred media type',async()=>{
 const file=new File([new Uint8Array([1,2,3,4])],'clip.MOV');
 const blob=safeVideoBlob(file);
 assert.equal(blob instanceof Blob,true);
 assert.equal(blob instanceof File,false);
 assert.equal(blob.type,'video/quicktime');
 assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[1,2,3,4]);
});

test('probe reads only a small prefix and returns the same Blob',async()=>{
 const blob=new Blob([new Uint8Array(100_000).fill(7)],{type:'video/mp4'});
 assert.equal(await probeVideoBlob(blob),blob);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DataStream} from 'mp4box';
import {parseVideo} from '../src/media.js';
import {avcReorderDepth,declareAvcReordering,normalizeAvcReordering} from '../src/avc-reordering.js';

test('AVC reorder depth follows compressed versus presentation order without changing either',()=>{
 const samples=[0,4,2,1,3].map(cts=>({cts})),before=structuredClone(samples);
 assert.equal(avcReorderDepth(samples),3);assert.deepEqual(samples,before);
 assert.equal(avcReorderDepth([0,1,2,3].map(cts=>({cts}))),0);assert.equal(avcReorderDepth([]),0);
});

test('the real pendulum AVC metadata gains its missing reorder declaration, retaining compressed pictures and timestamps',async()=>{
 const media=await parseVideo(new Blob([await readFile(new URL('../dist/sample-pendulum.mp4',import.meta.url))]));
 const avc=media.trak.mdia.minf.stbl.stsd.entries[0].avcC,stream=new DataStream(undefined,0,DataStream.BIG_ENDIAN);avc.write(stream);
 const description=new Uint8Array(stream.buffer,8),original=new Uint8Array(description),sps=avc.SPS[0].data,spsBefore=new Uint8Array(sps);
 assert.equal(avcReorderDepth(media.samples),3);
 const fixed=declareAvcReordering(sps,3);assert.notDeepEqual(fixed,sps);assert.deepEqual(sps,spsBefore);
 assert.strictEqual(declareAvcReordering(fixed,3),fixed); // Explicit declarations are left alone.
 const config={codec:media.config.codec,description},normalized=normalizeAvcReordering(config,media.samples);
 assert.deepEqual(description,original);assert.notStrictEqual(normalized,config);assert.deepEqual(normalized.description,media.config.description);
 const oldSize=description[6]*256+description[7],newSize=normalized.description[6]*256+normalized.description[7];
 assert.deepEqual(normalized.description.slice(8,8+newSize),fixed);
 assert.deepEqual(normalized.description.slice(8+newSize),description.slice(8+oldSize)); // PPS and AVC extensions are identical.
 assert.equal(media.clock.ordered.length,674);assert.deepEqual(media.clock.times.slice(0,4),[0,1/30,2/30,.1]);
 assert.equal(media.ptsToIndex.get(133333),1);assert.equal(media.samples[3].cts,2048);assert.equal(media.samples[3].dts,1536);
});

test('baseline AVC, other codecs, malformed metadata and existing restrictions remain untouched',async()=>{
 const media=await parseVideo(new Blob([await readFile(new URL('./fixtures/baseline.mp4',import.meta.url))]));
 assert.strictEqual(normalizeAvcReordering(media.config,media.samples),media.config);
 const reordered=[0,4,2,1,3].map(cts=>({cts}));
 for(const config of [{codec:'hvc1.1.6.L93.B0',description:new Uint8Array([1,2])},{codec:'avc1.640029'},{codec:'avc1.640029',description:new Uint8Array([1,2,3,4,5,255,255])}])assert.strictEqual(normalizeAvcReordering(config,reordered),config);
 for(const nal of [new Uint8Array([]),new Uint8Array([0x67]),new Uint8Array([0x68,0xff])])assert.strictEqual(declareAvcReordering(nal,3),nal);
});

test('the corrected SPS decodes every picture of the real pendulum first GOP with identical YUV pixels',async()=>{
 const media=await parseVideo(new Blob([await readFile(new URL('../dist/sample-pendulum.mp4',import.meta.url))]));
 const avc=media.trak.mdia.minf.stbl.stsd.entries[0].avcC,original=avc.SPS[0].data,fixed=declareAvcReordering(original,avcReorderDepth(media.samples)),prefix=new Uint8Array([0,0,0,1]);
 const pictures=[];for(let n=0;n<169;n++){
  const sample=media.mp4.getSample(media.trak,n);let offset=0;
  while(offset<sample.data.length){let size=0;for(let i=0;i<avc.lengthSizeMinusOne+1;i++)size=size*256+sample.data[offset++];pictures.push(prefix,sample.data.slice(offset,offset+size));offset+=size;}
  media.mp4.releaseSample(media.trak,n);
 }
 const stream=sps=>Buffer.concat([prefix,sps,...avc.PPS.flatMap(p=>[prefix,p.data]),...pictures]);
 const folder=await mkdtemp(join(tmpdir(),'strobe-avc-sps-'));
 try{
  const before=join(folder,'original.h264'),after=join(folder,'fixed.h264');await writeFile(before,stream(original));await writeFile(after,stream(fixed));
  const hashes=path=>execFileSync('ffmpeg',['-v','error','-i',path,'-fps_mode','passthrough','-f','framehash','-hash','sha256','-'],{encoding:'utf8'}).split('\n').filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1).trim());
  const originalPixels=hashes(before),fixedPixels=hashes(after);assert.equal(originalPixels.length,169);assert.deepEqual(fixedPixels,originalPixels);
 }finally{await rm(folder,{recursive:true,force:true});}
});

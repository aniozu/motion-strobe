import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBounds,decodeRange,runDecodeRecovery,decodeStrategies} from '../src/decode-recovery.js';
const samples=Array.from({length:12},(_,n)=>({cts:n*1000,dts:n*1000,timescale:1000,is_sync:n%4===0,data:new Uint8Array([n])}));
const makeMedia=()=>({config:{codec:'avc1.42001f',codedWidth:32,codedHeight:32},clock:{ordered:samples},samples,ptsToIndex:new Map(samples.map((s,n)=>[s.cts*1000,n])),trak:{},mp4:{getSample:(_,n)=>samples[n],releaseSample(){}}});
globalThis.EncodedVideoChunk=class{constructor(data){Object.assign(this,data);}};
function adapter({failRange=false,failAll=false,failFlush=false,softwareSupported=true,neverFlush=false,onDecode=()=>{}}={}){
 const instances=[];
 globalThis.VideoDecoder=class{
  static async isConfigSupported(config){return {supported:softwareSupported||config.hardwareAcceleration!=='prefer-software',config};}
  constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.decodeQueueSize=0;this.chunks=[];this.closedFrames=0;instances.push(this);}
  configure(config){this.state='configured';this.config=config;}
  decode(chunk){this.chunks.push(chunk);onDecode(this,chunk);if(failAll||(failRange&&this.chunks.length===1&&chunk.timestamp>0)){this.state='closed';this.callbacks.error(new DOMException('Decoder failure','EncodingError'));return;}if(!failFlush)this.output(chunk);}
  output(chunk){this.callbacks.output({timestamp:chunk.timestamp,close:()=>this.closedFrames++});}
  async flush(){if(neverFlush)return new Promise(()=>{});if(failFlush){this.state='closed';throw new DOMException('Decoder failure at flush','EncodingError');}}
  close(){this.state='closed';}
 };
 return instances;
}
const recover=(media,options={})=>runDecodeRecovery({media,operation:'コマ抽出',requested:{first:6,last:7},...options,run:options.run||((strategy,diagnostic)=>decodeRange({media,first:5,last:6,strategy,diagnostic,onFrame(){},cancelled:options.cancelled}))});
test('a failed midstream decode retries from zero through the complete group with exact PTS and fresh results',async()=>{
 const media=makeMedia(),instances=adapter({failRange:true}),reports=[],outputs=[];
 const result=await recover(media,{onDiagnostic:d=>reports.push(d),run:async(strategy,diagnostic)=>{
  outputs.length=0;
  await decodeRange({media,first:5,last:6,strategy,diagnostic,onFrame:(frame,index)=>{if([5,6].includes(index))outputs.push(frame.timestamp);}});
  return [...outputs];
 }});
 assert.deepEqual(result,[5_000_000,6_000_000]);assert.equal(instances.length,2);
 assert.equal(instances[0].chunks[0].timestamp,4_000_000);assert.equal(instances[1].chunks[0].timestamp,0);
 assert.equal(instances[1].chunks.at(-1).timestamp,7_000_000);assert.equal(media.decodeStrategy,'safe');
 assert.equal(reports.at(-1).recovered,true);assert.equal(reports.at(-1).attempts[0].lastSubmitted.packet,5);
 assert.equal(reports.at(-1).attempts[0].phase,'コマのデコード');assert(instances.every(d=>d.state==='closed'));
 assert.equal(instances[1].closedFrames,8);
});
test('the safe end includes decoder dependencies but no packets from the next GOP',()=>{
 assert.deepEqual(decodeBounds(makeMedia(),5,6,decodeStrategies[0]),{start:4,end:6});
 assert.deepEqual(decodeBounds(makeMedia(),5,6,decodeStrategies[1]),{start:0,end:7});
});
test('permanent errors stop after three fresh attempts and retain phase and last output without claiming a culprit',async()=>{
 const media=makeMedia(),instances=adapter({failAll:true});
 await assert.rejects(recover(media),error=>{
  assert.equal(error.diagnostics.attempts.length,3);assert.equal(error.diagnostics.attempts[0].errorName,'EncodingError');
  assert.equal(error.diagnostics.attempts[0].lastOutput,null);assert.equal(error.diagnostics.attempts[0].lastSubmitted.mediaTime,4);
  return true;
 });assert.equal(instances.length,3);assert(instances.every(d=>d.state==='closed'));
});
test('unsupported alternate settings are recorded, while the last actual decoder failure stays the main error',async()=>{
 const instances=adapter({failAll:true,softwareSupported:false});
 await assert.rejects(recover(makeMedia()),error=>{assert.match(error.message,/Decoder failure/);assert.equal(error.diagnostics.attempts.at(-1).unsupported,true);return true;});
 assert.equal(instances.length,2);
});
test('cancel during the first attempt closes the decoder and never starts a retry',async()=>{
 let cancelled=false;const instances=adapter({onDecode:()=>{cancelled=true;}});
 assert.equal(await recover(makeMedia(),{cancelled:()=>cancelled}),undefined);assert.equal(instances.length,1);assert.equal(instances[0].state,'closed');
});
test('flush failure diagnostics identify draining rather than blaming the last submitted frame',async()=>{
 const instances=adapter({failFlush:true});
 await assert.rejects(recover(makeMedia()),error=>{assert(error.diagnostics.attempts.every(d=>d.phase==='残りのコマを取り出す'));return true;});
 assert.equal(instances.length,3);
});
test('a stalled flush is bounded and closed, including when no error callback is delivered',async()=>{
 const instances=adapter({neverFlush:true});
 const media=makeMedia();
 await assert.rejects(decodeRange({media,first:5,last:6,strategy:decodeStrategies[0],diagnostic:{},onFrame(){},flushMs:15}),/停止/);assert.equal(instances[0].state,'closed');
});

test('a successful recovery mode is reused without another failed range attempt',async()=>{
 const media=makeMedia();media.decodeStrategy='safe';const instances=adapter({failRange:true});
 await recover(media);assert.equal(instances.length,1);assert.equal(instances[0].chunks[0].timestamp,0);
});

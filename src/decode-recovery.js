// Keep source timestamps and requested frames exact across bounded retries.
export const decodeStrategies=[
 {id:'range',label:'指定範囲から復元',queue:8},
 {id:'safe',label:'先頭から慎重に復元',queue:4,fromStart:true,completeGroup:true},
 {id:'software',label:'別のデコード設定で復元',queue:4,fromStart:true,completeGroup:true,hardwareAcceleration:'prefer-software'}
];
const yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0));
export class DecodeFailure extends Error{
 constructor(error,diagnostic){super(error?.message||String(error));this.name='DecodeFailure';this.originalName=error?.name||'Error';this.diagnostic={...diagnostic};}
}
export function decodeBounds(media,first,last,strategy){
 const min=media.clock.ordered[first].cts,max=media.clock.ordered[last].cts;
 let start=0,end=0;
 for(let n=0;n<media.samples.length;n++){
  const s=media.samples[n];if(s.is_sync&&s.cts<=min)start=n;if(s.cts<=max)end=n;
 }
 if(strategy.fromStart)start=0;
 if(strategy.completeGroup){
  let next=end+1;while(next<media.samples.length&&!media.samples[next].is_sync)next++;
  end=next-1;
 }
 return {start,end:Math.max(start,end)};
}
const point=(media,s,index)=>({packet:index+1,frame:(media.ptsToIndex.get(Math.round(s.cts*1e6/s.timescale))??-1)+1,mediaTime:s.cts/s.timescale,decodeTime:s.dts/s.timescale});
export async function decodeRange({media,first,last,strategy,diagnostic,onFrame,cancelled=()=>false,onProgress=()=>{},setActive=()=>{},beforeDecode=async()=>{},stallMs=20000,flushMs=45000}){
 const {start,end}=decodeBounds(media,first,last,strategy);
 Object.assign(diagnostic,{phase:'設定確認',packetStart:start+1,packetEnd:end+1,lastSubmitted:null,lastOutput:null,outputCount:0});
 let decoder,failure,alive=true,lastActivity=Date.now(),timeout;
 try{
  const config={...media.config,...(strategy.hardwareAcceleration?{hardwareAcceleration:strategy.hardwareAcceleration}:{})};
  const support=await Promise.race([VideoDecoder.isConfigSupported(config),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('デコード設定の確認が停止しました。')),15000);})]);
  clearTimeout(timeout);
  if(cancelled())return;
  if(!support.supported){diagnostic.unsupported=true;throw Error('このデコード設定は端末で利用できません。');}
  diagnostic.phase='デコーダー初期化';
  decoder=new VideoDecoder({error:error=>{if(alive)failure=new DecodeFailure(error,{...diagnostic,phase:'コマのデコード'});},output:frame=>{
   try{
    if(!alive||cancelled()||failure)return;
    lastActivity=Date.now();diagnostic.outputCount++;
    const index=media.ptsToIndex.get(frame.timestamp);
    diagnostic.lastOutput={frame:index===undefined?null:index+1,mediaTime:frame.timestamp/1e6};
    onFrame(frame,index);
   }catch(error){failure=new DecodeFailure(error,{...diagnostic,phase:'コマの描画'});}finally{frame.close();}
  }});
  setActive(decoder);decoder.configure(support.config||config);
  for(let n=start;n<=end;n++){
   if(cancelled())return;if(failure)throw failure;
   diagnostic.phase='デコード待機';
   while(decoder.decodeQueueSize>=strategy.queue){
    if(cancelled())return;if(failure)throw failure;
    if(Date.now()-lastActivity>stallMs)throw Error('デコードの進行が停止しました。');
    await yieldTurn();
   }
   await beforeDecode();if(cancelled())return;if(failure)throw failure;
   diagnostic.phase='圧縮コマの読み出し';
   const sample=media.mp4.getSample(media.trak,n);
   if(!sample?.data?.byteLength)throw Error('元動画の圧縮コマを読み出せませんでした。');
   diagnostic.lastSubmitted=point(media,sample,n);diagnostic.phase='コマをデコーダーへ投入';
   decoder.decode(new EncodedVideoChunk({type:sample.is_sync?'key':'delta',timestamp:Math.round(sample.cts*1e6/sample.timescale),duration:Math.round(sample.duration*1e6/sample.timescale),data:sample.data}));
   // MP4Box retains the compressed input buffers, so a new attempt can reread.
   media.mp4.releaseSample(media.trak,n);
   if((n-start)%strategy.queue===0){onProgress((n-start+1)/(end-start+1),diagnostic);await yieldTurn();}
  }
  if(failure)throw failure;diagnostic.phase='残りのコマを取り出す';
  await Promise.race([decoder.flush(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('残りのコマのデコードが停止しました。')),flushMs);})]);
  if(failure)throw failure;
 }catch(error){if(!cancelled())throw failure|| (error instanceof DecodeFailure?error:new DecodeFailure(error,diagnostic));}
 finally{alive=false;clearTimeout(timeout);if(decoder&&decoder.state!=='closed')decoder.close();setActive(null);}
}
export async function runDecodeRecovery({media,operation,requested,onDiagnostic=()=>{},onRetry=()=>{},cancelled=()=>false,run}){
 const history=[];
 const strategies=[...decodeStrategies];
 const preferred=strategies.findIndex(s=>s.id===media.decodeStrategy);
 if(preferred>0)strategies.unshift(...strategies.splice(preferred,1));
 for(let n=0;n<strategies.length;n++){
  if(cancelled())return;
  const strategy=strategies[n],diagnostic={operation,attempt:n+1,strategy:strategy.label,mode:strategy.id,codec:media.config.codec,width:media.config.codedWidth,height:media.config.codedHeight,requested};
  try{
   if(n){onRetry(n+1,strategy.label);await new Promise(resolve=>setTimeout(resolve,100));if(cancelled())return;}
   const value=await run(strategy,diagnostic);
   if(cancelled())return;
   diagnostic.status='成功';history.push(diagnostic);media.decodeStrategy=strategy.id;
   onDiagnostic({operation,attempts:history,recovered:n>0});return value;
  }catch(error){
   if(cancelled())return;
   if(!(error instanceof DecodeFailure)){
    history.push({...diagnostic,status:'失敗',errorName:error.name||'Error',error:error.message||String(error)});
    error.diagnostics={operation,attempts:history,recovered:false};onDiagnostic(error.diagnostics);throw error;
   }
   history.push({...error.diagnostic,status:'失敗',errorName:error.originalName,error:error.message});
   onDiagnostic({operation,attempts:[...history],recovered:false});
   // Drawing/security errors are not repaired by a different video decoder.
   if(error.diagnostic.phase==='コマの描画'&&['SecurityError','TypeError'].includes(error.originalName))break;
  }
 }
 const meaningful=[...history].reverse().find(d=>!d.unsupported)||history.at(-1);
 const error=new Error(`${operation}に失敗しました。自動再試行でも復元できませんでした。「処理の詳細」で失敗した段階と位置を確認できます。\n${meaningful?.error||''}`);
 error.diagnostics={operation,attempts:history,recovered:false};throw error;
}

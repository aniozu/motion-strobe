import {indexAtTime} from './frame-clock.js';
export function framePlan(first,last,reference,step,factor=1,clock=null){
  step=Math.max(1,Math.round(step))*factor; reference=Math.max(first,Math.min(last,Math.round(reference)));
  if(clock?.times?.length&&clock.variable){
   const times=clock.times,interval=step*clock.period,anchor=times[reference],result=[];
   const low=Math.ceil((times[first]-anchor)/interval-1e-8),high=Math.floor((times[last]-anchor)/interval+1e-8);
   if(high-low>1e6)throw Error('抽出間隔が小さすぎます。');
   for(let n=low;n<=high;n++){const index=Math.max(first,Math.min(last,indexAtTime(clock,anchor+n*interval)));if(result.at(-1)!==index)result.push(index);}
   return result;
  }
  const result=[]; for(let n=reference+Math.ceil((first-reference)/step)*step;n<=last;n+=step)result.push(n);
  return result;
}
export function timing(samples,timescale){
  const ordered=[...samples].sort((a,b)=>a.cts-b.cts); if(ordered.length<2)throw Error('2コマ以上の動画を選んでください。');
  if(!Number.isFinite(timescale)||timescale<=0||ordered.some(s=>!Number.isFinite(s.cts)))throw Error('動画のコマ時刻を読み取れませんでした。');
  const intervals=ordered.slice(1).map((s,i)=>s.cts-ordered[i].cts);
  if(intervals.some(d=>d<=0))throw Error('動画のコマ時刻が重複しています。別の動画でお試しください。');
  const ticks=(ordered.at(-1).cts-ordered[0].cts)/(ordered.length-1);
  const variable=intervals.some(d=>Math.abs(d-ticks)>Math.max(1.1,ticks*.002));
  const origin=ordered[0].cts/timescale,times=ordered.map(s=>(s.cts-ordered[0].cts)/timescale);
  return {ordered,times,fps:timescale/ticks,period:ticks/timescale,origin,variable,approximate:false};
}
export function outputSize(width,height,count,max=960){const scale=Math.min(1,max/Math.max(width,height),Math.sqrt(80*1024*1024/(Math.max(1,count)*width*height*4)));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
export function mergePixels(background,frames,sensitivity){
  const out=new Uint8ClampedArray(background); const centers=[];
  for(const frame of frames){
    let drift=0,count=0; for(let i=0;i<frame.length;i+=64){drift+=(frame[i]-background[i]+frame[i+1]-background[i+1]+frame[i+2]-background[i+2])/3;count++;}drift/=Math.max(1,count);
    let sumX=0, hits=0; // indices are returned for optional centroid labels
    for(let i=0;i<frame.length;i+=4){const delta=Math.max(Math.abs(frame[i]-background[i]-drift),Math.abs(frame[i+1]-background[i+1]-drift),Math.abs(frame[i+2]-background[i+2]-drift));if(delta>sensitivity){out[i]=frame[i];out[i+1]=frame[i+1];out[i+2]=frame[i+2];sumX+=i/4;hits++;}}
    centers.push({sumX,hits});
  }return {pixels:out,centers};
}

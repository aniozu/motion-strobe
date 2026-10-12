import {frameTime,indexAtTime} from './frame-clock.js';

// Background sampling is independent of the strobe interval and thinning factor.
export function backgroundIndices(first,last,clock,limit=8){
 const count=Math.min(Math.max(2,Math.round(limit)),last-first+1),indices=new Set();
 const begin=frameTime(clock,first),end=frameTime(clock,last);
 for(let n=0;n<count;n++)indices.add(Math.max(first,Math.min(last,indexAtTime(clock,begin+(end-begin)*n/Math.max(1,count-1)))));
 return [...indices].sort((a,b)=>a-b);
}

// Temporal median seed, followed by averaging only nearby original RGB vectors.
// Scratch space is O(sample count), not another full stack of RGB/float images.
export async function estimateBackground(frames,{cancelled=()=>false,onProgress=()=>{},yieldTurn=()=>new Promise(r=>setTimeout(r,0)),tolerance=18}={}){
 if(!frames.length||frames.some(frame=>frame.length!==frames[0].length)||frames[0].length%4)throw Error('背景用の画像が不足しています。もう一度作成してください。');
 const result=new Uint8ClampedArray(frames[0].length),count=frames.length;
 const red=new Uint8Array(count),green=new Uint8Array(count),blue=new Uint8Array(count),middle=count>>1;
 const median=values=>count%2?values[middle]:(values[middle-1]+values[middle])/2;
 for(let offset=0;offset<result.length;offset+=4){
  if(offset%16384===0){if(cancelled())throw Error('キャンセル');onProgress(offset/result.length);await yieldTurn();if(cancelled())throw Error('キャンセル');}
  for(let n=0;n<count;n++){red[n]=frames[n][offset];green[n]=frames[n][offset+1];blue[n]=frames[n][offset+2];}
  red.sort();green.sort();blue.sort();const r=median(red),g=median(green),b=median(blue);
  let sumR=0,sumG=0,sumB=0,hits=0,nearest=frames[0],distance=Infinity;
  for(const frame of frames){
   const delta=Math.max(Math.abs(frame[offset]-r),Math.abs(frame[offset+1]-g),Math.abs(frame[offset+2]-b));
   if(delta<distance){distance=delta;nearest=frame;}
   if(delta<=tolerance){sumR+=frame[offset];sumG+=frame[offset+1];sumB+=frame[offset+2];hits++;}
  }
  // A channel-wise median may be an unobserved color: use an actual RGB candidate
  // if no sample supports it, rather than emitting black or averaging distant objects.
  result[offset]=hits?sumR/hits:nearest[offset];result[offset+1]=hits?sumG/hits:nearest[offset+1];result[offset+2]=hits?sumB/hits:nearest[offset+2];result[offset+3]=255;
 }
 if(cancelled())throw Error('キャンセル');onProgress(1);return result;
}

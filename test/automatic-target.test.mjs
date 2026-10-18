import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverObject} from '../src/automatic-target.js';
import {findDiscoveryCandidates,trackCandidates,pickObjectCenter} from '../src/tracking.js';
import {foregroundMask} from '../src/annotations.js';

const width=320,height=200;
const candidate=(x,y,patch={})=>({x,y,area:144,r:30,g:180,b:80,quality:2.7,bounds:{x:x-6,y:y-6,w:13,h:13},...patch});
test('no hint selects the coherent moving body over large edge hands, static patches and speckles',async()=>{
 const frames=Array.from({length:10},(_,i)=>({index:i*7,candidates:[
  candidate(45+i*22,90+(i-4)**2),
  candidate(6+i%2,50+i*5,{area:1200,r:200,g:130,b:90,quality:3.4,bounds:{x:0,y:25+i*5,w:30,h:50}}),
  candidate(170,20,{quality:3.7}),candidate(305-i%3,175,{area:9,quality:3.4})
 ]}));
 const before=structuredClone(frames),marks=await discoverObject(frames,width,height);
 assert.deepEqual(frames,before);assert.equal(marks.length,10);
 for(let i=0;i<marks.length;i++){assert.equal(marks[i].source,'auto');assert.equal(marks[i].x,45+i*22);assert.equal(marks[i].y,90+(i-4)**2);assert(!marks[i].uncertain);}
});
test('a stationary scene does not manufacture a moving-object trajectory',async()=>{
 const frames=Array.from({length:9},(_,i)=>({index:i,candidates:[candidate(80+i%2,100),candidate(220,60)]}));
 const marks=await discoverObject(frames,width,height);
 assert(marks.every(m=>m.mode==='missing'));
});
test('no-hint tracking keeps skipped frames and does not replace an absent object with an edge hand',async()=>{
 const frames=Array.from({length:9},(_,i)=>({index:i,candidates:[...(i<7?[candidate(40+i*25,90)]:[]),candidate(310,100+i,{r:210,g:150,b:110,area:1600,quality:4})]}));
 const skip={index:3,mode:'skip'},marks=await discoverObject(frames,width,height,[skip]);
 assert.deepEqual(marks[3],skip);assert.equal(marks[7].mode,'missing');assert.equal(marks[8].mode,'missing');
 for(const i of [0,1,2,4,5,6])assert.equal(marks[i].x,40+i*25);
});
test('a second object can exclude the first trajectory without excluding the other same-color body',async()=>{
 const frames=Array.from({length:8},(_,i)=>({index:i,candidates:[candidate(30+i*24,70),candidate(270-i*24,140)]}));
 const exclude=frames.map((f,i)=>({index:f.index,x:30+i*24,y:70}));
 const marks=await discoverObject(frames,width,height,[],{exclude});
 for(let i=0;i<marks.length;i++){assert.equal(marks[i].x,270-i*24);assert.equal(marks[i].y,140);}
});
test('selection yields between hypotheses and honours cancellation',async()=>{
 const frames=Array.from({length:9},(_,i)=>({index:i,candidates:[candidate(30+i*22,80)]}));
 let cancelled=false,yields=0;
 assert.equal(await discoverObject(frames,width,height,[],{cancelled:()=>cancelled,yieldTurn:async()=>{yields++;cancelled=true;}}),null);
 assert.equal(yields,1);
});
test('hue regions separate a green target touching a skin-colored hand without changing seeded detection',async()=>{
 const w=240,h=160,bg=new Uint8ClampedArray(w*h*4);
 for(let p=0;p<w*h;p++)bg.set([65,65,65,255],p*4);
 const frames=Array.from({length:7},(_,i)=>{
  const frame=new Uint8ClampedArray(bg),cx=45+i*25,cy=90;
  for(let y=40;y<98;y++)for(let x=0;x<44;x++)frame.set([215,145,105,255],(y*w+x)*4);
  for(let y=cy-10;y<=cy+10;y++)for(let x=cx-10;x<=cx+10;x++)if((x-cx)**2+(y-cy)**2<=100)frame.set([40,190,80,255],(y*w+x)*4);
  return {index:i,candidates:findDiscoveryCandidates(foregroundMask(bg,frame,30,w).pixels,frame,w,h,bg)};
 });
 const result=await discoverObject(frames,w,h);
 for(let i=0;i<result.length;i++){assert.equal(result[i].mode,'center');assert(Math.hypot(result[i].x-(45+i*25),result[i].y-90)<3);}
 const anchor={index:3,x:120.125,y:90.5,mode:'center',source:'manual'};
 const hinted=trackCandidates(frames,w,h,[anchor],3);assert.deepEqual(hinted[3],anchor);
});

test('a multicolored body has one whole-object center for discovery, seeded tracking and taps on every color',async()=>{
 const w=300,h=160,bg=new Uint8ClampedArray(w*h*4);
 for(let p=0;p<w*h;p++)bg.set([65,65,65,255],p*4);
 const pictures=Array.from({length:7},(_,i)=>{
  const frame=new Uint8ClampedArray(bg),left=30+i*30;
  for(let y=65;y<95;y++)for(let x=left;x<left+40;x++)frame.set([...(x<left+12?[25,190,70]:x<left+26?[220,35,45]:[235,235,235]),255],(y*w+x)*4);
  return frame;
 });
 const frames=pictures.map((frame,index)=>({index,candidates:findDiscoveryCandidates(foregroundMask(bg,frame,30,w).pixels,frame,w,h,bg)}));
 const automatic=await discoverObject(frames,w,h);
 const hint={index:3,...pickObjectCenter(bg,pictures[3],w,h,123,75,30),mode:'center'};
 const seeded=trackCandidates(frames,w,h,[hint],3);
 for(let i=0;i<frames.length;i++){
  assert.equal(frames[i].candidates.length,1,'a colored patch must not compete with the full body');
  assert.equal(automatic[i].x,49.5+i*30);assert.equal(automatic[i].y,79.5);
  assert.deepEqual(automatic[i].bounds,{x:30+i*30,y:65,w:40,h:30});
  assert.equal(seeded[i].x,automatic[i].x);assert.equal(seeded[i].y,automatic[i].y);
  for(const offset of [3,18,35]){
   const tapped=pickObjectCenter(bg,pictures[i],w,h,30+i*30+offset,75,30);
   assert.equal(tapped.source,'object');assert.equal(tapped.x,automatic[i].x);assert.equal(tapped.y,automatic[i].y);assert.deepEqual(tapped.bounds,automatic[i].bounds);
  }
 }
});

test('a body separated from an edge hand retains its neutral base instead of returning its colored lid',()=>{
 const w=240,h=160,bg=new Uint8ClampedArray(w*h*4);
 for(let p=0;p<w*h;p++)bg.set([65,65,65,255],p*4);
 const frame=new Uint8ClampedArray(bg);
 for(let y=0;y<91;y++)for(let x=0;x<49;x++)frame.set([215,145,105,255],(y*w+x)*4);
 for(let y=75;y<105;y++)for(let x=40;x<80;x++)frame.set([...(y<90?[40,190,80]:[235,235,235]),255],(y*w+x)*4);
 const candidates=findDiscoveryCandidates(foregroundMask(bg,frame,30,w).pixels,frame,w,h,bg);
 const body=candidates.find(c=>c.x>45&&c.x<80&&c.y>75&&c.y<105);
 assert(body);assert.equal(body.bounds.y,75);assert.equal(body.bounds.h,30);assert.equal(body.y,89.5);
 for(const y of [82,98]){
  const tapped=pickObjectCenter(bg,frame,w,h,65,y,30);
  assert.equal(tapped.source,'object');assert.equal(tapped.x,body.x);assert.equal(tapped.y,body.y);assert.deepEqual(tapped.bounds,body.bounds);
 }
});

test('a narrow connection to a faint reflection does not extend the measured body into the reflection',()=>{
 const w=160,h=160,bg=new Uint8ClampedArray(w*h*4);
 for(let p=0;p<w*h;p++)bg.set([190,190,190,255],p*4);
 const frame=new Uint8ClampedArray(bg),box=(x,y,ww,hh,color)=>{for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++)frame.set([...color,255],(yy*w+xx)*4);};
 box(50,65,40,30,[25,150,60]);box(50,82,40,13,[245,245,245]);box(68,94,5,8,[150,180,150]);box(55,101,30,15,[150,180,150]);
 const candidates=findDiscoveryCandidates(foregroundMask(bg,frame,30,w).pixels,frame,w,h,bg);
 assert.equal(candidates.length,1);const body=candidates[0];assert(body.attachmentTrimmed);assert(body.bounds.h<38);assert(body.y<83);
 const tapped=pickObjectCenter(bg,frame,w,h,75,88,30);assert.equal(tapped.x,body.x);assert.equal(tapped.y,body.y);assert.deepEqual(tapped.bounds,body.bounds);
});

test('a lower-contrast differently colored lobe remains part of a single connected object',()=>{
 const w=180,h=160,bg=new Uint8ClampedArray(w*h*4);
 for(let p=0;p<w*h;p++)bg.set([65,65,65,255],p*4);
 const frame=new Uint8ClampedArray(bg),box=(x,y,ww,hh,color)=>{for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++)frame.set([...color,255],(yy*w+xx)*4);};
 box(40,55,30,30,[230,40,40]);box(69,67,9,5,[230,40,40]);box(77,55,25,30,[35,35,165]);
 const candidates=findDiscoveryCandidates(foregroundMask(bg,frame,30,w).pixels,frame,w,h,bg);
 assert.equal(candidates.length,1);assert(!candidates[0].attachmentTrimmed);assert.equal(candidates[0].bounds.w,62);
 const a=pickObjectCenter(bg,frame,w,h,50,65,30),b=pickObjectCenter(bg,frame,w,h,90,65,30);assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.deepEqual(a.bounds,b.bounds);
});

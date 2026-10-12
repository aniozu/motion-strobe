import {foregroundMask} from './annotations.js';
// Manual marks stay fixed. Automatic tracking runs only on explicit request.
export function findCandidates(pixels,frame,width,height,background,options={}){
 const count=width*height,mask=new Uint8Array(count),core=new Uint8Array(count),opened=new Uint8Array(count);
 for(let p=0;p<count;p++)mask[p]=pixels[p*4+3]?1:0;
 // Opening breaks thin stems and isolated speckles only for center detection.
 // The foreground pixels used by the composite are left intact.
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const p=y*width+x;core[p]=mask[p-width-1]&mask[p-width]&mask[p-width+1]&mask[p-1]&mask[p]&mask[p+1]&mask[p+width-1]&mask[p+width]&mask[p+width+1];}
 let coreCount=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const p=y*width+x;if(core[p])coreCount++;opened[p]=core[p-width-1]|core[p-width]|core[p-width+1]|core[p-1]|core[p]|core[p+1]|core[p+width-1]|core[p+width]|core[p+width+1];}
 const bits=coreCount?opened:mask,queue=new Uint32Array(count),minArea=Math.max(9,Math.round(count*.000025)),candidates=[];
 for(let p=0;p<count;p++){
  if(!bits[p])continue;let head=0,tail=1;queue[0]=p;bits[p]=0;
  let sx=0,sy=0,r=0,g=0,b=0,contrast=0,near=Infinity,minX=width,minY=height,maxX=0,maxY=0;
  while(head<tail){const q=queue[head++],x=q%width,y=Math.floor(q/width);sx+=x;sy+=y;if(options.tap)near=Math.min(near,(x-options.tap.x)**2+(y-options.tap.y)**2);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);r+=frame[q*4];g+=frame[q*4+1];b+=frame[q*4+2];if(background)contrast+=Math.max(Math.abs(frame[q*4]-background[q*4]),Math.abs(frame[q*4+1]-background[q*4+1]),Math.abs(frame[q*4+2]-background[q*4+2]));
   for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=height)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=width)continue;const n=yy*width+xx;if(bits[n]){bits[n]=0;queue[tail++]=n;}}}
  }
  if(tail<minArea||tail>count*.45)continue;
  const w=maxX-minX+1,h=maxY-minY+1,fill=tail/(w*h);
  candidates.push({distanceToTap:Math.sqrt(near),x:sx/tail,y:sy/tail,area:tail,r:r/tail,g:g/tail,b:b/tail,bounds:{x:minX,y:minY,w,h},quality:Math.min(2,Math.log2(tail/minArea+1)*.35)+Math.min(.5,fill*.5)+Math.min(.8,contrast/tail/120*.8)-Math.min(2,Math.max(0,Math.abs(Math.log(w/h))-1)*.85)-(minX<=2||minY<=2||maxX>=width-3||maxY>=height-3?.8:0)});
 }
 return candidates.sort(options.tap?(a,b)=>a.distanceToTap-b.distanceToTap:(a,b)=>b.quality-a.quality).slice(0,options.tap||options.all?Infinity:16);
}

export function pickObjectCenter(background,frame,width,height,x,y,sensitivity=30){
 x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));
 const mask=foregroundMask(background,frame,sensitivity,width);
 const candidate=findCandidates(mask.pixels,frame,width,height,background,{tap:{x,y}})[0];
 const tolerance=Math.max(3,Math.min(12,Math.max(width,height)/80));
 return candidate&&candidate.distanceToTap<=tolerance
  ?{x:candidate.x,y:candidate.y,source:'object',bounds:candidate.bounds}
  :{x,y,source:'tap'};
}
export function replaceFrameMark(marks,mark){
 // One frame owns one mark. Changing it never removes marks on other frames.
 return [...marks.filter(p=>p.index!==mark.index),{...mark}].sort((a,b)=>a.index-b.index);
}
export function centersFromMarks(indices,marks,width,height){
 const byFrame=new Map(marks.map(mark=>[mark.index,mark]));
 return indices.map(index=>{
  const mark=byFrame.get(index);
  if(mark?.mode==='skip')return {index,confidence:'skipped'};
  if(mark?.mode==='missing')return {index,confidence:'missing'};
  if(!mark||!Number.isFinite(mark.x)||!Number.isFinite(mark.y))return {index,confidence:'unset'};
  const sx=Number.isFinite(mark.spaceWidth)&&mark.spaceWidth>0?width/mark.spaceWidth:1;
  const sy=Number.isFinite(mark.spaceHeight)&&mark.spaceHeight>0?height/mark.spaceHeight:1;
  return {index,x:Math.max(0,Math.min(width-1,mark.x*sx)),y:Math.max(0,Math.min(height-1,mark.y*sy)),confidence:mark.source==='auto'?(mark.uncertain?'uncertain':'auto'):'manual',source:mark.source||'manual'};
 });
}

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const appearance=(a,b)=>Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)/100;
function atMark(frame,mark,width,height){
 const x=mark.x*(width/(mark.spaceWidth||width)),y=mark.y*(height/(mark.spaceHeight||height));
 const near=frame.candidates.map(c=>({c,d:Math.hypot(Math.max(c.bounds.x-x,0,x-(c.bounds.x+c.bounds.w-1)),Math.max(c.bounds.y-y,0,y-(c.bounds.y+c.bounds.h-1)))})).sort((a,b)=>a.d-b.d)[0];
 if(!near||near.d>Math.max(3,Math.min(12,Math.max(width,height)/80)))return null;
 return {...near.c,x,y,anchored:true};
}
function trackDirection(frames,width,height,manual,identity){
 const diagonal=Math.hypot(width,height),stride=Math.abs(frames[1]?.index-frames[0]?.index)||1;
 let beam=[{score:0,path:[],last:null,previous:null}];
 for(const f of frames){
  const mark=manual.get(f.index),fixed=mark?.mode==='center'?atMark(f,mark,width,height):null;
  const next=[];
  for(const state of beam){
   const last=state.last,previous=state.previous,scale=Math.max(8,Math.sqrt(last?.area||identity.area));
   const gap=last?Math.abs(f.index-last.index)/stride:1;
   const motion=last&&previous?distance(last,previous)*stride/Math.abs(last.index-previous.index):0;
   const ratio=last&&previous?(f.index-last.index)/(last.index-previous.index):0;
   // Predict only the search position: exported centers remain actual detections.
   const hint=last?{x:last.x+(previous?(last.x-previous.x)*ratio*.65:0),y:last.y+(previous?(last.y-previous.y)*ratio*.65:0)}:identity;
   const radius=Math.min(diagonal*.35,Math.max(diagonal*.1,scale*4,motion*1.8)*Math.min(2,gap));
   const localIdentity=last?.anchored?last:identity;
   let options;
   if(mark){
    // A hand-adjusted center is an anchor even when its difference mask is absent.
    const positioned=mark.mode==='center'?{...localIdentity,x:mark.x*width/(mark.spaceWidth||width),y:mark.y*height/(mark.spaceHeight||height),anchored:true}:null;
    options=[fixed||positioned];
   }else{
    const nearby=f.candidates.map(c=>({c,d:distance(hint,c)}))
     .filter(({c,d})=>d<=radius&&appearance(localIdentity,c)<1.8&&Math.abs(Math.log(c.area/localIdentity.area))<1.5)
     .sort((a,b)=>a.d-b.d);
    // Locality is decided before quality ranking, so a bright distant patch cannot win.
    const nearest=nearby[0]?.d??Infinity;
    options=[...nearby.filter(({d})=>d<=nearest+scale*2).slice(0,6).map(({c})=>c),null];
   }
   for(const c of options){
    let score=state.score,newLast=last,newPrevious=previous;
    if(c){
     score+=2+Math.min(3,Math.max(0,c.quality))*.25-appearance(localIdentity,c)*.65-Math.abs(Math.log(c.area/localIdentity.area))*.4;
     if(last&&!c.anchored){
      const positionScale=scale*2+motion*.6+diagonal*.015;
      score-=distance(hint,c)/positionScale*1.8+appearance(last,c)*.45+Math.abs(Math.log(c.area/last.area))*.35;
     }
     newPrevious=last;newLast={...c,index:f.index};
    }else if(mark?.mode!=='skip')score-=1.5;
    next.push({score,path:[...state.path,c],last:newLast,previous:newPrevious});
   }
  }
  next.sort((a,b)=>b.score-a.score);beam=next.slice(0,32);
 }
 if(!frames.length)return [];
 const best=beam[0];
 return best.path.map((c,n)=>{
  const index=frames[n].index,mark=manual.get(index);
  if(mark)return {...mark};
  if(!c)return {index,mode:'missing',source:'auto'};
  const uncertain=beam.some(s=>best.score-s.score<.6&&s.path[n]&&distance(c,s.path[n])>Math.max(12,Math.sqrt(c.area)*1.5));
  return {index,mode:'center',x:c.x,y:c.y,source:'auto',uncertain,bounds:c.bounds,spaceWidth:width,spaceHeight:height};
 });
}
export function trackCandidates(frames,width,height,marks,seedIndex){
 const manual=new Map(marks.filter(m=>m.source!=='auto').map(m=>[m.index,m]));
 const seed=frames.findIndex(f=>f.index===seedIndex),mark=manual.get(seedIndex);
 if(seed<0||mark?.mode!=='center'||!Number.isFinite(mark.x)||!Number.isFinite(mark.y))throw Error('最初に、追いかける物体を手動で選んでください。');
 const identity=atMark(frames[seed],mark,width,height);
 if(!identity)throw Error('選んだ位置で物体を検出できませんでした。物体がはっきり写ったコマを選び、感度や位置を調整してください。');
 const forward=trackDirection(frames.slice(seed),width,height,manual,identity);
 const backward=trackDirection(frames.slice(0,seed+1).reverse(),width,height,manual,identity).reverse();
 return [...backward.slice(0,-1),...forward];
}

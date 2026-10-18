import {foregroundMask} from './annotations.js';
import {regionContours} from './region-contours.js';
// Manual marks stay fixed. Automatic tracking runs only on explicit request.
export function findCandidates(pixels,frame,width,height,background,options={}){
 const count=width*height,mask=new Uint8Array(count),core=new Uint8Array(count),opened=new Uint8Array(count);
 const hues=options.colorIslands?new Float32Array(count).fill(-1):null;
 for(let p=0;p<count;p++){
  if(!pixels[p*4+3])continue;
  if(hues){
   const r=frame[p*4],g=frame[p*4+1],b=frame[p*4+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),chroma=hi-lo;
   if(chroma<30||chroma/Math.max(1,hi)<.2)continue;
   let hue=hi===r?(g-b)/chroma:hi===g?2+(b-r)/chroma:4+(r-g)/chroma;
   hues[p]=(hue+6)%6;
  }
  mask[p]=1;
 }
 // Opening breaks thin stems and isolated speckles only for center detection.
 // The foreground pixels used by the composite are left intact.
 const radius=options.openingRadius||1;
 if(!options.preserveShape)for(let y=radius;y<height-radius;y++)for(let x=radius;x<width-radius;x++){const p=y*width+x;if(radius===1){core[p]=mask[p-width-1]&mask[p-width]&mask[p-width+1]&mask[p-1]&mask[p]&mask[p+1]&mask[p+width-1]&mask[p+width]&mask[p+width+1];continue;}let value=1;for(let dy=-radius;dy<=radius&&value;dy++)for(let dx=-radius;dx<=radius;dx++)if(!mask[p+dy*width+dx]){value=0;break;}core[p]=value;}
 let coreCount=0;
 if(!options.preserveShape)for(let y=radius;y<height-radius;y++)for(let x=radius;x<width-radius;x++){const p=y*width+x;if(core[p])coreCount++;if(radius===1){opened[p]=core[p-width-1]|core[p-width]|core[p-width+1]|core[p-1]|core[p]|core[p+1]|core[p+width-1]|core[p+width]|core[p+width+1];continue;}let value=0;for(let dy=-radius;dy<=radius&&!value;dy++)for(let dx=-radius;dx<=radius;dx++)if(core[p+dy*width+dx]){value=1;break;}opened[p]=value;}
 const bits=options.preserveShape?mask:coreCount?opened:mask,queue=new Uint32Array(count),minArea=Math.max(options.preserveShape?4:9,Math.round(count*.000025)),candidates=[];
 if(hues)for(let p=0;p<count;p++)if(hues[p]<0)bits[p]=0;
 for(let p=0;p<count;p++){
  if(!bits[p])continue;let head=0,tail=1;queue[0]=p;bits[p]=0;
  let sx=0,sy=0,sxx=0,syy=0,sxy=0,r=0,g=0,b=0,contrast=0,near=Infinity,minX=width,minY=height,maxX=0,maxY=0;const histogram=new Float32Array(64);
  while(head<tail){const q=queue[head++],x=q%width,y=Math.floor(q/width);sx+=x;sy+=y;if(options.tap)near=Math.min(near,(x-options.tap.x)**2+(y-options.tap.y)**2);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);r+=frame[q*4];g+=frame[q*4+1];b+=frame[q*4+2];if(background)contrast+=Math.max(Math.abs(frame[q*4]-background[q*4]),Math.abs(frame[q*4+1]-background[q*4+1]),Math.abs(frame[q*4+2]-background[q*4+2]));
   sxx+=x*x;syy+=y*y;sxy+=x*y;histogram[((frame[q*4]>>6)<<4)|((frame[q*4+1]>>6)<<2)|(frame[q*4+2]>>6)]++;
   for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=height)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=width)continue;const n=yy*width+xx;if(bits[n]&&(!hues||Math.min(Math.abs(hues[p]-hues[n]),6-Math.abs(hues[p]-hues[n]))<=.5)){bits[n]=0;queue[tail++]=n;}}}
  }
  if(tail<minArea||tail>count*.45)continue;
  const w=maxX-minX+1,h=maxY-minY+1,fill=tail/(w*h);
  for(let k=0;k<64;k++)histogram[k]/=tail;
  const angle=.5*Math.atan2(2*(sxy/tail-sx*sy/(tail*tail)),sxx/tail-sx*sx/(tail*tail)-syy/tail+sy*sy/(tail*tail));
  candidates.push({angle,histogram,pixels:options.keepPixels?queue.slice(0,tail):undefined,distanceToTap:Math.sqrt(near),x:sx/tail,y:sy/tail,area:tail,r:r/tail,g:g/tail,b:b/tail,contrast:contrast/tail,bounds:{x:minX,y:minY,w,h},quality:Math.min(2,Math.log2(tail/minArea+1)*.35)+Math.min(.5,fill*.5)+Math.min(.8,contrast/tail/120*.8)-Math.min(2,Math.max(0,Math.abs(Math.log(w/h))-1)*.85)-(minX<=2||minY<=2||maxX>=width-3||maxY>=height-3?.8:0)});
 }
 return candidates.sort(options.tap?(a,b)=>a.distanceToTap-b.distanceToTap:(a,b)=>b.quality-a.quality).slice(0,options.tap||options.all?Infinity:16);
}

const hue=(r,g,b)=>{const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;return d<30||d/Math.max(1,hi)<.2?null:((hi===r?(g-b)/d:hi===g?2+(b-r)/d:4+(r-g)/d)+6)%6;};
const hueDistance=(a,b)=>Math.min(Math.abs(a-b),6-Math.abs(a-b));
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));

// A faint reflection can join the body through a narrow neck in the difference
// mask. Separate it by thickness and contrast, without segmenting paint colors.
// Regrowing from all thick regions restores the original body boundary rather
// than using an eroded core as the measured object.
function trimWeakAttachment(parent,frame,width,height,background,options){
 const b=parent.bounds;
 if(!background||parent.area<150||Math.min(b.w,b.h)<15||parent.area/(b.w*b.h)<.2)return parent;
 const radius=Math.max(2,Math.min(4,Math.round(Math.min(b.w,b.h)*.07))),pad=radius+1;
 const left=Math.max(0,b.x-pad),top=Math.max(0,b.y-pad),w=Math.min(width,b.x+b.w+pad)-left,h=Math.min(height,b.y+b.h+pad)-top;
 const local=new Uint8ClampedArray(w*h*4),image=new Uint8ClampedArray(w*h*4),back=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=((top+y)*width+left+x)*4,q=(y*w+x)*4;image.set(frame.subarray(p,p+4),q);back.set(background.subarray(p,p+4),q);}
 for(const p of parent.pixels){const q=((Math.floor(p/width)-top)*w+p%width-left)*4;local.set(frame.subarray(p*4,p*4+4),q);}
 const parts=findCandidates(local,image,w,h,back,{all:true,openingRadius:radius,keepPixels:true});
 const substantial=parts.filter(c=>c.area>parent.area*.08).sort((a,b)=>b.area*b.contrast-a.area*a.contrast),main=substantial[0];
 if(substantial.length<2||main.area<parent.area*.4||substantial.reduce((sum,c)=>sum+c.area,0)<parent.area*.78||
  substantial.slice(1).some(c=>c.contrast>main.contrast*.7||Math.max(c.bounds.w,c.bounds.h)>Math.min(c.bounds.w,c.bounds.h)*3.5||hue(main.r,main.g,main.b)!==null&&hue(c.r,c.g,c.b)!==null&&hueDistance(hue(main.r,main.g,main.b),hue(c.r,c.g,c.b))>1))return parent;
 const labels=new Uint16Array(w*h),queue=new Uint32Array(w*h);let head=0,tail=0;
 for(let i=0;i<parts.length;i++)for(const p of parts[i].pixels){labels[p]=i+1;queue[tail++]=p;}
 while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*w+xx;if(xx<0||xx>=w||yy<0||yy>=h||labels[n]||!local[n*4+3])continue;labels[n]=labels[p];queue[tail++]=n;}}
 const selected=parts.indexOf(main)+1;
 for(let p=0;p<labels.length;p++)if(labels[p]!==selected)local[p*4+3]=0;
 const tap=options.tap?{x:options.tap.x-left,y:options.tap.y-top}:undefined;
 const found=findCandidates(local,image,w,h,back,{all:true,tap,keepPixels:true}).sort((a,b)=>b.area-a.area)[0];
 return found?{...found,pixels:found.pixels.map(p=>(Math.floor(p/w)+top)*width+p%w+left),x:found.x+left,y:found.y+top,bounds:{...found.bounds,x:found.bounds.x+left,y:found.bounds.y+top},attachmentTrimmed:true}:parent;
}

// A color patch can identify a body, but is never a competing object center.
// Use the full connected silhouette unless it is clearly over-merged with an
// edge hand or a long thin support. Only that exceptional case uses color to
// separate it, retaining neutral parts (white bases, metal caps, etc.).
function separateMergedBody(seed,pixels,frame,width,height,background,options){
 const b=seed.bounds,pad=Math.ceil(Math.max(b.w,b.h)*.45)+2;
 const left=Math.max(0,b.x-pad),top=Math.max(0,b.y-pad),w=Math.min(width,b.x+b.w+pad)-left,h=Math.min(height,b.y+b.h+pad)-top;
 const local=new Uint8ClampedArray(w*h*4),image=new Uint8ClampedArray(w*h*4),back=new Uint8ClampedArray(w*h*4),color=hue(seed.r,seed.g,seed.b);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=((top+y)*width+left+x)*4,q=(y*w+x)*4;
  image.set(frame.subarray(p,p+4),q);if(background)back.set(background.subarray(p,p+4),q);
  const tone=hue(frame[p],frame[p+1],frame[p+2]);
  if(pixels[p+3]&&(tone===null||color===null||hueDistance(color,tone)<.75))local.set(frame.subarray(p,p+4),q);
 }
 const tap=options.tap?{x:options.tap.x-left,y:options.tap.y-top}:undefined;
 const candidates=findCandidates(local,image,w,h,background?back:null,{all:true,tap,keepPixels:true,openingRadius:Math.max(1,Math.min(3,Math.round(Math.min(b.w,b.h)*.1)))});
 const found=candidates.filter(c=>overlap({x:c.bounds.x+left,y:c.bounds.y+top,w:c.bounds.w,h:c.bounds.h},b)>b.w*b.h*.35).sort((a,b)=>b.area-a.area)[0];
 return found?{...found,pixels:found.pixels.map(p=>(Math.floor(p/w)+top)*width+p%w+left),x:found.x+left,y:found.y+top,bounds:{...found.bounds,x:found.bounds.x+left,y:found.bounds.y+top},separated:true}:null;
}
export function findDiscoveryCandidates(pixels,frame,width,height,background,options={}){
 const whole=findCandidates(pixels,frame,width,height,background,{all:true,...options,keepPixels:true});
 const colored=findCandidates(pixels,frame,width,height,background,{all:true,colorIslands:true});
 const result=[];
 for(const original of whole){
  const parent=trimWeakAttachment(original,frame,width,height,background,options);
  const b=parent.bounds,span=Math.max(b.w,b.h),fill=parent.area/(b.w*b.h),edge=b.x<=2||b.y<=2||b.x+b.w>=width-2||b.y+b.h>=height-2;
  const seeds=colored.filter(c=>{
   const s=c.bounds;
   return overlap(b,s)>.9*s.w*s.h&&parent.area>c.area*3&&Math.max(s.w,s.h)*2.5<span&&
    (fill<.15||edge&&parent.area>c.area*4)&&Math.max(s.w,s.h)<Math.min(s.w,s.h)*3;
  });
  const bodies=seeds.map(c=>separateMergedBody(c,pixels,frame,width,height,background,options)).filter(Boolean);
  if(!bodies.length){result.push(parent);continue;}
  const unique=[];
  for(const body of bodies)if(!unique.some(c=>overlap(c.bounds,body.bounds)/Math.min(c.bounds.w*c.bounds.h,body.bounds.w*body.bounds.h)>.8))unique.push(body);
  result.push(...unique);
 }
 return result.map(({pixels:regionPixels,...candidate})=>({...candidate,contours:regionContours(regionPixels,width,candidate.bounds)})).sort(options.tap?(a,b)=>a.distanceToTap-b.distanceToTap:(a,b)=>b.quality-a.quality);
}

export function pickObjectCenter(background,frame,width,height,x,y,sensitivity=30){
 x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));
 const mask=foregroundMask(background,frame,sensitivity,width);
 const candidate=findDiscoveryCandidates(mask.pixels,frame,width,height,background,{tap:{x,y}})[0];
 const tolerance=Math.max(3,Math.min(12,Math.max(width,height)/80));
 return candidate&&candidate.distanceToTap<=tolerance
  ?{x:candidate.x,y:candidate.y,source:'object',bounds:candidate.bounds,contours:candidate.contours}
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
  const bounds=mark.bounds&&[mark.bounds.x,mark.bounds.y,mark.bounds.w,mark.bounds.h].every(Number.isFinite)&&mark.bounds.w>0&&mark.bounds.h>0?{x:mark.bounds.x*sx,y:mark.bounds.y*sy,w:mark.bounds.w*sx,h:mark.bounds.h*sy}:undefined;
  const contours=Array.isArray(mark.contours)?mark.contours.filter(loop=>Array.isArray(loop)&&loop.length>=6&&loop.length%2===0&&loop.every(Number.isFinite)).map(loop=>loop.map((value,i)=>value*(i%2?sy:sx))):[];
  return {index,x:Math.max(0,Math.min(width-1,mark.x*sx)),y:Math.max(0,Math.min(height-1,mark.y*sy)),confidence:mark.source==='auto'?(mark.uncertain?'uncertain':'auto'):'manual',source:mark.source||'manual',...(bounds?{bounds}:{}),...(contours.length?{contours}:{})};
 });
}

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const appearance=(a,b)=>{
 const mean=Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)/100;
 if(!a.histogram||!b.histogram)return mean;
 let overlap=0;for(let k=0;k<64;k++)overlap+=Math.min(a.histogram[k],b.histogram[k]);
 return mean*.7+(1-overlap)*.8;
};
function atMark(frame,mark,width,height){
 const x=mark.x*(width/(mark.spaceWidth||width)),y=mark.y*(height/(mark.spaceHeight||height));
 const near=frame.candidates.map(c=>({c,d:Math.hypot(Math.max(c.bounds.x-x,0,x-(c.bounds.x+c.bounds.w-1)),Math.max(c.bounds.y-y,0,y-(c.bounds.y+c.bounds.h-1)))})).sort((a,b)=>a.d-b.d)[0];
 if(!near||near.d>Math.max(3,Math.min(12,Math.max(width,height)/80)))return null;
 return {...near.c,x,y,anchored:true};
}
export function trackDirection(frames,width,height,manual,identity,{beamWidth=32}={}){
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
  next.sort((a,b)=>b.score-a.score);beam=next.slice(0,beamWidth);
 }
 if(!frames.length)return [];
 const best=beam[0];
 return best.path.map((c,n)=>{
  const index=frames[n].index,mark=manual.get(index);
  if(mark)return {...mark};
  if(!c)return {index,mode:'missing',source:'auto'};
  const uncertain=beam.some(s=>best.score-s.score<.6&&s.path[n]&&distance(c,s.path[n])>Math.max(12,Math.sqrt(c.area)*1.5));
  return {index,mode:'center',x:c.x,y:c.y,source:'auto',uncertain,bounds:c.bounds,...(c.contours?{contours:c.contours}:{}),spaceWidth:width,spaceHeight:height};
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

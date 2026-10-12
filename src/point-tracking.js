import {foregroundMask} from './annotations.js';
import {findCandidates} from './tracking.js';

// Bounded, rotation-aware color registration. Only one small detection image
// and <=160 template samples are kept; final matching reads the cached original.
const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function color(frame,width,height,x,y){
 if(x<0||y<0||x>=width-1||y>=height-1)return null;
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,p=(iy*width+ix)*4;
 return [0,1,2].map(k=>(frame[p+k]*(1-fx)+frame[p+4+k]*fx)*(1-fy)+(frame[p+width*4+k]*(1-fx)+frame[p+width*4+4+k]*fx)*fy);
}
function reduced(frame,width,height){
 const ratio=Math.min(1,384/Math.max(width,height)),w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio)),pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4,q=(Math.min(height-1,Math.floor((y+.5)*height/h))*width+Math.min(width-1,Math.floor((x+.5)*width/w)))*4;
  pixels.set(frame.subarray(q,q+4),p);
 }
 return {pixels,width:w,height:h,sx:width/w,sy:height/h};
}
function objects(frame,background,width,height,sensitivity,keepPixels=false){
 const small=reduced(frame,width,height),mask=foregroundMask(background.pixels,small.pixels,sensitivity,small.width);
 // Join one-pixel gaps left by blur or background subtraction without erasing
 // thin handles. The composite mask itself is never modified.
 const w=small.width,h=small.height,dilated=new Uint8Array(w*h);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let on=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)on|=mask.pixels[((y+dy)*w+x+dx)*4+3];dilated[y*w+x]=on?1:0;
 }
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let on=1;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)on&=dilated[(y+dy)*w+x+dx];mask.pixels[(y*w+x)*4+3]=on?255:0;
 }
 const candidates=findCandidates(mask.pixels,small.pixels,small.width,small.height,background.pixels,{all:true,preserveShape:true,keepPixels});
 return {small,candidates:candidates.map(c=>({...c,x:(c.x+.5)*small.sx,y:(c.y+.5)*small.sy,area:c.area*small.sx*small.sy,bounds:{x:c.bounds.x*small.sx,y:c.bounds.y*small.sy,w:c.bounds.w*small.sx,h:c.bounds.h*small.sy}}))};
}
function anchored(mark,width,height){return {x:mark.x*width/(mark.spaceWidth||width),y:mark.y*height/(mark.spaceHeight||height)};}
function nearest(candidates,p){
 return candidates.map(c=>({c,d:Math.hypot(Math.max(c.bounds.x-p.x,0,p.x-c.bounds.x-c.bounds.w),Math.max(c.bounds.y-p.y,0,p.y-c.bounds.y-c.bounds.h))})).sort((a,b)=>a.d-b.d)[0];
}
function modelAt(frame,background,width,height,sensitivity,point){
 const {small,candidates}=objects(frame,background,width,height,sensitivity,true),near=nearest(candidates,point);
 if(!near||near.d>Math.max(6,width/100))return null;
 const c=near.c,samples=[],pointSamples=[],seen=new Set();
 const add=(x,y,weight)=>{
  const rgb=color(frame,width,height,x,y);if(!rgb)return;
  const key=Math.round(x)+':'+Math.round(y);if(seen.has(key))return;seen.add(key);
  samples.push({x:x-c.x,y:y-c.y,rgb,weight});
 };
 // Shape/color across the object identifies orientation, including a half turn.
 for(let i=0;i<c.pixels.length;i+=Math.max(1,Math.ceil(c.pixels.length/72))){const p=c.pixels[i];add((p%small.width+.5)*small.sx,(Math.floor(p/small.width)+.5)*small.sy,1);}
 // Negative samples around the silhouette distinguish a rotated object from
 // a uniformly colored patch. Limit to this object's box, not a distant hand.
 const bits=new Set(c.pixels),edgeStep=Math.max(1,Math.ceil(c.pixels.length/24));
 for(let i=0;i<c.pixels.length;i+=edgeStep){const p=c.pixels[i],x=p%small.width,y=Math.floor(p/small.width);
  for(const [dx,dy] of [[-2,0],[2,0],[0,-2],[0,2]])if(x+dx>=0&&x+dx<small.width&&y+dy>=0&&y+dy<small.height&&!bits.has(p+dx+dy*small.width)){add((x+dx+.5)*small.sx,(y+dy+.5)*small.sy,.45);break;}
 }
 // A denser, higher-weight patch around the actual selected point preserves
 // the marker and its surroundings instead of recentering the silhouette.
 const radius=Math.max(4,Math.min(14,Math.sqrt(c.area)*.1));
 for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
  const dx=x*radius/2,dy=y*radius/2,rgb=color(frame,width,height,point.x+dx,point.y+dy);
  add(point.x+dx,point.y+dy,2);if(rgb)pointSamples.push({x:dx,y:dy,rgb,weight:1});
 }
 if(samples.length<12)return null;
 return {samples,pointSamples,pointColor:color(frame,width,height,point.x,point.y),center:{x:c.x,y:c.y},point:{x:point.x-c.x,y:point.y-c.y},area:c.area,angle:c.angle,bounds:c.bounds};
}
function refinePoint(model,frame,width,height,pose,point){
 const patch={samples:model.pointSamples},reference=model.pointColor;
 const spread=model.pointSamples.reduce((sum,p)=>sum+Math.hypot(...p.rgb.map((v,k)=>v-reference[k])),0)/model.pointSamples.length;
 if(spread<12)return null;
 const radius=Math.min(48,Math.max(8,Math.sqrt(model.area)*.9));let best=null;
 const consider=(x,y,angle=pose.angle)=>{const p={x,y,angle,scale:pose.scale},score=cost(patch,frame,width,height,p);if(!best||score<best.score)best={...p,score};};
 for(let y=Math.max(1,point.y-radius);y<Math.min(height-2,point.y+radius);y+=2)for(let x=Math.max(1,point.x-radius);x<Math.min(width-2,point.x+radius);x+=2){
  const rgb=color(frame,width,height,x,y);if(!rgb)continue;
  // Test chromatic similarity before the patch, so only a few locations need
  // full registration. A distinctive marker is more precise than its outline.
  if(Math.abs((rgb[0]-rgb[1])-(reference[0]-reference[1]))+Math.abs((rgb[0]-rgb[2])-(reference[0]-reference[2]))>65)continue;
  for(const a of [-12,0,12])consider(x,y,pose.angle+a*Math.PI/180);
 }
 if(!best)return null;
 for(const step of [1,.35]){const p={...best};for(const dx of [-step,0,step])for(const dy of [-step,0,step])consider(p.x+dx,p.y+dy,p.angle);}
 return best.score<.065?best:null;
}
function projected(model,pose){const co=Math.cos(pose.angle)*pose.scale,si=Math.sin(pose.angle)*pose.scale;return {x:pose.x+co*model.point.x-si*model.point.y,y:pose.y+si*model.point.x+co*model.point.y};}
function cost(model,frame,width,height,pose){
 const co=Math.cos(pose.angle)*pose.scale,si=Math.sin(pose.angle)*pose.scale;let sum=0,weight=0;
 for(const p of model.samples){const rgb=color(frame,width,height,pose.x+co*p.x-si*p.y,pose.y+si*p.x+co*p.y);if(!rgb)return 1;
  const dr=rgb[0]-p.rgb[0],dg=rgb[1]-p.rgb[1],db=rgb[2]-p.rgb[2],brightness=Math.max(-18,Math.min(18,(dr+dg+db)/3));
  sum+=p.weight*(Math.abs(dr-brightness)+Math.abs(dg-brightness)+Math.abs(db-brightness))/3;weight+=p.weight;
 }
 return sum/(weight*255);
}
function register(model,frame,width,height,candidates,hint,lastPose,gap){
 const radius=Math.min(Math.hypot(width,height)*.38,Math.max(Math.hypot(width,height)*.1,Math.sqrt(model.area)*4)*Math.min(2,gap));
 const nearby=candidates.filter(c=>distance(c,hint)<=radius&&c.area/model.area>.3&&c.area/model.area<2.8).sort((a,b)=>distance(a,hint)-distance(b,hint)).slice(0,3);
 let best=null,alternatives=[];
 const consider=pose=>{const score=cost(model,frame,width,height,pose);const result={...pose,score};if(!best||score<best.score)best=result;return result;};
 for(const c of nearby){
  const scale=Math.sqrt(c.area/model.area),base=c.angle-model.angle;
  for(const angle of [base,base+Math.PI,...[-30,-15,15,30].map(a=>base+a*Math.PI/180),...[-30,-15,15,30].map(a=>base+Math.PI+a*Math.PI/180),lastPose?.angle??base])alternatives.push(consider({x:c.x,y:c.y,angle:wrap(angle),scale}));
 }
 const recover=()=>{
  const pose={...lastPose,x:hint.x,y:hint.y},p=projected(model,pose);let precise=null;
  for(const a of [-30,0,30]){const candidate=refinePoint(model,frame,width,height,{...pose,angle:pose.angle+a*Math.PI/180},p);if(candidate&&(!precise||candidate.score<precise.score))precise=candidate;}
  if(!precise||precise.score>.035)return null;
  return {...pose,x:pose.x+precise.x-p.x,y:pose.y+precise.y-p.y,point:{x:precise.x,y:precise.y},score:precise.score,uncertain:true};
 };
 if(!best)return recover();
 // A coarse full turn is reserved for difficult frames; normal frames test
 // the two PCA orientations and a few nearby angles only.
 if(best.score>.09)for(const c of nearby.slice(0,2))for(let n=0;n<12;n++)alternatives.push(consider({x:c.x,y:c.y,angle:n*TAU/12,scale:Math.sqrt(c.area/model.area)}));
 for(const [step,angleStep] of [[Math.max(1,width/384),8],[1,3],[.35,1]]){
  const base={...best};for(const dx of [-step,0,step])for(const dy of [-step,0,step])for(const a of [-angleStep,0,angleStep])consider({...base,x:base.x+dx,y:base.y+dy,angle:base.angle+a*Math.PI/180});
 }
 // Refine scale only locally, with a fixed number of comparisons.
 const base={...best};for(const scale of [.97,1.03])consider({...base,scale:base.scale*scale});
 let point=projected(model,best);if(best.score>.17||point.x<0||point.y<0||point.x>=width||point.y>=height)return recover();
 const precise=refinePoint(model,frame,width,height,best,point);
 if(precise)point={x:precise.x,y:precise.y};
 const ambiguous=alternatives.some(a=>a.score-best.score<.012&&distance(projected(model,a),point)>Math.max(5,Math.sqrt(model.area)*.15));
 const competing=alternatives.some(a=>a.score-best.score<.015&&distance(a,best)>Math.sqrt(model.area)*.8);
 return {...best,point,uncertain:competing||((best.score>.095||ambiguous)&&!(precise&&precise.score<.035&&best.score<.13))};
}

export async function trackSelectedPoint({indices,getFrame,background,width,height,marks,seedIndex,sensitivity=30,cancelled=()=>false,yieldTurn=()=>Promise.resolve(),onProgress=()=>{}}){
 const manual=new Map(marks.filter(m=>m.source!=='auto').map(m=>[m.index,m])),seed=indices.indexOf(seedIndex),seedMark=manual.get(seedIndex);
 if(seed<0||seedMark?.mode!=='center'||![seedMark.x,seedMark.y].every(Number.isFinite))throw Error('最初に、追いかける点を手動で指定してください。');
 const bg=reduced(background,width,height),point=anchored(seedMark,width,height),initial=modelAt(getFrame(seedIndex),bg,width,height,sensitivity,point);
 if(!initial)throw Error('指定した点の周りで物体を検出できません。はっきり写ったコマで指定し直してください。');
 const results=new Map([[seedIndex,{...seedMark}]]);let done=1;
 for(const direction of [1,-1]){
  let model=initial,lastPose={...model.center,angle:0,scale:1},lastPoint=point,previous=null,lastIndex=seedIndex,gap=1;
  for(let n=seed+direction;n>=0&&n<indices.length;n+=direction){
   if(cancelled())return null;
   const index=indices[n],fixed=manual.get(index),frame=getFrame(index);
   if(!frame)throw Error('画像が不足しています。写真を作り直してください。');
   if(fixed){
    results.set(index,{...fixed});
    if(fixed.mode==='center'){
     const p=anchored(fixed,width,height),updated=modelAt(frame,bg,width,height,sensitivity,p);
     // Exact hand adjustments are retained even if the foreground is absent.
     if(updated){model=updated;lastPose={...model.center,angle:0,scale:1};}
     else lastPose={...lastPose,x:lastPose.x+p.x-lastPoint.x,y:lastPose.y+p.y-lastPoint.y};
     lastPoint=p;lastIndex=index;previous=null;gap=1;
    }else gap++;
   }else{
    const stride=Math.abs(indices[1]-indices[0])||1;
    const ratio=previous?(index-lastIndex)/(lastIndex-previous.index):0;
    const hint={x:lastPose.x+(previous?(lastPose.x-previous.x)*ratio*.65:0),y:lastPose.y+(previous?(lastPose.y-previous.y)*ratio*.65:0)};
    const {candidates}=objects(frame,bg,width,height,sensitivity),match=register(model,frame,width,height,candidates,hint,lastPose,Math.max(gap,Math.abs(index-lastIndex)/stride));
    if(!match){results.set(index,{index,mode:'missing',source:'auto'});gap++;}
    else{
     results.set(index,{index,mode:'center',x:match.point.x,y:match.point.y,source:'auto',uncertain:match.uncertain,tracking:'point',spaceWidth:width,spaceHeight:height});
     // A doubtful match must never become the next anchor (no template drift).
     if(!match.uncertain){previous={...lastPose,index:lastIndex};lastPose=match;lastPoint=match.point;lastIndex=index;gap=1;}else gap++;
    }
   }
   onProgress(++done/indices.length);await yieldTurn();
  }
 }
 return indices.map(index=>results.get(index));
}

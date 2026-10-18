import {trackDirection,appearance} from './tracking.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const average=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const deviation=a=>{const mean=average(a);return Math.sqrt(average(a.map(x=>(x-mean)**2)));};

function evaluate(frames,marks,width,height){
 const found=[];
 for(let i=0;i<marks.length;i++){
  const m=marks[i];if(m.mode!=='center')continue;
  const c=frames[i].candidates.find(c=>distance(c,m)<.01);if(c)found.push({...c,index:frames[i].index});
 }
 const available=marks.filter(m=>m.mode!=='skip').length;
 if(found.length<Math.min(3,available)||found.length<2)return null;
 const xs=found.map(c=>c.x),ys=found.map(c=>c.y),diagonal=Math.hypot(width,height);
 const extent=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
 const scale=Math.sqrt(Math.exp(average(found.map(c=>Math.log(c.area)))));
 // A permanent difference patch, a hand twitch, and isolated blinking pixels
 // are not a moving target. This is relative to object size and image size.
 if(extent<Math.max(diagonal*.025,scale*1.15))return null;
 const coverage=found.length/Math.max(1,available);
 if(coverage<.28)return null;
 const border=average(found.map(c=>Math.min(c.x/width,c.y/height,1-c.x/width,1-c.y/height)<.045?1:0));
 const sizes=found.map(c=>Math.log(c.area)),sizeChange=deviation(sizes);
 const identity=found[Math.floor(found.length/2)];
 const colorChange=average(found.map(c=>appearance(identity,c)));
 let travel=0;const velocities=[];
 for(let i=1;i<found.length;i++){
  const a=found[i-1],b=found[i],dt=Math.max(1,b.index-a.index);
  travel+=distance(a,b);velocities.push({x:(b.x-a.x)/dt,y:(b.y-a.y)/dt});
 }
 const speed=average(velocities.map(v=>Math.hypot(v.x,v.y)));
 const turns=velocities.slice(1).map((v,i)=>distance(v,velocities[i])/Math.max(.1,speed));
 const jerk=average(turns),largestTurn=Math.max(0,...turns);
 const bulk=average(found.map(c=>c.area/(width*height)));
 const score=coverage*5+Math.min(1.2,extent/diagonal)*4+Math.min(1,travel/diagonal)*.7+
  average(found.map(c=>Math.min(3,c.quality)))*.15-sizeChange*1.3-colorChange*.8-border*3-
  jerk*1.2-Math.max(0,largestTurn-2)*1.2-Math.max(0,bulk-.04)*15;
 return {score,coverage,extent,found,marks};
}

// Automatic selection proposes identities in several frames, tracks each in
// both directions, and compares the complete trajectories. No synthetic manual
// hint is saved, so a later user correction always takes precedence.
export async function discoverObject(frames,width,height,marks=[],{cancelled=()=>false,yieldTurn=async()=>{},onProgress=()=>{},exclude=[]}={}){
 const fixed=new Map(marks.filter(m=>m.source!=='auto').map(m=>[m.index,m]));
 const filtered=frames.map(f=>({...f,candidates:f.candidates.filter(c=>!exclude.some(p=>p.index===f.index&&distance(p,c)<Math.max(4,Math.sqrt(c.area)*.65))).sort((a,b)=>b.quality-a.quality).slice(0,48)}));
 const proposals=[];
 const positions=new Set(Array.from({length:Math.min(7,frames.length)},(_,i)=>Math.round(i*(frames.length-1)/Math.max(1,Math.min(7,frames.length)-1))));
 for(const position of positions){
  const frame=filtered[position];if(!frame||fixed.has(frame.index))continue;
  const ranked=frame.candidates.filter(c=>c.area>=9&&c.area<width*height*.15)
   .map(c=>({c,priority:c.quality+Math.min(c.bounds.w,c.bounds.h)/Math.max(c.bounds.w,c.bounds.h)*.4-(Math.min(c.x/width,c.y/height,1-c.x/width,1-c.y/height)<.04?1:0)}))
   .sort((a,b)=>b.priority-a.priority);
  for(const {c,priority} of ranked.slice(0,6))proposals.push({position,c,priority});
 }
 proposals.sort((a,b)=>b.priority-a.priority);
 const hypotheses=[];
 for(let n=0;n<proposals.length;n++){
  if(cancelled())return null;
  const {position,c}=proposals[n],index=filtered[position].index;
  const local=filtered.map((f,i)=>i===position?{...f,candidates:[c]}:f);
  const anchor={index,mode:'center',x:c.x,y:c.y,source:'auto',bounds:c.bounds,...(c.contours?{contours:c.contours}:{}),spaceWidth:width,spaceHeight:height};
  const constraints=new Map(fixed);constraints.set(index,anchor);
  const forward=trackDirection(local.slice(position),width,height,constraints,c,{beamWidth:12});
  const backward=trackDirection(local.slice(0,position+1).reverse(),width,height,constraints,c,{beamWidth:12}).reverse();
  const path=[...backward.slice(0,-1),...forward],evaluation=evaluate(local,path,width,height);
  if(evaluation)hypotheses.push(evaluation);
  onProgress((n+1)/proposals.length);await yieldTurn();
 }
 if(cancelled())return null;
 hypotheses.sort((a,b)=>b.score-a.score);
 const best=hypotheses[0];
 if(!best||best.score<2)return frames.map(f=>fixed.get(f.index)||{index:f.index,mode:'missing',source:'auto'});
 // Candidate geometry is shared with tapped object centers. Color patches
 // identify merged bodies upstream; they never supply a partial-body center.
 return best.marks;
}

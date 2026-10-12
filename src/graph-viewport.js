const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const copy=ranges=>ranges?Object.fromEntries(Object.entries(ranges).map(([key,range])=>[key,{...range}])):null;

// Matching x/y/t axes share their windows, but each has its own zoom scale.
export class GraphViewport{
 constructor(ranges=null){this.set(ranges);}
 set(ranges){this.base=copy(ranges);this.reset();}
 reset(){this.ranges=copy(this.base);this.scales={x:1,y:1,t:1};}
 zoom(type,factor,horizontal=.5,vertical=.5,axis='both'){
  if(!this.ranges||!Number.isFinite(factor)||factor<=0||![horizontal,vertical].every(Number.isFinite))return;
  const keys=axis==='horizontal'?[type.horizontal]:axis==='vertical'?[type.vertical]:axis==='both'?[type.horizontal,type.vertical]:[];
  const anchors={[type.horizontal]:clamp(horizontal,0,1),[type.vertical]:clamp(vertical,0,1)};
  for(const key of keys){
   const scale=clamp(this.scales[key]*factor,.25,64),change=this.scales[key]/scale;
   const range=this.ranges[key],fraction=anchors[key]??.5,span=range.max-range.min,anchor=range.min+span*fraction;
   range.min=anchor-span*change*fraction;range.max=range.min+span*change;
   this.scales[key]=scale;
  }
 }
 pan(type,horizontal,vertical){
  if(!this.ranges||![horizontal,vertical].every(Number.isFinite))return;
  for(const [key,fraction] of [[type.horizontal,-horizontal],[type.vertical,-vertical]]){
   const range=this.ranges[key],base=this.base[key],span=range.max-range.min;
   const shift=span*fraction,limit=(base.max-base.min)*8;
   const center=clamp((range.min+range.max)/2+shift,base.min-limit,base.max+limit);
   range.min=center-span/2;range.max=center+span/2;
  }
 }
}

// Pointer coordinates and drag deltas are expressed in the plot area rather
// than the whole canvas, keeping focal points correct at different sizes.
export function bindGraphNavigation(canvas,{viewport,type,geometry,onChange}){
 const pointers=new Map();
 const position=event=>{const box=canvas.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};};
 const normalized=p=>{const {area}=geometry();return {x:(p.x-area.left)/(area.right-area.left),y:(area.bottom-p.y)/(area.bottom-area.top)};};
 const pan=(from,to)=>{const {area}=geometry();viewport.pan(type,(to.x-from.x)/(area.right-area.left),(from.y-to.y)/(area.bottom-area.top));};
 const midpoint=items=>({x:(items[0].x+items[1].x)/2,y:(items[0].y+items[1].y)/2});
 const axisFor=(event,p)=>{
  if(event.shiftKey)return 'horizontal';if(event.altKey)return 'vertical';
  const {area}=geometry();
  return p.y>area.bottom?'horizontal':p.x<area.left?'vertical':'both';
 };
 canvas.addEventListener('wheel',event=>{
  if(!viewport.ranges)return;event.preventDefault();
  const p=position(event),anchor=normalized(p),unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
  viewport.zoom(type,Math.exp(clamp(-event.deltaY*unit*.002,-1,1)),anchor.x,anchor.y,axisFor(event,p));onChange();
 },{passive:false});
 canvas.addEventListener('pointerdown',event=>{
  if(!viewport.ranges||(event.pointerType==='mouse'&&event.button!==0))return;
  event.preventDefault();canvas.focus({preventScroll:true});
  pointers.set(event.pointerId,position(event));canvas.setPointerCapture(event.pointerId);
 });
 canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!viewport.ranges)return;
  const before=[...pointers.values()],previous=pointers.get(event.pointerId),current=position(event);
  pointers.set(event.pointerId,current);const after=[...pointers.values()];
  if(pointers.size===1)pan(previous,current);
  else if(pointers.size===2){
   const from=midpoint(before),to=midpoint(after),anchor=normalized(from);
   // Tiny perpendicular gaps must not amplify jitter during an axis pinch.
   for(const [key,axis] of [['x','horizontal'],['y','vertical']]){
    const oldGap=Math.abs(before[0][key]-before[1][key]),newGap=Math.abs(after[0][key]-after[1][key]);
    if(oldGap>=24&&newGap>=24)viewport.zoom(type,newGap/oldGap,anchor.x,anchor.y,axis);
   }
   pan(from,to);
  }
  onChange();
 });
 const remove=event=>pointers.delete(event.pointerId);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,remove);
 canvas.addEventListener('blur',()=>pointers.clear());
 canvas.addEventListener('keydown',event=>{
  if(!viewport.ranges)return;
  if(['+','=','-','0','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
   event.preventDefault();
   if(['0','Home'].includes(event.key))viewport.reset();
   else if(['+','=','-'].includes(event.key))viewport.zoom(type,event.key==='-'?1/1.25:1.25,.5,.5,event.shiftKey?'horizontal':event.altKey?'vertical':'both');
   else viewport.pan(type,event.key==='ArrowLeft'?.1:event.key==='ArrowRight'?-.1:0,event.key==='ArrowDown'?.1:event.key==='ArrowUp'?-.1:0);
   onChange();
  }
 });
 return ()=>pointers.clear();
}

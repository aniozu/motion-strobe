// Trace exposed pixel edges, including concavities, holes and diagonal contacts.
// Only collinear vertices are removed; this is the measured mask, not a hull.
export function regionContours(pixels,width,bounds){
 if(!pixels?.length)return [];
 const {x:left,y:top,w,h}=bounds,stride=w+1,inside=new Uint8Array(w*h),edges=new Map();
 for(const p of pixels)inside[(Math.floor(p/width)-top)*w+p%width-left]=1;
 const add=(vertex,direction)=>edges.set(vertex,(edges.get(vertex)||0)|(1<<direction));
 for(const p of pixels){
  const x=p%width-left,y=Math.floor(p/width)-top,q=y*w+x,v=y*stride+x;
  if(y===0||!inside[q-w])add(v,0);
  if(x===w-1||!inside[q+1])add(v+1,1);
  if(y===h-1||!inside[q+w])add(v+stride+1,2);
  if(x===0||!inside[q-1])add(v+stride,3);
 }
 const step=[1,stride,-1,-stride],loops=[];
 while(edges.size){
  const start=edges.keys().next().value,loop=[];let vertex=start,previous=-1;
  do{
   const bits=edges.get(vertex);if(!bits)break;
   // Keep foreground on the right at a corner shared by diagonal pixels.
   const order=previous<0?[0,1,2,3]:[(previous+1)%4,previous,(previous+3)%4,(previous+2)%4];
   const direction=order.find(d=>bits&(1<<d));
   if(direction!==previous)loop.push(vertex%stride+left,Math.floor(vertex/stride)+top);
   const remaining=bits&~(1<<direction);
   if(remaining)edges.set(vertex,remaining);else edges.delete(vertex);
   vertex+=step[direction];previous=direction;
  }while(vertex!==start);
  if(vertex===start&&loop.length>=6)loops.push(loop);
 }
 return loops;
}

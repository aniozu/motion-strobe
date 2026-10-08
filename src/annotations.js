import {formatSeconds} from './format.js';
import {calibrationBasis} from './calibration.js';

// This mask is shared by photo and video. Frame marks never change the composite.
export function foregroundMask(background,frame,sensitivity,width){
 let drift=0,count=0;
 for(let i=0;i<frame.length;i+=64){drift+=(frame[i]-background[i]+frame[i+1]-background[i+1]+frame[i+2]-background[i+2])/3;count++;}
 drift/=Math.max(1,count);
 const pixels=new Uint8ClampedArray(frame.length);
 for(let i=0;i<frame.length;i+=4){
  const delta=Math.max(Math.abs(frame[i]-background[i]-drift),Math.abs(frame[i+1]-background[i+1]-drift),Math.abs(frame[i+2]-background[i+2]-drift));
  if(delta>sensitivity)pixels.set(frame.subarray(i,i+4),i);
 }
 return {pixels};
}
export function mergeLayer(out,layer){for(let i=0;i<out.length;i+=4)if(layer[i+3])out.set(layer.subarray(i,i+4),i);}
export function normalizeGuideAngle(value){
 let angle=Number(value);if(!Number.isFinite(angle))return 0;
 angle%=180;if(angle>90)angle-=180;if(angle< -90)angle+=180;
 return Math.round(angle*10)/10||0;
}
export function gridOptions(grid={}){return {enabled:!!grid.enabled,vertical:grid.vertical!==false,horizontal:grid.horizontal!==false,angle:normalizeGuideAngle(grid.angle),color:/^#[0-9a-f]{6}$/i.test(grid.color)?grid.color:'#ffffff',thickness:Math.max(.5,Math.min(4,Number(grid.thickness)||1)),opacity:Math.max(.05,Math.min(1,Number(grid.opacity)||.25)),points:grid.points!==false,pointScale:Math.max(.2,Math.min(5,Number(grid.pointScale)||1)),object1:grid.object1!==false,object2:grid.object2!==false};}
// Clip an infinite guide to the photo, without rotating the photo or its coordinates.
export function clippedGuideLine(point,direction,width,height){
 let first=-Infinity,last=Infinity;
 for(const [origin,delta,limit] of [[point.x,direction.x,width],[point.y,direction.y,height]]){
  if(Math.abs(delta)<1e-10){if(origin<0||origin>limit)return null;continue;}
  const a=-origin/delta,b=(limit-origin)/delta;
  first=Math.max(first,Math.min(a,b));last=Math.min(last,Math.max(a,b));
 }
 if(first>last||!Number.isFinite(first)||!Number.isFinite(last))return null;
 const at=t=>({x:Math.max(0,Math.min(width,point.x+direction.x*t)),y:Math.max(0,Math.min(height,point.y+direction.y*t))});
 return [at(first),at(last)];
}
export const measuredCenters=centers=>centers.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&!['missing','uncertain','unset','skipped'].includes(p.confidence));
export function drawTimeLabel(ctx,label,width,height,used=[]){
 const fontSize=Math.max(12,Math.round(width/60));ctx.font=`600 ${fontSize}px sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#10202d';ctx.fillStyle='#fff';
 const text=`${label.approximate?'≈':''}${formatSeconds(label.time)} s`,tw=ctx.measureText(text).width;
 let best,bestCost=Infinity;
 for(const [dx,dy] of [[8,-8],[8,fontSize+8],[-tw-8,-8],[-tw-8,fontSize+8],[8,-fontSize-16],[8,fontSize*2+16]]){
  const x=Math.max(5,Math.min(width-tw-5,label.x+dx)),y=Math.max(fontSize+4,Math.min(height-5,label.y+dy)),rect={x,y:y-fontSize,w:tw,h:fontSize+4};
  const cost=used.reduce((sum,r)=>sum+Math.max(0,Math.min(rect.x+rect.w,r.x+r.w)-Math.max(rect.x,r.x))*Math.max(0,Math.min(rect.y+rect.h,r.y+r.h)-Math.max(rect.y,r.y)),0);
  if(cost<bestCost){bestCost=cost;best={x,y,rect};}if(!cost)break;
 }
 used.push(best.rect);ctx.strokeText(text,best.x,best.y);ctx.fillText(text,best.x,best.y);
}
export function drawAnnotations(ctx,centers,width,height,settings){
 const points=measuredCenters(centers),grid=gridOptions(settings.grid);
 ctx.save();
 if(grid.enabled){
  const guidePoints=points.filter(p=>(p.objectId??0)===1?grid.object2:grid.object1);
  ctx.strokeStyle=grid.color;ctx.lineWidth=grid.thickness;ctx.globalAlpha=grid.opacity;ctx.beginPath();
  const xs=new Set(),ys=new Set(),radians=grid.angle*Math.PI/180;
  const basis=calibrationBasis(settings.calibration,{width,height});
  const horizontal=basis?.x||{x:Math.cos(radians),y:Math.sin(radians)},vertical=basis?.y||{x:-Math.sin(radians),y:Math.cos(radians)};
  const line=(p,direction)=>{const segment=clippedGuideLine(p,direction,width,height);if(segment){ctx.moveTo(segment[0].x,segment[0].y);ctx.lineTo(segment[1].x,segment[1].y);}};
  for(const p of guidePoints){
   const x=Math.round(p.x*horizontal.x+p.y*horizontal.y),y=Math.round(p.x*vertical.x+p.y*vertical.y);
   if(grid.vertical&&!xs.has(x)){xs.add(x);line(p,vertical);}
   if(grid.horizontal&&!ys.has(y)){ys.add(y);line(p,horizontal);}
  }
  ctx.stroke();ctx.globalAlpha=1;
  if(grid.points)for(const p of guidePoints){ctx.beginPath();ctx.arc(p.x,p.y,3*grid.pointScale,0,Math.PI*2);ctx.fillStyle=grid.color;ctx.strokeStyle='#10202d';ctx.lineWidth=1.5*grid.pointScale;ctx.fill();ctx.stroke();}
 }
 if(settings.labels){const used=[];for(const p of points)drawTimeLabel(ctx,p,width,height,used);}
 ctx.restore();
}

export function drawCornerBadge(ctx,width,height,label){
 const fontSize=Math.max(18,Math.min(30,Math.round(width*.033))),padding=Math.round(fontSize*.55);
 ctx.save();ctx.font=`700 ${fontSize}px system-ui, sans-serif`;const badgeWidth=Math.ceil(ctx.measureText(label).width+padding*2),badgeHeight=fontSize+padding;
 const x=width-badgeWidth-padding,y=padding;ctx.fillStyle='rgba(12,24,36,.78)';ctx.fillRect(x,y,badgeWidth,badgeHeight);
 ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.fillText(label,x+padding,y+badgeHeight/2);ctx.restore();
}

import {measuredCenters,normalizeGuideAngle} from './annotations.js';

// Fit one object's measured trajectory with a first-degree least-squares model.
// Use x(y) for steep paths so vertical motion remains well conditioned.
export function fitMotionAngle(centers,objectId=0){
 const points=measuredCenters(centers).filter(point=>(point.objectId??0)===objectId);
 if(points.length<2)return null;
 const mean=points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length}),{x:0,y:0});
 let xx=0,yy=0,xy=0;
 for(const p of points){const x=p.x-mean.x,y=p.y-mean.y;xx+=x*x;yy+=y*y;xy+=x*y;}
 if(Math.max(xx,yy)<1e-8)return null;
 const radians=xx>=yy?Math.atan2(xy,xx):Math.atan2(yy,xy);
 return {angle:normalizeGuideAngle(radians*180/Math.PI),count:points.length};
}

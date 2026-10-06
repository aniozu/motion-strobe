const measured=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&['manual','auto'].includes(p.confidence);
export function calibrationBasis(calibration,size){
 if(!calibration||!size?.width||!size?.height)return null;
 const {a,b,length,axis='x',width,height}=calibration;
 if(!a||!b||![a.x,a.y,b.x,b.y,length,width,height].every(Number.isFinite)||length<=0||width<=0||height<=0)return null;
 const p={x:a.x*size.width/width,y:a.y*size.height/height},q={x:b.x*size.width/width,y:b.y*size.height/height};
 const dx=q.x-p.x,dy=q.y-p.y,distance=Math.hypot(dx,dy);if(distance<1)return null;
 // The segment sets an axis line, regardless of which endpoint was chosen first.
 let x=axis==='y'?{x:-dy/distance,y:dx/distance}:{x:dx/distance,y:dy/distance};
 if(x.x< -1e-10||(Math.abs(x.x)<1e-10&&x.y>0))x={x:-x.x,y:-x.y};
 const y={x:x.y,y:-x.x};
 return {a:p,b:q,x,y,distance,metersPerPixel:length/distance,angle:Math.atan2(x.y,x.x)*180/Math.PI,length};
}
export function withCalibrationOrigin(calibration,centers,size){
 if(!calibration)return null;const origin=centers[0];
 return {...calibration,origin:measured(origin)?{x:origin.x,y:origin.y,index:origin.index,width:size.width,height:size.height}:null};
}
export function coordinateOrigin(data){
 const origin=data.originCenter===undefined?data.centers?.[0]:data.originCenter;
 return measured(origin)?origin:null;
}
export function physicalCoordinates(point,origin,basis){
 if(!origin||!measured(point))return null;
 const dx=point.x-origin.x,dy=point.y-origin.y;
 return basis?{x:(dx*basis.x.x+dy*basis.x.y)*basis.metersPerPixel,y:(dx*basis.y.x+dy*basis.y.y)*basis.metersPerPixel}:{x:dx,y:-dy};
}

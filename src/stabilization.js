// Background registration, independent of video decoding and object tracking.
// Matrices map coordinates in the original camera frame to the reference frame.
// Keep image estimation small; apply the resulting transform at output resolution.
export const identityTransform=()=>[1,0,0,1,0,0];
export function transformPoint(m,x,y){return {x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]};}
export function invertTransform(m){const d=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(d)||Math.abs(d)<1e-8)return null;return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
export function combineTransforms(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function scaledTransform(m,sx,sy=sx){return [m[0],m[1]*sy/sx,m[2]*sx/sy,m[3],m[4]*sx,m[5]*sy];}

function sample(data,w,h,x,y){
 if(x<0||y<0||x>=w-1||y>=h-1)return NaN;
 const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,p=iy*w+ix;
 return (data[p]*(1-u)+data[p+1]*u)*(1-v)+(data[p+w]*(1-u)+data[p+w+1]*u)*v;
}
function level(gray,width,height){
 const gx=new Float32Array(gray.length),gy=new Float32Array(gray.length);
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const p=y*width+x;gx[p]=(gray[p+1]-gray[p-1])*.5;gy[p]=(gray[p+width]-gray[p-width])*.5;}
 return {gray,gx,gy,width,height};
}
export function registrationImage(pixels,width,height,maxDimension=384){
 const factor=Math.min(1,maxDimension/Math.max(width,height)),w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor)),gray=new Float32Array(w*h),sx=width/w,sy=height/h;
 // Average a small source footprint instead of nearest-neighbor sampling.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let sum=0,n=0;const x0=Math.floor(x*sx),x1=Math.min(width,Math.max(x0+1,Math.floor((x+1)*sx))),y0=Math.floor(y*sy),y1=Math.min(height,Math.max(y0+1,Math.floor((y+1)*sy)));
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const p=(yy*width+xx)*4;sum+=pixels[p]*.299+pixels[p+1]*.587+pixels[p+2]*.114;n++;}
  gray[y*w+x]=sum/n;
 }
 const pyramid=[level(gray,w,h)];
 while(pyramid.length<4&&Math.min(pyramid.at(-1).width,pyramid.at(-1).height)>=48){
  const prev=pyramid.at(-1),nw=Math.floor(prev.width/2),nh=Math.floor(prev.height/2),small=new Float32Array(nw*nh);
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const p=y*2*prev.width+x*2;small[y*nw+x]=(prev.gray[p]+prev.gray[p+1]+prev.gray[p+prev.width]+prev.gray[p+prev.width+1])*.25;}
  pyramid.push(level(small,nw,nh));
 }
 return {pyramid,width:w,height:h,sourceWidth:width,sourceHeight:height,features:null};
}
function integral(data,w,h){const result=new Float64Array((w+1)*(h+1));for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){sum+=data[y*w+x];result[(y+1)*(w+1)+x+1]=sum+result[y*(w+1)+x+1];}}return result;}
function box(data,w,x,y,r){const stride=w+1,x0=x-r,y0=y-r,x1=x+r+1,y1=y+r+1;return data[y1*stride+x1]-data[y0*stride+x1]-data[y1*stride+x0]+data[y0*stride+x0];}
function features(image){
 if(image.features)return image.features;
 const {gx,gy,width:w,height:h}=image.pyramid[0],xx=new Float32Array(w*h),yy=new Float32Array(w*h),xy=new Float32Array(w*h);
 for(let p=0;p<xx.length;p++){xx[p]=gx[p]*gx[p];yy[p]=gy[p]*gy[p];xy[p]=gx[p]*gy[p];}
 const a=integral(xx,w,h),b=integral(xy,w,h),c=integral(yy,w,h),scores=new Float32Array(w*h);let maximum=0;
 for(let y=10;y<h-10;y++)for(let x=10;x<w-10;x++){const aa=box(a,w,x,y,2),bb=box(b,w,x,y,2),cc=box(c,w,x,y,2),score=(aa+cc-Math.hypot(aa-cc,2*bb))*.5;scores[y*w+x]=score;maximum=Math.max(maximum,score);}
 const points=[],groups=[],threshold=Math.max(12,maximum*.0015),cell=Math.max(18,Math.round(w/12));
 for(let y0=10;y0<h-10;y0+=cell)for(let x0=10;x0<w-10;x0+=cell){
  const candidates=[];for(let y=y0;y<Math.min(h-10,y0+cell);y++)for(let x=x0;x<Math.min(w-10,x0+cell);x++){const score=scores[y*w+x];if(score<threshold)continue;let peak=true;for(let dy=-2;dy<=2&&peak;dy++)for(let dx=-2;dx<=2;dx++)if(scores[(y+dy)*w+x+dx]>score){peak=false;break;}if(peak)candidates.push({x,y,score});}
  candidates.sort((a,b)=>b.score-a.score);const kept=[];for(const p of candidates){if(kept.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<7))continue;kept.push(p);if(kept.length===4)break;}groups.push(kept);
 }
 for(let rank=0;rank<4;rank++)for(const group of groups)if(group[rank]&&points.length<192)points.push(group[rank]);
 return image.features=points;
}
function trackPoint(reference,current,p,guess=p){
 let x=guess.x,y=guess.y,used=false;
 const last=Math.min(reference.pyramid.length,current.pyramid.length)-1;
 for(let l=last;l>=0;l--){
  const ref=reference.pyramid[l],target=current.pyramid[l],scale=2**l,rx=p.x/scale,ry=p.y/scale;let tx=x/scale,ty=y/scale;const r=4;
  if(rx<r+1||ry<r+1||rx>=ref.width-r-2||ry>=ref.height-r-2)continue;
  const patch=[],grad=[];let aa=0,bb=0,cc=0,refSum=0,gxSum=0,gySum=0;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
   const rv=sample(ref.gray,ref.width,ref.height,rx+dx,ry+dy),gx=sample(ref.gx,ref.width,ref.height,rx+dx,ry+dy),gy=sample(ref.gy,ref.width,ref.height,rx+dx,ry+dy);
   patch.push(rv);grad.push(gx,gy);aa+=gx*gx;bb+=gx*gy;cc+=gy*gy;refSum+=rv;gxSum+=gx;gySum+=gy;
  }
  const count=patch.length;aa-=gxSum*gxSum/count;bb-=gxSum*gySum/count;cc-=gySum*gySum/count;const determinant=aa*cc-bb*bb;if(determinant<1e-3||Math.min(aa,cc)<2)continue;
  for(let iteration=0;iteration<12;iteration++){
   if(tx<r+1||ty<r+1||tx>=target.width-r-2||ty>=target.height-r-2)break;
   let bx=0,by=0,residualSum=0,i=0;
   for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++,i++){const error=patch[i]-sample(target.gray,target.width,target.height,tx+dx,ty+dy);bx+=grad[i*2]*error;by+=grad[i*2+1]*error;residualSum+=error;}
   bx-=gxSum*residualSum/count;by-=gySum*residualSum/count;const dx=(cc*bx-bb*by)/determinant,dy=(aa*by-bb*bx)/determinant;
   if(!Number.isFinite(dx+dy)||Math.hypot(dx,dy)>5)break;tx+=dx;ty+=dy;used=true;if(dx*dx+dy*dy<.0004)break;
  }
  x=tx*scale;y=ty*scale;
 }
 if(!used||x<6||y<6||x>=current.width-7||y>=current.height-7)return null;
 // Correlation rejects points that landed on unrelated/moving image content.
 const ref=reference.pyramid[0],target=current.pyramid[0];let a=0,b=0,aa=0,bb=0,ab=0,n=0;
 for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const u=sample(ref.gray,ref.width,ref.height,p.x+dx,p.y+dy),v=sample(target.gray,target.width,target.height,x+dx,y+dy);a+=u;b+=v;aa+=u*u;bb+=v*v;ab+=u*v;n++;}
 const corr=(ab-a*b/n)/Math.sqrt(Math.max(1e-9,(aa-a*a/n)*(bb-b*b/n)));if(corr<.78)return null;
 return {x,y,corr};
}
function fitSimilarity(matches){
 let px=0,py=0,qx=0,qy=0;for(const {p,q} of matches){px+=p.x;py+=p.y;qx+=q.x;qy+=q.y;}const n=matches.length;px/=n;py/=n;qx/=n;qy/=n;
 let den=0,a=0,b=0;for(const {p,q} of matches){const x=p.x-px,y=p.y-py,u=q.x-qx,v=q.y-qy;den+=x*x+y*y;a+=x*u+y*v;b+=x*v-y*u;}
 if(den<1)return null;a/=den;b/=den;return [a,b,-b,a,qx-a*px+b*py,qy-b*px-a*py];
}
// A limited affine fallback handles mild shear and unequal horizontal/vertical
// scale from a changing camera direction. It needs more support than similarity.
function fitAffine(matches){
 let px=0,py=0,qx=0,qy=0;const n=matches.length;
 for(const {p,q} of matches){px+=p.x;py+=p.y;qx+=q.x;qy+=q.y;}px/=n;py/=n;qx/=n;qy/=n;
 let xx=0,xy=0,yy=0,xu=0,yu=0,xv=0,yv=0;
 for(const {p,q} of matches){const x=p.x-px,y=p.y-py,u=q.x-qx,v=q.y-qy;xx+=x*x;xy+=x*y;yy+=y*y;xu+=x*u;yu+=y*u;xv+=x*v;yv+=y*v;}
 const det=xx*yy-xy*xy;if(det<1e-5)return null;
 const a=(yy*xu-xy*yu)/det,c=(xx*yu-xy*xu)/det,b=(yy*xv-xy*yv)/det,d=(xx*yv-xy*xv)/det;
 return [a,b,c,d,qx-a*px-c*py,qy-b*px-d*py];
}
function affinePlausible(m,w,h){
 const [a,b,c,d]=m,det=a*d-b*c;if(det<=0)return false;
 const trace=a*a+b*b+c*c+d*d,disc=Math.sqrt(Math.max(0,trace*trace-4*det*det)),lo=Math.sqrt((trace-disc)/2),hi=Math.sqrt((trace+disc)/2),angle=Math.abs(Math.atan2(b-c,a+d)),center=transformPoint(m,w/2,h/2);
 return lo>.85&&hi<1.15&&hi/lo<1.15&&angle<.23&&Math.hypot(center.x-w/2,center.y-h/2)<Math.max(w,h)*.35;
}
// A seed is only a search initializer; re-tracked points must satisfy the final
// distributed-support check. Static surfaces at different depths can split the
// matches into motion groups, so the dominant group need not be an absolute majority.
function affineConsensus(matches,w,h,{seedOnly=false}={}){
 if(matches.length<14)return null;let best=[],seed=32847;
 const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
 for(let k=0;k<400;k++){
  const triple=[matches[random(matches.length)],matches[random(matches.length)],matches[random(matches.length)]];
  const area=Math.abs((triple[1].p.x-triple[0].p.x)*(triple[2].p.y-triple[0].p.y)-(triple[2].p.x-triple[0].p.x)*(triple[1].p.y-triple[0].p.y));if(area<w*h*.005)continue;
  const m=fitAffine(triple);if(!m||!affinePlausible(m,w,h))continue;
  const ids=matches.filter(({p,q})=>{const r=transformPoint(m,p.x,p.y);return Math.hypot(r.x-q.x,r.y-q.y)<1.25;});if(ids.length>best.length)best=ids;
 }
 if(best.length<14||best.length/matches.length<(seedOnly?.3:.4))return null;
 let m=fitAffine(best);for(let i=0;i<2;i++){best=matches.filter(({p,q})=>{const r=transformPoint(m,p.x,p.y);return Math.hypot(r.x-q.x,r.y-q.y)<1.15;});if(best.length<14)return null;m=fitAffine(best);}
 const xs=best.map(v=>v.p.x),ys=best.map(v=>v.p.y),cells=new Set(best.map(v=>Math.floor(v.p.x/w*4)+4*Math.floor(v.p.y/h*3)));
 if(!affinePlausible(m,w,h)||Math.max(...xs)-Math.min(...xs)<w*.35||Math.max(...ys)-Math.min(...ys)<h*.25||cells.size<4)return null;
 let error=0;for(const {p,q} of best){const r=transformPoint(m,p.x,p.y);error+=(r.x-q.x)**2+(r.y-q.y)**2;}
 return {forward:m,inliers:best.length,matches:matches.length,residual:Math.sqrt(error/best.length),coverage:cells.size/12,model:'affine'};
}
function plausible(m,w,h){const scale=Math.hypot(m[0],m[1]),angle=Math.abs(Math.atan2(m[1],m[0])),c=transformPoint(m,w/2,h/2);return scale>.85&&scale<1.15&&angle<.23&&Math.hypot(c.x-w/2,c.y-h/2)<Math.max(w,h)*.35;}
function consensus(matches,w,h,{seedOnly=false}={}){
 const minimum=seedOnly?4:6;if(matches.length<minimum)return null;
 let best=[];let seed=123456789;
 const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
 for(let k=0;k<160;k++){
  const i=random(matches.length),j=random(matches.length);if(i===j||Math.hypot(matches[i].p.x-matches[j].p.x,matches[i].p.y-matches[j].p.y)<Math.min(w,h)*.18)continue;
  const m=fitSimilarity([matches[i],matches[j]]);if(!m||!plausible(m,w,h))continue;
  const inliers=matches.filter(({p,q})=>{const r=transformPoint(m,p.x,p.y);return Math.hypot(r.x-q.x,r.y-q.y)<1.25;});if(inliers.length>best.length)best=inliers;
 }
 if(best.length<minimum||best.length/matches.length<.5)return null;
 let m=fitSimilarity(best);
 for(let iteration=0;iteration<2;iteration++){best=matches.filter(({p,q})=>{const r=transformPoint(m,p.x,p.y);return Math.hypot(r.x-q.x,r.y-q.y)<1.15;});if(best.length<minimum)return null;m=fitSimilarity(best);}
 const xs=best.map(v=>v.p.x),ys=best.map(v=>v.p.y),spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys),cells=new Set(best.map(v=>Math.floor(v.p.x/w*4)+4*Math.floor(v.p.y/h*3)));
 if(!plausible(m,w,h)||spanX<w*.35||spanY<h*(seedOnly?.22:.3)||cells.size<(seedOnly?3:4))return null;
 let error=0;for(const {p,q} of best){const r=transformPoint(m,p.x,p.y);error+=(r.x-q.x)**2+(r.y-q.y)**2;}
 return {forward:m,inliers:best.length,matches:matches.length,residual:Math.sqrt(error/best.length),coverage:cells.size/12};
}
// BRIEF is only a recovery initializer for larger camera jumps. The final motion
// always comes from subpixel LK matches, forward/backward checks and consensus.
const descriptorPairs=(()=>{let s=739391;const next=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s;};return Array.from({length:256},()=>[next()%19-9,next()%19-9,next()%19-9,next()%19-9]);})();
function descriptors(image){const {gray,width:w}=image.pyramid[0];return features(image).map(p=>{const bits=new Uint32Array(8);for(let n=0;n<256;n++){const [a,b,c,d]=descriptorPairs[n];if(gray[(p.y+b)*w+p.x+a]<gray[(p.y+d)*w+p.x+c])bits[n>>>5]|=1<<(n&31);}return {p,bits};});}
function popcount(x){x-=x>>>1&0x55555555;x=(x&0x33333333)+(x>>>2&0x33333333);return Math.imul((x+(x>>>4)&0x0f0f0f0f),0x01010101)>>>24;}
function descriptorGuesses(ref,current){
 const a=descriptors(ref),b=descriptors(current),result=[];
 for(const p of a){let best=257,second=257,index=-1;for(let n=0;n<b.length;n++){let distance=0;for(let j=0;j<8;j++)distance+=popcount(p.bits[j]^b[n].bits[j]);if(distance<best){second=best;best=distance;index=n;}else if(distance<second)second=distance;}
  if(best<65&&best<second*.8)result.push({p:p.p,q:b[index].p});
 }
 return result;
}
function solveSystem(matrix,vector){
 const n=vector.length,rows=matrix.map((row,i)=>[...row,vector[i]]);
 for(let col=0;col<n;col++){let pivot=col;for(let i=col+1;i<n;i++)if(Math.abs(rows[i][col])>Math.abs(rows[pivot][col]))pivot=i;if(Math.abs(rows[pivot][col])<1e-7)return null;[rows[col],rows[pivot]]=[rows[pivot],rows[col]];const d=rows[col][col];for(let j=col;j<=n;j++)rows[col][j]/=d;for(let i=0;i<n;i++)if(i!==col){const f=rows[i][col];for(let j=col;j<=n;j++)rows[i][j]-=f*rows[col][j];}}
 return rows.map(row=>row[n]);
}
function refineAlignment(reference,current,initial){
 const ref=reference.pyramid[0],target=current.pyramid[0],w=ref.width,h=ref.height,cx=w/2,cy=h/2,unit=Math.max(w,h),points=[];
 // Sample textured pixels across the image, not just the few strongest corners.
 // Robust residual weights suppress moving objects and new/occluded content.
 for(let y=6;y<h-6;y+=2)for(let x=6;x<w-6;x+=2){const p=y*w+x;if(ref.gx[p]**2+ref.gy[p]**2>9)points.push({x,y,value:ref.gray[p]});}
 if(points.length<80)return initial;
 let m=[...initial],bias=0;
 for(let iteration=0;iteration<10;iteration++){
  const normal=Array.from({length:5},()=>Array(5).fill(0)),rhs=Array(5).fill(0);let count=0;
  for(const p of points){
   const q=transformPoint(m,p.x,p.y);if(q.x<2||q.y<2||q.x>=w-3||q.y>=h-3)continue;
   const value=sample(target.gray,w,h,q.x,q.y),residual=p.value-value-bias;if(Math.abs(residual)>28)continue;
   const weight=(1-(residual/28)**2)**2,gx=sample(target.gx,w,h,q.x,q.y),gy=sample(target.gy,w,h,q.x,q.y),x=(p.x-cx)/unit,y=(p.y-cy)/unit,j=[gx*x+gy*y,-gx*y+gy*x,gx,gy,1];
   for(let i=0;i<5;i++){rhs[i]+=weight*j[i]*residual;for(let k=0;k<5;k++)normal[i][k]+=weight*j[i]*j[k];}count++;
  }
  if(count<60)return initial;const delta=solveSystem(normal,rhs);if(!delta||Math.hypot(delta[2],delta[3])>2||Math.hypot(delta[0],delta[1])>2)return initial;
  const a=delta[0]/unit,b=delta[1]/unit;m[0]+=a;m[3]+=a;m[1]+=b;m[2]-=b;m[4]+=delta[2]-a*cx+b*cy;m[5]+=delta[3]-b*cx-a*cy;bias+=delta[4];
  if(Math.hypot(delta[0],delta[1],delta[2],delta[3])<.003)break;
 }
 if(!plausible(m,w,h))return initial;
 for(const [x,y] of [[0,0],[w,0],[0,h],[w,h]]){const a=transformPoint(initial,x,y),b=transformPoint(m,x,y);if(Math.hypot(a.x-b.x,a.y-b.y)>2)return initial;}
 return m;
}
export function estimateCameraTransform(reference,current,{initial=null}={}){
 if(reference.width!==current.width||reference.height!==current.height)return null;
 const points=features(reference);if(points.length<12)return null;
 const collect=(points,guessFor)=>{const matches=[];for(const p of points){const q=trackPoint(reference,current,p,guessFor(p));if(!q)continue;const back=trackPoint(current,reference,q,p);if(back&&Math.hypot(back.x-p.x,back.y-p.y)<.8)matches.push({p,q});}return matches;};
 let matches=collect(points,p=>initial?transformPoint(initial,p.x,p.y):p),fit=consensus(matches,reference.width,reference.height);
 if(!fit||fit.inliers<Math.max(20,points.length*.35)){
  const guesses=descriptorGuesses(reference,current),recovered=collect(guesses.map(v=>v.p),p=>guesses.find(v=>v.p===p).q),candidate=consensus(recovered,reference.width,reference.height);
  if(candidate&&(!fit||candidate.inliers>fit.inliers))fit=candidate;
  if(!fit){
   const unique=new Map(matches.map(v=>[v.p,v]));for(const v of recovered)if(!unique.has(v.p)||v.q.corr>unique.get(v.p).q.corr)unique.set(v.p,v);
   const seed=consensus([...unique.values()],reference.width,reference.height,{seedOnly:true});
   if(seed){const corrected=refineAlignment(reference,current,seed.forward);fit=consensus(collect(points,p=>transformPoint(corrected,p.x,p.y)),reference.width,reference.height);}
  }
 }
 if(!fit){
  const guesses=descriptorGuesses(reference,current),recovered=collect(guesses.map(v=>v.p),p=>guesses.find(v=>v.p===p).q),unique=new Map(matches.map(v=>[v.p,v]));for(const v of recovered)if(!unique.has(v.p)||v.q.corr>unique.get(v.p).q.corr)unique.set(v.p,v);
  for(const seeds of [matches,[...unique.values()],guesses]){
   const affine=affineConsensus(seeds,reference.width,reference.height,{seedOnly:true});
   if(affine){const recovered=collect(points,p=>transformPoint(affine.forward,p.x,p.y));fit=affineConsensus(recovered,reference.width,reference.height);if(fit)break;}
  }
 }
 if(fit&&!fit.model&&(fit.inliers/matches.length<.7||fit.residual>.45)){const candidate=affineConsensus(matches,reference.width,reference.height);if(candidate){const [a,b,c,d]=candidate.forward,deformation=Math.hypot(a-d,b+c)/Math.max(.1,Math.hypot(a,b));if(deformation>.015&&candidate.inliers>fit.inliers*1.15)fit=candidate;}}
 if(!fit)return null;
 // Reacquire features using the global camera motion. This avoids drift and
 // improves the background support when individual initial matches were poor.
 const refined=(fit.model==='affine'?affineConsensus:consensus)(collect(points,p=>transformPoint(fit.forward,p.x,p.y)),reference.width,reference.height);if(refined&&refined.inliers>=fit.inliers*.85)fit=refined;
 if(fit.model!=='affine'&&(fit.inliers<20||fit.residual>.3))fit.forward=refineAlignment(reference,current,fit.forward);
 const sx=reference.sourceWidth/reference.width,sy=reference.sourceHeight/reference.height;
 return {...fit,matrix:scaledTransform(invertTransform(fit.forward),sx,sy),residualPx:fit.residual*Math.max(sx,sy)};
}

// Interpolate camera poses, not pixels. Polar decomposition keeps rotation
// separate from stretch/shear; positive stretch stays invertible between anchors.
export function interpolateCameraTransform(left,right,fraction,width,height){
 const t=Math.max(0,Math.min(1,fraction));if(t===0)return [...left];if(t===1)return [...right];
 const decompose=m=>{const angle=Math.atan2(m[1]-m[2],m[0]+m[3]),c=Math.cos(angle),s=Math.sin(angle);return {angle,xx:c*m[0]+s*m[1],yy:-s*m[2]+c*m[3],xy:((c*m[2]+s*m[3])+(-s*m[0]+c*m[1]))*.5,center:transformPoint(m,width/2,height/2)};};
 const l=decompose(left),r=decompose(right),mix=(a,b)=>a+(b-a)*t;let angle=r.angle-l.angle;
 while(angle>Math.PI)angle-=2*Math.PI;while(angle<-Math.PI)angle+=2*Math.PI;
 angle=l.angle+angle*t;const co=Math.cos(angle),si=Math.sin(angle),xx=mix(l.xx,r.xx),yy=mix(l.yy,r.yy),xy=mix(l.xy,r.xy),a=co*xx-si*xy,b=si*xx+co*xy,c=co*xy-si*yy,d=si*xy+co*yy;
 return [a,b,c,d,mix(l.center.x,r.center.x)-a*width/2-c*height/2,mix(l.center.y,r.center.y)-b*width/2-d*height/2];
}

// Only independently matched frames belong in measured. Estimated poses never
// become anchors, including when the same video is exported multiple times.
export function cameraTransformFromNeighbors(measured,index,{width,height,timeForIndex=i=>i}={}){
 if(measured.has(index))return {matrix:measured.get(index),mode:'measured'};
 const keys=[...measured.keys()].sort((a,b)=>a-b);let before,after;
 for(const key of keys){if(key<index)before=key;else{after=key;break;}}
 if(before===undefined&&after===undefined)return null;
 if(before===undefined||after===undefined)return {matrix:[...measured.get(before??after)],mode:'held'};
 const t0=timeForIndex(before),t1=timeForIndex(after),time=timeForIndex(index),fraction=Number.isFinite(t0+t1+time)&&t1>t0?(time-t0)/(t1-t0):(index-before)/(after-before);
 const forward=interpolateCameraTransform(invertTransform(measured.get(before)),invertTransform(measured.get(after)),fraction,width,height);
 return {matrix:invertTransform(forward),mode:'interpolated'};
}

export async function registerFrames({indices,getFrame,width,height,referenceIndex=indices[0],fallbackReferenceIndex=null,matchingReferenceIndex=referenceIndex,timeForIndex=i=>i,cancelled=()=>false,yieldTurn=()=>new Promise(r=>setTimeout(r,0)),onProgress=()=>{}}){
 const anchorPixels=getFrame(referenceIndex);if(!anchorPixels)throw Error('補正の基準コマが見つかりません。写真を作り直してください。');
 const ordered=[...new Set([...indices,referenceIndex])].sort((a,b)=>a-b),start=performance.now();let progress=0;
 const report=p=>{progress=Math.max(progress,p);onProgress(progress);};
 const collect=async(candidate,base,span)=>{
  const pixels=getFrame(candidate);if(!pixels)throw Error('補正の基準コマが見つかりません。写真を作り直してください。');
  const reference=registrationImage(pixels,width,height);
  if(features(reference).length<12){const error=Error('背景の模様が少ないため、カメラの動きを補正できません。「カメラの動きを補正」をオフにしてお試しください。');error.name='StabilizationError';throw error;}
  const measured=new Map(),stats=[],missing=[];let previous=null;
  for(let n=0;n<ordered.length;n++){
   if(cancelled())return null;const index=ordered[n];let result;
   if(index===candidate)result={matrix:identityTransform(),forward:identityTransform(),residualPx:0,inliers:features(reference).length};
   else{const image=registrationImage(getFrame(index),width,height);result=estimateCameraTransform(reference,image,{initial:previous?.forward});}
   if(result){measured.set(index,result.matrix);previous=result;stats.push(result);}else missing.push(index);
   report(base+(n+1)/ordered.length*span);await yieldTurn();
  }
  return {reference,candidate,measured,stats,missing};
 };
 let selected,firstError;
 try{selected=await collect(matchingReferenceIndex,0,.45);}catch(error){if(error.name!=='StabilizationError')throw error;firstError=error;}
 if(cancelled())return null;
 if((!selected||selected.missing.length)&&fallbackReferenceIndex!=null&&fallbackReferenceIndex!==matchingReferenceIndex){
  let alternate;try{alternate=await collect(fallbackReferenceIndex,.45,.4);}catch(error){if(error.name!=='StabilizationError')throw error;if(!selected)throw error;}
  if(cancelled())return null;
  if(alternate&&(!selected||alternate.missing.length<selected.missing.length))selected=alternate;
 }
 if(!selected)throw firstError;
 const {reference,candidate,measured,stats,missing}=selected,transforms=new Map(measured),estimatedFrames=new Map();let recoveredFrames=0;
 for(let n=0;n<missing.length;n++){
  if(cancelled())return null;const index=missing[n],predicted=cameraTransformFromNeighbors(measured,index,{width,height,timeForIndex});
  if(!predicted)throw Error('補正の基準コマが見つかりません。写真を作り直してください。');
  const initial=scaledTransform(invertTransform(predicted.matrix),reference.width/width,reference.height/height),result=estimateCameraTransform(reference,registrationImage(getFrame(index),width,height),{initial});
  if(result){measured.set(index,result.matrix);transforms.set(index,result.matrix);stats.push(result);recoveredFrames++;}
  else{transforms.set(index,predicted.matrix);estimatedFrames.set(index,predicted.mode);}
  report(.85+(n+1)/Math.max(1,missing.length)*.15);await yieldTurn();
 }
 if(cancelled())return null;
 // A later successful re-match can provide a closer measured anchor for an
 // earlier missing frame. Recompute all estimates before any pixels are warped.
 for(const index of estimatedFrames.keys()){const predicted=cameraTransformFromNeighbors(measured,index,{width,height,timeForIndex});transforms.set(index,predicted.matrix);estimatedFrames.set(index,predicted.mode);}
 // One constant conversion preserves the first-frame coordinate convention.
 // Every measured pose still matches one fixed template, never a chain of frames.
 const templateToOutput=candidate===referenceIndex?identityTransform():invertTransform(transforms.get(referenceIndex));
 if(candidate!==referenceIndex){
  for(const [index,matrix] of transforms)transforms.set(index,index===referenceIndex?identityTransform():combineTransforms(templateToOutput,matrix));
  for(const [index,matrix] of measured)measured.set(index,index===referenceIndex?identityTransform():combineTransforms(templateToOutput,matrix));
 }
 report(1);
 return {transforms,measuredTransforms:measured,estimatedFrames,reference,referenceIndex,matchingReferenceIndex:candidate,templateToOutput,timeForIndex,summary:{frames:ordered.length,referenceIndex,matchingReferenceIndex:candidate,affineFrames:stats.filter(s=>s.model==='affine').length,recoveredFrames,interpolatedFrames:[...estimatedFrames.values()].filter(mode=>mode==='interpolated').length,heldFrames:[...estimatedFrames.values()].filter(mode=>mode==='held').length,elapsedMs:Math.round(performance.now()-start),meanResidualPx:stats.reduce((sum,s)=>sum+s.residualPx,0)/stats.length,maxResidualPx:Math.max(...stats.map(s=>s.residualPx))}};
}

// Missing border pixels are transparent, never invented. Canvas rendering uses
// the same matrix; this deterministic sampler supports quantitative tests.
export function warpPixels(pixels,width,height,matrix){
 const inverse=invertTransform(matrix);if(!inverse)throw Error('Invalid stabilization transform');const output=new Uint8ClampedArray(pixels.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=transformPoint(inverse,x,y),ix=Math.floor(p.x),iy=Math.floor(p.y);if(ix<0||iy<0||ix>=width-1||iy>=height-1)continue;
  const u=p.x-ix,v=p.y-iy,src=(iy*width+ix)*4,dst=(y*width+x)*4;
  for(let c=0;c<4;c++)output[dst+c]=(pixels[src+c]*(1-u)+pixels[src+4+c]*u)*(1-v)+(pixels[src+width*4+c]*(1-u)+pixels[src+(width+1)*4+c]*u)*v;
 }
 return output;
}

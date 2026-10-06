// Floating-offset sinusoidal least squares: solve amplitude/phase/offset at
// each trial frequency, then refine the best frequency minima. The centered
// independent variable keeps predictions stable with large time offsets.
// Reference: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lombscargle.html
export function fitSine(points){
 if(points.some(p=>![p.x,p.y].every(Number.isFinite)))throw Error('有限の座標データが必要です。');
 const xs=[...new Set(points.map(p=>p.x))].sort((a,b)=>a-b);
 if(xs.length<6)throw Error('sinのフィットには横軸の異なる値が6点以上必要です。');
 const min=xs[0],max=xs.at(-1),span=max-min,reference=min+span/2;
 if(!Number.isFinite(span)||span<=0)throw Error('横軸の範囲が不足しています。');
 const n=points.length,mean=points.reduce((sum,p)=>sum+p.y/n,0);
 const u=points.map(p=>(p.x-reference)/span),v=points.map(p=>p.y-mean);
 const total=v.reduce((sum,y)=>sum+y*y,0);
 if(!Number.isFinite(total)||total<=n*(Number.EPSILON*Math.max(1,...points.map(p=>Math.abs(p.y)))*32)**2)throw Error('位置の変化が小さすぎるため、sinの周期を決められません。');
 let gap=Infinity;for(let i=1;i<xs.length;i++)gap=Math.min(gap,(xs[i]-xs[i-1])/span);
 // Keep the search finite and below the sampling limit for equally spaced
 // points. Missing/uneven points are fitted at their actual coordinates.
 const low=.25,high=Math.min(256,.5/gap*(1-1e-6));
 const evaluate=cycles=>{
  const w=2*Math.PI*cycles,sines=u.map(x=>Math.sin(w*x)),cosines=u.map(x=>Math.cos(w*x));
  const sm=sines.reduce((s,a)=>s+a/n,0),cm=cosines.reduce((s,a)=>s+a/n,0);
  let ss=0,cc=0,sc=0,sy=0,cy=0;
  for(let i=0;i<n;i++){const s=sines[i]-sm,c=cosines[i]-cm;ss+=s*s;cc+=c*c;sc+=s*c;sy+=s*v[i];cy+=c*v[i];}
  const determinant=ss*cc-sc*sc;
  if(determinant<=1e-12*ss*cc)return {cycles,residual:Infinity};
  const a=(sy*cc-cy*sc)/determinant,b=(cy*ss-sy*sc)/determinant,offset=mean-a*sm-b*cm;
  let residual=0;for(let i=0;i<n;i++)residual+=(v[i]-a*(sines[i]-sm)-b*(cosines[i]-cm))**2;
  return {cycles,residual,a,b,offset};
 };
 const count=Math.max(32,Math.ceil((high-low)*16)),step=(high-low)/count;
 const trials=Array.from({length:count+1},(_,i)=>evaluate(low+i*step));
 const minima=trials.filter((p,i)=>(i===0||p.residual<=trials[i-1].residual)&&(i===count||p.residual<=trials[i+1].residual));
 minima.sort((a,b)=>a.residual-b.residual);
 let best=trials.reduce((a,b)=>a.residual<=b.residual?a:b);
 for(const seed of minima.slice(0,8)){
  let left=Math.max(low,seed.cycles-step),right=Math.min(high,seed.cycles+step);
  const ratio=(Math.sqrt(5)-1)/2;
  let a=evaluate(right-ratio*(right-left)),b=evaluate(left+ratio*(right-left));
  for(let i=0;i<64;i++){
   if(a.residual<b.residual){right=b.cycles;b=a;a=evaluate(right-ratio*(right-left));}
   else{left=a.cycles;a=b;b=evaluate(left+ratio*(right-left));}
  }
  for(const fit of [seed,a,b,evaluate((left+right)/2)])if(fit.residual<best.residual)best=fit;
 }
 const amplitude=Math.hypot(best.a,best.b),omega=2*Math.PI*best.cycles/span,phase=Math.atan2(best.b,best.a);
 if(![amplitude,omega,phase,best.offset,best.residual].every(Number.isFinite)||amplitude<=0)throw Error('このデータではsinをフィットできません。');
 const predict=x=>amplitude*Math.sin(omega*(x-reference)+phase)+best.offset;
 return {kind:'sine',amplitude,omega,phase,offset:best.offset,reference,period:2*Math.PI/omega,predict,range:{min,max},count:n,rmse:Math.sqrt(best.residual/n),r2:1-best.residual/total};
}

import {objectSeries} from './object-data.js';
import {fitSine} from './sine-fit.js';
export {fitSine} from './sine-fit.js';
import {calibrationBasis,coordinateOrigin,physicalCoordinates} from './calibration.js';

export const graphTypes=[
 {id:'yx',title:'y–x',horizontal:'x',vertical:'y'},
 {id:'xt',title:'x–t',horizontal:'t',vertical:'x'},
 {id:'yt',title:'y–t',horizontal:'t',vertical:'y'}
];

export function graphData(data={}){
 const basis=calibrationBasis(data.calibration,data.size),origin=coordinateOrigin(data);
 const measured=(data.centers||[]).filter(p=>['manual','auto'].includes(p.confidence)&&[p.x,p.y,p.time].every(Number.isFinite));
 const unit=basis?'m':'px';
 if(!measured.length)return {points:[],unit,reason:'undetected',excluded:(data.centers||[]).length};
 if(!origin)return {points:[],unit,reason:'origin-missing',excluded:(data.centers||[]).length};
 const points=[];
 for(const [index,p] of (data.centers||[]).entries()){
  const position=physicalCoordinates(p,origin,basis);
  if(position&&Number.isFinite(p.time))points.push({frame:index+1,t:p.time,...position});
 }
 return {points,unit,reason:null,excluded:(data.centers||[]).length-points.length};
}

// Least squares in a centered, scaled basis, using Householder QR instead of normal equations.
// predict() retains that basis, so a large time offset does not lose evaluation precision.
export function fitPolynomial(points,degree){
 if(!Number.isInteger(degree)||degree<0||degree>3)throw Error('次数は0〜3から選んでください。');
 if(points.length<degree+1)throw Error(`${degree}次のフィットには${degree+1}点以上の検出が必要です。`);
 if(points.some(p=>![p.x,p.y].every(Number.isFinite)))throw Error('有限の座標データが必要です。');
 const xs=points.map(p=>p.x),min=Math.min(...xs),max=Math.max(...xs),center=min+(max-min)/2,scale=(max-min)/2||1;
 const mean=points.reduce((sum,p)=>sum+p.y/points.length,0),cols=degree+1;
 const a=points.map(p=>Array.from({length:cols},(_,j)=>((p.x-center)/scale)**j)),b=points.map(p=>p.y-mean);
 for(let k=0;k<cols;k++){
  const v=a.slice(k).map(row=>row[k]),norm=Math.hypot(...v);
  if(norm<1e-10*Math.sqrt(points.length))throw Error('横軸の異なる値が不足しているため、この次数ではフィットできません。');
  v[0]+=(v[0]>=0?1:-1)*norm;const length=Math.hypot(...v);for(let i=0;i<v.length;i++)v[i]/=length;
  for(let j=k;j<cols;j++){
   let dot=0;for(let i=0;i<v.length;i++)dot+=v[i]*a[k+i][j];
   for(let i=0;i<v.length;i++)a[k+i][j]-=2*v[i]*dot;
  }
  let dot=0;for(let i=0;i<v.length;i++)dot+=v[i]*b[k+i];
  for(let i=0;i<v.length;i++)b[k+i]-=2*v[i]*dot;
 }
 const normalized=Array(cols).fill(0);
 for(let i=degree;i>=0;i--){let value=b[i];for(let j=i+1;j<cols;j++)value-=a[i][j]*normalized[j];normalized[i]=value/a[i][i];}
 normalized[0]+=mean;
 const choose=(n,k)=>{let value=1;for(let i=1;i<=k;i++)value=value*(n-i+1)/i;return value;};
 const coefficients=Array(cols).fill(0);
 for(let j=0;j<cols;j++)for(let k=j;k<cols;k++)coefficients[j]+=normalized[k]*choose(k,j)*(-center)**(k-j)/scale**k;
 const predict=x=>{const u=(x-center)/scale;let y=normalized[degree];for(let j=degree-1;j>=0;j--)y=y*u+normalized[j];return y;};
 const residual=points.reduce((s,p)=>s+(p.y-predict(p.x))**2,0),total=points.reduce((s,p)=>s+(p.y-mean)**2,0);
 if(!coefficients.every(Number.isFinite)||!Number.isFinite(residual))throw Error('この座標範囲では計算できません。');
 return {degree,coefficients,predict,rmse:Math.sqrt(residual/points.length),r2:total>1e-24?1-residual/total:residual<1e-24?1:0,count:points.length,range:{min,max}};
}

export function graphNumber(value){return Number.isFinite(value)?Number(value.toPrecision(6)).toString():'—';}
export function polynomialEquation(fit,dependent,independent){
 const terms=[];
 for(let j=fit.degree;j>=0;j--){const value=fit.coefficients[j],sign=value<0?'−':'+',power=j===0?'':j===1?` ${independent}`:` ${independent}${j===2?'²':'³'}`;
  terms.push(`${terms.length?` ${sign} `:value<0?'−':''}${graphNumber(Math.abs(value))}${power}`);
 }
 return `${dependent} = ${terms.join('')}`;
}

export function fitGraph(points,model){
 return model==='sin'?fitSine(points):fitPolynomial(points,Number(model));
}
export function fitEquation(fit,dependent,independent){
 if(fit.kind!=='sine')return polynomialEquation(fit,dependent,independent);
 const shifted=fit.reference===0?independent:`(${independent} ${fit.reference<0?'+':'−'} ${graphNumber(Math.abs(fit.reference))})`;
 return `${dependent} = ${graphNumber(fit.amplitude)} sin(${graphNumber(fit.omega)} ${shifted} ${fit.phase<0?'−':'+'} ${graphNumber(Math.abs(fit.phase))}) ${fit.offset<0?'−':'+'} ${graphNumber(Math.abs(fit.offset))}`;
}

export function graphSeries(data={},selection='both'){
 return objectSeries(data,true).filter(o=>selection==='both'||o.id===selection).map(o=>({
  id:o.id,label:`物体${o.id+1}`,color:o.id===1?'#e67819':'#2359db',
  ...graphData(o.data)
 }));
}

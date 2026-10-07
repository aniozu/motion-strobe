import {GraphViewport,bindGraphNavigation} from './graph-viewport.js';
import {graphData,graphSeries,graphTypes,fitGraph,graphNumber,fitEquation} from './graph-data.js';
import {formatSeconds} from './format.js';

function bounds(values){
 let min=Math.min(...values),max=Math.max(...values);
 const pad=max===min?Math.max(Math.abs(min)*.05,.01):(max-min)*.08;
 return {min:min-pad,max:max+pad};
}
export function sharedGraphRanges(points){
 if(!points.length)return null;
 const coordinate=bounds(points.flatMap(p=>[p.x,p.y]));
 return {x:coordinate,y:coordinate,t:bounds(points.map(p=>p.t))};
}
function ticks({min,max},count=4){
 const rough=(max-min)/count,base=10**Math.floor(Math.log10(rough)),ratio=rough/base;
 const step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*base,result=[];
 for(let n=Math.ceil(min/step);n*step<=max+step*1e-8&&result.length<12;n++)result.push(n*step);
 return result;
}

export function graphGeometry(width,height,type,ranges){
 const xRange=ranges[type.horizontal],yRange=ranges[type.vertical];
 const label=(v,key)=>key==='t'?formatSeconds(Math.abs(v)<1e-12?0:v):graphNumber(Math.abs(v)<1e-12?0:v);
 const yTicks=ticks(yRange),yLength=Math.max(...[...ticks(ranges.x),...ticks(ranges.y)].map(v=>graphNumber(Math.abs(v)<1e-12?0:v).length));
 const xLength=Math.max(label(xRange.min,type.horizontal).length,label(xRange.max,type.horizontal).length);
 const area={left:Math.max(64,Math.min(100,yLength*6.5+24)),right:width-Math.max(18,xLength*3.25+4),top:18,bottom:height-44};
 return {xRange,yRange,area,label,yTicks,xLength};
}

export function drawGraph(canvas,points,type,unit,fit,ranges=sharedGraphRanges(points),series=null){
 const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height||!points.length)return;
 const dpr=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 const {xRange,yRange,area,label,yTicks,xLength}=graphGeometry(width,height,type,ranges);
 const x=v=>area.left+(v-xRange.min)/(xRange.max-xRange.min)*(area.right-area.left);
 const y=v=>area.bottom-(v-yRange.min)/(yRange.max-yRange.min)*(area.bottom-area.top);
 ctx.font='12px sans-serif';ctx.lineWidth=1;ctx.textBaseline='middle';
 for(const value of yTicks){
  ctx.strokeStyle='#e5ebf1';ctx.beginPath();ctx.moveTo(area.left,y(value));ctx.lineTo(area.right,y(value));ctx.stroke();
  ctx.fillStyle='#536375';ctx.textAlign='right';ctx.fillText(label(value,type.vertical),area.left-8,y(value));
 }
 for(const value of ticks(xRange,Math.max(2,Math.floor((area.right-area.left)/(xLength*7+18))))){
  ctx.strokeStyle='#e5ebf1';ctx.beginPath();ctx.moveTo(x(value),area.top);ctx.lineTo(x(value),area.bottom);ctx.stroke();
  ctx.fillStyle='#536375';ctx.textAlign='center';ctx.fillText(label(value,type.horizontal),x(value),area.bottom+14);
 }
 ctx.strokeStyle='#8191a2';ctx.beginPath();ctx.moveTo(area.left,area.top);ctx.lineTo(area.left,area.bottom);ctx.lineTo(area.right,area.bottom);ctx.stroke();
 ctx.fillStyle='#26384b';ctx.font='14px sans-serif';ctx.textAlign='center';
 ctx.fillText(`${type.horizontal} (${type.horizontal==='t'?'s':unit})`,(area.left+area.right)/2,height-8);
 ctx.save();ctx.translate(Math.max(14,area.left-Math.max(50,yTicks.reduce((n,v)=>Math.max(n,label(v,type.vertical).length),0)*6.5+20)),(area.top+area.bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText(`${type.vertical} (${unit})`,0,0);ctx.restore();
 ctx.save();ctx.beginPath();ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top);ctx.clip();
 const plots=series||[{points,fit,color:'#2359db',fitColor:'#dc8623'}];
 for(const plot of plots){ctx.fillStyle=plot.color;for(const p of plot.points){ctx.beginPath();ctx.arc(x(p[type.horizontal]),y(p[type.vertical]),3.2,0,2*Math.PI);ctx.fill();}}
 // All fitted curves are drawn after all measured points.
 for(const plot of plots){const fit=plot.fit;if(!fit)continue;
  ctx.strokeStyle=plot.fitColor||plot.color;ctx.lineWidth=2;ctx.beginPath();
  const curveMin=Math.max(fit.range.min,xRange.min),curveMax=Math.min(fit.range.max,xRange.max);
  const segments=fit.kind==='sine'?Math.max(200,Math.ceil((curveMax-curveMin)/fit.period*32)):200;
  if(curveMax>=curveMin)for(let i=0;i<=segments;i++){const value=curveMin+(curveMax-curveMin)*i/segments,px=x(value),py=y(fit.predict(value));if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.stroke();
 }

 ctx.restore();canvas.setAttribute('aria-label',`${type.title}グラフ。横軸${type.horizontal}、縦軸${type.vertical}。座標の単位は${unit}、時間の単位は秒。検出済み${points.length}点${fit?fit.kind==='sine'?'、sinフィット':`、${fit.degree}次の多項式フィット`:''}。`);
}

export class GraphPanel{
 constructor({onDetect}){
  this.dialog=document.getElementById('graphsDialog');this.cards=[];this.active='yx';this.objectId='both';this.viewport=new GraphViewport();
  const host=document.getElementById('graphCards');
  for(const type of graphTypes){
   const element=document.createElement('section');element.className='graph-card';element.dataset.graph=type.id;
   element.innerHTML=`<div class="graph-card-heading"><h3>${type.title} グラフ</h3><div class="graph-zoom"><button type="button" data-graph-zoom="reset" aria-label="${type.title}の両軸を全体表示">全体</button></div></div><div class="graph-axis-tools">${[["horizontal",type.horizontal],["vertical",type.vertical]].map(([axis,label])=>`<div class="graph-zoom" role="group" aria-label="${label}軸の拡大縮小"><span>${label}軸</span><button type="button" data-graph-axis="${axis}" data-graph-zoom="out" aria-label="${label}軸を縮小">−</button><button type="button" data-graph-axis="${axis}" data-graph-zoom="in" aria-label="${label}軸を拡大">＋</button></div>`).join("")}</div><canvas class="graph-canvas" role="img" tabindex="0"></canvas><p class="graph-legend"><span>検出した位置</span><span class="fit-legend" hidden>フィット</span></p><label class="graph-fit-setting">関数フィット<select aria-label="${type.title}のフィット関数"><option value="">フィットなし</option><option value="0">0次（一定）</option><option value="1">1次</option><option value="2">2次</option><option value="3">3次</option><option value="sin">sin（正弦波）</option></select></label><p class="graph-fit-error" role="status" hidden></p><div class="graph-fit-details" hidden><p class="graph-equation"></p></div>`;
   host.append(element);
   const card={type,element,canvas:element.querySelector('canvas'),select:element.querySelector('select'),fit:null};
   card.select.onchange=()=>this.fitCard(card);this.cards.push(card);
   card.clearPointers=bindGraphNavigation(card.canvas,{viewport:this.viewport,type,geometry:()=>graphGeometry(card.canvas.clientWidth,card.canvas.clientHeight,type,this.viewport.ranges),onChange:()=>this.scheduleDraw()});
   for(const button of element.querySelectorAll('[data-graph-zoom]'))button.onclick=()=>{
    if(button.dataset.graphZoom==='reset')this.viewport.reset();
    else this.viewport.zoom(type,button.dataset.graphZoom==='in'?1.25:1/1.25,.5,.5,button.dataset.graphAxis);
    this.scheduleDraw();
   };
  }
  this.tabs=[...document.querySelectorAll('[data-graph-tab]')];
  for(const tab of this.tabs)tab.onclick=()=>{this.active=tab.dataset.graphTab;this.selectTab();};
  this.objectTabs=[...document.querySelectorAll('[data-graph-object]')];for(const button of this.objectTabs)button.onclick=()=>{this.objectId=button.dataset.graphObject==='both'?'both':Number(button.dataset.graphObject);if(this.source)this.update(this.source);};
  document.getElementById('graphDetect').onclick=()=>{this.dialog.close();onDetect(this.objectId);};
  this.resize=new ResizeObserver(()=>this.draw());for(const card of this.cards)this.resize.observe(card.canvas);
  this.dialog.addEventListener('close',()=>{for(const card of this.cards)card.clearPointers();});
  this.selectTab();
 }
 open(data){this.update(data);this.dialog.showModal();requestAnimationFrame(()=>this.draw());}
 update(data){
  this.source=data;this.series=graphSeries(data,this.objectId);const points=this.series.flatMap(o=>o.points);this.data={points,unit:this.series[0]?.unit||'px',reason:this.series.find(o=>o.reason==='origin-missing')?'origin-missing':'undetected',excluded:this.series.reduce((n,o)=>n+o.excluded,0)};this.viewport.set(sharedGraphRanges(points));
  for(const button of this.objectTabs){const active=button.dataset.graphObject===String(this.objectId);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}

  const empty=document.getElementById('graphEmpty'),available=this.data.points.length>0;
  empty.hidden=available;document.getElementById('graphCards').hidden=!available;document.getElementById('graphTabs').hidden=!available;
  document.getElementById('graphEmptyMessage').textContent=this.data.reason==='origin-missing'?'物体1の最初の抽出コマで位置を指定してください。その位置を2物体共通の原点にします。':'物体の位置がまだ検出されていません。「位置を検出」で中心を指定してください。';
  document.getElementById('graphNote').textContent=available?`${this.data.points.length}点 · ${this.data.unit==='m'?'校正した軸・m単位':'未校正・px単位'} · 原点は物体1の最初の抽出コマの中心で、2物体共通です。時刻は時間範囲の開始から。${this.data.excluded?` 未指定・未検出・要確認・「なし」の${this.data.excluded}コマは除いています。`:''}`:'';
  document.getElementById('graphPrecisionNote').hidden=!available;
  for(const card of this.cards){
   this.fitCard(card);
  }
 }
 selectTab(){
  for(const tab of this.tabs){const active=tab.dataset.graphTab===this.active;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));}
  for(const card of this.cards){card.clearPointers();card.element.classList.toggle('active',card.type.id===this.active);}
  requestAnimationFrame(()=>this.draw());
 }
 fitCard(card){
  card.fit=null;card.plots=this.series?.filter(o=>o.points.length).map(o=>({...o,fit:null}))||[];
  const error=card.element.querySelector('.graph-fit-error'),details=card.element.querySelector('.graph-fit-details');error.hidden=true;details.hidden=true;
  const equations=[],errors=[];
  if(card.select.value!=='')for(const plot of card.plots){
   try{plot.fit=fitGraph(plot.points.map(p=>({x:p[card.type.horizontal],y:p[card.type.vertical]})),card.select.value);equations.push(`${plot.label}: ${fitEquation(plot.fit,card.type.vertical,card.type.horizontal)}`);}
   catch(e){errors.push(`${plot.label}: ${e.message}`);}
  }
  card.fit=card.plots.find(p=>p.fit)?.fit||null;
  if(equations.length){details.hidden=false;card.element.querySelector('.graph-equation').textContent=equations.join('\n');}
  if(errors.length){error.hidden=false;error.textContent=errors.join('\n');}
  const legend=card.element.querySelector('.graph-legend');legend.replaceChildren();for(const plot of card.plots){const span=document.createElement('span');span.className='object-legend';span.style.setProperty('--object-color',plot.color);span.textContent=plot.label;legend.append(span);}if(card.fit){const span=document.createElement('span');span.className='fit-legend';span.textContent='フィット';legend.append(span);}
  this.drawCard(card);
 }
 drawCard(card){if(this.data?.points.length)drawGraph(card.canvas,this.data.points,card.type,this.data.unit,card.fit,this.viewport.ranges,card.plots);}

 scheduleDraw(){if(this.drawPending)return;this.drawPending=requestAnimationFrame(()=>{this.drawPending=null;this.draw();});}
 draw(){if(this.dialog.open)for(const card of this.cards)this.drawCard(card);}
}

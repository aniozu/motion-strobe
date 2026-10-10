import {installSamplePreviews} from './sample-preview.js';
// Ordered from kinematics through projectile motion, collisions, and oscillations.
export const samples=[
 {
  "id": "constant-speed",
  "title": "等速直線運動（横から）",
  "bytes": 6598695,
  "video": "sample-constant-speed.mp4",
  "poster": "sample-constant-speed.png",
  "range": {
   "start": 0.85,
   "end": 1.6,
   "background": 0
  }
 },
 {
  "id": "constant-speed-top",
  "title": "等速直線運動（上から）",
  "bytes": 552135,
  "video": "sample-constant-speed_2.mp4",
  "poster": "sample-constant-speed_2.png",
  "range": {
   "start": 0.95,
   "end": 1.65,
   "background": 0
  }
 },
 {
  "id": "inclined-plane",
  "title": "斜面を下る物体",
  "bytes": 2031590,
  "video": "sample-inclined-plane.mp4",
  "poster": "sample-inclined-plane.png",
  "range": {
   "start": 2.95,
   "end": 3.75,
   "background": 0
  }
 },
 {
  "id": "soccer-free-fall",
  "title": "サッカーボールの自由落下",
  "bytes": 1132213,
  "video": "sample-soccer-free-fall.mp4",
  "poster": "sample-soccer-free-fall.png",
  "range": {
   "start": 0,
   "end": 10.2,
   "background": 0
  }
 },
 {
  "id": "parabolic-motion",
  "title": "球の放物運動",
  "bytes": 902223,
  "video": "sample-parabolic-motion.mp4",
  "poster": "sample-parabolic-motion.png",
  "range": {
   "start": 0.1,
   "end": 0.65,
   "background": 0
  }
 },
 {
  "id": "soccer-projectile",
  "title": "サッカーボールの放物運動",
  "bytes": 15027283,
  "video": "sample-soccer-projectile.mp4",
  "poster": "sample-soccer-projectile.png",
  "range": {
   "start": 6.5,
   "end": 20.6,
   "background": 0
  }
 },
 {
  "id": "hammer",
  "title": "ハンマーの放物運動",
  "bytes": 3013617,
  "video": "sample-hammer.mp4",
  "poster": "sample-hammer.png",
  "range": {
   "start": 1.45,
   "end": 2.35,
   "background": 0
  }
 },
 {
  "id": "bouncing-ball",
  "title": "スーパーボールのバウンド",
  "bytes": 2342722,
  "video": "sample-bouncing-ball.mp4",
  "poster": "sample-bouncing-ball.png",
  "range": {
   "start": 0.65,
   "end": 5.15,
   "background": 0
  }
 },
 {
  "id": "two-body-collision",
  "title": "2物体の衝突",
  "bytes": 4257453,
  "video": "sample-constant-2body-collision.mp4",
  "poster": "sample-constant-2body-collision.png",
  "range": {
   "start": 2.5,
   "end": 3.95,
   "background": 0
  }
 },
 {
  "id": "pendulum",
  "title": "単振り子の運動",
  "bytes": 21627883,
  "video": "sample-pendulum.mp4",
  "poster": "sample-pendulum.png",
  "range": {
   "start": 0,
   "end": 3.4,
   "background": 0
  }
 }
];
export function installSamples({onChoose}){
 const dialog=document.getElementById('samplesDialog'),list=document.getElementById('sampleList');
 installSampleBackdropDismiss(dialog);
 const previews=installSamplePreviews(dialog);
 const buttons=samples.map(sample=>{
  const button=document.createElement('div');button.className='sample-card';
  const thumbnail=document.createElement('button');thumbnail.type='button';thumbnail.className='sample-thumbnail';thumbnail.setAttribute('aria-label','プレビューを再生／停止: '+sample.title);
  const image=document.createElement('img');image.src=sample.poster+'?v=1.17.18';image.alt='';image.loading='lazy';thumbnail.append(image);
  previews.attach(thumbnail,`sample-preview-${sample.id}.mp4?v=1.17.18`);
  const title=document.createElement('button');title.type='button';title.className='sample-title';title.textContent=sample.title;
  button.append(thumbnail,title);title.onclick=()=>{previews.stop();dialog.close();onChoose(sample);};
  return button;
 });
 let currentColumns=0;
 const layout=()=>{
  const columns=Math.max(2,Math.min(4,parseInt(getComputedStyle(dialog).getPropertyValue('--sample-columns'),10)||2));
  if(columns===currentColumns)return;
  previews.stop();
  currentColumns=columns;
  const focused=buttons.some(card=>Array.from(card.children).includes(document.activeElement))?document.activeElement:null,scrollTop=dialog.scrollTop;
  const rows=[];
  for(let first=0;first<buttons.length;first+=columns){
   const row=document.createElement('div');row.className='sample-row';row.append(...buttons.slice(first,first+columns));rows.push(row);
  }
  list.replaceChildren(...rows);
  if(focused)focused.focus({preventScroll:true});
  dialog.scrollTop=scrollTop;previews.refresh();
 };
 layout();window.addEventListener('resize',layout);
 document.getElementById('tryDemo').onclick=()=>{layout();dialog.showModal();previews.refresh();};
}

// Native dialog backdrops retarget events to the dialog itself. Its padding is inside.
export function installSampleBackdropDismiss(dialog){
 let press=null;
 const outside=e=>{
  const box=dialog.getBoundingClientRect();
  return e.target===dialog&&(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom);
 };
 dialog.addEventListener('pointerdown',e=>{
  press=e.isPrimary!==false&&e.button===0&&outside(e)?{id:e.pointerId,x:e.clientX,y:e.clientY}:null;
 });
 dialog.addEventListener('pointermove',e=>{
  if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)press=null;
 });
 dialog.addEventListener('pointercancel',()=>{press=null;});
 dialog.addEventListener('click',e=>{
  const dismiss=press&&dialog.open&&outside(e);press=null;
  if(dismiss)dialog.close();
 });
 dialog.addEventListener('close',()=>{press=null;});
}

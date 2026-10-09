// Ordered from kinematics through projectile motion, collisions, and oscillations.
export const samples=[
 {
  "id": "constant-speed",
  "title": "等速直線運動（横から）",
  "bytes": 7969234,
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
  "bytes": 2198520,
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
  "bytes": 1306714,
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
  "bytes": 934793,
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
  "bytes": 15381364,
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
  "bytes": 3122594,
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
  "bytes": 2534186,
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
 list.replaceChildren();
 for(let first=0;first<samples.length;first+=2){
  const row=document.createElement('div');row.className='sample-row';
  for(const sample of samples.slice(first,first+2)){
   const button=document.createElement('button');button.type='button';button.className='sample-card';
   const thumbnail=document.createElement('span');thumbnail.className='sample-thumbnail';
   const image=document.createElement('img');image.src=sample.poster;image.alt='';image.loading='lazy';thumbnail.append(image);
   const title=document.createElement('span');title.className='sample-title';title.textContent=sample.title;
   button.append(thumbnail,title);button.onclick=()=>{dialog.close();onChoose(sample);};row.append(button);
  }
  list.append(row);
 }
 document.getElementById('tryDemo').onclick=()=>dialog.showModal();
}

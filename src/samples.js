// Ordered from introductory kinematics through collisions and rigid-body motion.
export const samples=[
 {
  "id": "constant-speed",
  "title": "等速直線運動",
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
  "id": "hammer",
  "title": "トンカチ",
  "bytes": 3122594,
  "video": "sample-hammer.mp4",
  "poster": "sample-hammer.png",
  "range": {
   "start": 1.45,
   "end": 2.35,
   "background": 0
  }
 }
];
export function installSamples({onChoose}){
 const dialog=document.getElementById('samplesDialog'),list=document.getElementById('sampleList');
 for(const sample of samples){const button=document.createElement('button');button.type='button';button.className='sample-card';const image=document.createElement('img');image.src=sample.poster;image.alt='';image.loading='lazy';const title=document.createElement('span');title.textContent=sample.title;button.append(image,title);button.onclick=()=>{dialog.close();onChoose(sample);};list.append(button);}
 document.getElementById('tryDemo').onclick=()=>dialog.showModal();
}

// Add future sample videos here; the picker grows as a scrollable list.
export const samples=[{id:'cart-spring',title:'等速直線運動する台車に取り付けたばね振り子の運動',video:'sample-motion.mp4',poster:'sample-capture.jpg',range:{start:3,end:4.1,background:.5}},{id:'parabolic-motion',title:'放物運動',video:'sample-parabolic-motion.mp4',poster:'sample-parabolic-capture.jpg',range:{start:.1,end:.65,background:0}}];
export function installSamples({onChoose}){
 const dialog=document.getElementById('samplesDialog'),list=document.getElementById('sampleList');
 for(const sample of samples){const button=document.createElement('button');button.type='button';button.className='sample-card';const image=document.createElement('img');image.src=sample.poster;image.alt='';image.loading='lazy';const title=document.createElement('span');title.textContent=sample.title;button.append(image,title);button.onclick=()=>{dialog.close();onChoose(sample);};list.append(button);}
 document.getElementById('tryDemo').onclick=()=>dialog.showModal();
}

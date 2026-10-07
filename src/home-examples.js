import {openingAnimationEnabled} from './opening-preference.js';
// These are actual non-looping GIFs, independent of the user's video results.
export const homeExamples=[{
 id:'projectile',
 gif:'opening-projectile.gif?v=1.16.2',
 start:'opening-projectile-start.webp?v=1.16.2',
 poster:'opening-projectile-poster.webp?v=1.16.2',
 alt:'物体の像と中心の縦横線が順に重なるストロボアニメーション'
}];
const installed=new WeakMap();
function loadGif(state){
 if(!state.gifReady)state.gifReady=fetch(state.example.gif,{cache:'force-cache'})
  .then(response=>{if(!response.ok)throw Error('opening animation');return response.blob();})
  .then(blob=>blob.slice(0,blob.size,'image/gif')).catch(()=>null);
 return state.gifReady;
}

export function installHomeExample(home,example=homeExamples[0]){
 const image=home.querySelector('#homeExampleImage');
 image.alt=example.alt;
 image.src=openingAnimationEnabled(home.ownerDocument)?example.start:example.poster;
 const state={example,image,objectUrl:null,sequence:0};
 // Force the Blob's media type even on static hosts serving octet-stream.
 if(openingAnimationEnabled(home.ownerDocument))loadGif(state);
 installed.set(home,state);
 return image.decode?.().catch(()=>{});
}

export async function restartHomeExample(home,{signal,isVisible=()=>!home.hidden&&home.ownerDocument.visibilityState!=='hidden'}={}){
 const state=installed.get(home);
 if(!state)return;
 const sequence=++state.sequence;
 const current=()=>sequence===state.sequence&&!signal?.aborted&&isVisible();
 if(!current())return;
 if(!openingAnimationEnabled(home.ownerDocument)){
  state.image.src=state.example.poster;
  if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
  state.objectUrl=null;return;
 }
 state.image.src=state.example.start;
 const blob=await loadGif(state);
 if(!current()||!openingAnimationEnabled(home.ownerDocument))return;
 // A fresh image element AND URL avoid reusing Chrome's finished GIF timeline.
 const image=state.image.cloneNode(false);
 const oldUrl=state.objectUrl;
 state.objectUrl=blob?URL.createObjectURL(blob):null;
 const separator=state.example.gif.includes('?')?'&':'?';
 image.src=state.objectUrl||`${state.example.gif}${separator}play=${Date.now()}-${sequence}`;
 image.onerror=()=>{if(current()&&state.image===image)image.src=state.example.poster;image.onerror=null;};
 state.image.replaceWith(image);state.image=image;
 if(oldUrl)URL.revokeObjectURL(oldUrl);
}

import {openingAnimationEnabled} from './opening-preference.js';
const runs=new WeakMap();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

// Text must never wait for the animated image to download or decode.
export async function playHomeIntro(home,{prepareImage=null}={}){
 if(!home)return;
 runs.get(home)?.abort();
 const run=new AbortController();runs.set(home,run);
 const document=home.ownerDocument;
 const visible=()=>!run.signal.aborted&&!home.hidden&&document.visibilityState!=='hidden';
 const release=()=>{document.documentElement.classList.remove('intro-pending');home.classList.remove('intro-waiting');};
 home.classList.remove('is-entering');
 if(!visible()){release();return;}
 if(!openingAnimationEnabled(document)){
  release();await prepareImage?.({signal:run.signal,isVisible:visible});run.complete=visible();return;
 }
 home.classList.add('intro-waiting');
 try{
  // Commit the initial opacity before adding the animation class on Chrome.
  await nextPaint();
  if(runs.get(home)!==run)return;
  release();
  if(!visible())return;
  home.classList.add('is-entering');
  await nextPaint();
  if(!visible())return;
  // Do not call img.decode() on a one-shot GIF: it may finish while hidden.
  await prepareImage?.({signal:run.signal,isVisible:visible});
  run.complete=visible();
 }catch{
  if(runs.get(home)===run)release();
 }
}

export function installHomeIntro(home,exampleReady,prepareImage=null){
 const document=home.ownerDocument;
 const replay=()=>playHomeIntro(home,{prepareImage});
 // Only wait briefly for the small initial still, never for the GIF.
 Promise.race([Promise.resolve(exampleReady).catch(()=>{}),delay(150)]).then(replay);
 home.addEventListener('motion-strobe:home',replay);
 window.addEventListener('pageshow',event=>{if(event.persisted&&!home.hidden)replay();});
 // A page opened in a background tab should run its intro when first shown.
 // Switching tabs after a completed intro must not restart the entire page.
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&!home.hidden&&(!home.classList.contains('is-entering')||!runs.get(home)?.complete))replay();
 });
}

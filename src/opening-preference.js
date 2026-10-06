// The app's explicit opening preference controls both the GIF and fade.
// OS reduced-motion must not silently replace an explicitly enabled GIF.
export function openingAnimationEnabled(document){
 return document.documentElement.dataset.homeAnimation!=='off';
}
export function initializeOpeningPreference(document,storage){
 let enabled=true;
 try{enabled=JSON.parse((storage??globalThis.localStorage)?.getItem('motion-strobe-preferences')||'{}')?.openingAnimation!==false;}catch{}
 document.documentElement.dataset.homeAnimation=enabled?'on':'off';
 return enabled;
}

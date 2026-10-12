export function installLanguagePicker({doc=globalThis.document,location=globalThis.window?.location}={}){
 const picker=doc?.getElementById('languageSelect');
 if(!picker)return;
 picker.addEventListener('change',()=>{
  const route=picker.selectedOptions[0]?.dataset.url;
  if(route)location.assign(new URL(route,doc.baseURI).href);
 });
}

export function guideSectionUrl(doc,stage,editing){
 const language=doc.documentElement.lang==='ja'?'':'en/';
 const section=editing?({range:2,sampling:3,result:4}[stage]||1):1;
 return new URL(`${language}guide/#section-${section}`,doc.baseURI).href;
}

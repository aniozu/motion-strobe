// Replaces the human-facing portions of JavaScript string and template literals.
// Template expressions stay executable and are never translated.
const japanese=/[\u3040-\u30ff\u3400-\u9fff]/;
export function localizeJavaScript(source,translations,{collect=false}={}){
 const segments=new Set();let i=0,out='';
 function replace(raw,quote){
  if(!japanese.test(raw))return raw;
  segments.add(raw);
  const translated=translations[raw];
  if(collect)return raw;
  if(translated===undefined)throw Error(`Missing English translation: ${raw}`);
  return translated.replaceAll(quote,`\\${quote}`);
 }
 function scan(terminator=null){
  let result='',depth=0;
  while(i<source.length){
   const c=source[i++];
   if(terminator==='}'&&c==='}'&&depth--===0)return result+'}';
   if(terminator==='}'&&c==='{')depth++;
   if(c==='\''||c==='"'){
    let raw='';while(i<source.length){const n=source[i++];if(n==='\\'){raw+=n+source[i++];continue;}if(n===c)break;raw+=n;}
    result+=c+replace(raw,c)+c;
   }else if(c==='`'){
    result+='`';let raw='';
    while(i<source.length){const n=source[i++];if(n==='\\'){raw+=n+source[i++];continue;}
     if(n==='`'){result+=replace(raw,'`')+'`';break;}
     if(n==='$'&&source[i]==='{'){result+=replace(raw,'`')+'${';i++;result+=scan('}');raw='';continue;}
     raw+=n;
    }
   }else if(c==='/'&&source[i]==='/'){const end=source.indexOf('\n',i);if(end<0){result+=c+source.slice(i);i=source.length;}else{result+=c+source.slice(i,end);i=end;}}
   else if(c==='/'&&source[i]==='*'){const end=source.indexOf('*/',i);if(end<0){result+=c+source.slice(i);i=source.length;}else{result+=c+source.slice(i,end+2);i=end+2;}}
   else result+=c;
  }
  return result;
 }
 out=scan();return {code:out,segments};
}

import {readFile,writeFile} from 'node:fs/promises';
export async function normalizePagesInput(){
 const file='dist/index.html';
 let html=await readFile(file,'utf8');
 html=html.replace(/<base\b[^>]*>/g,'').replace(/(<a class="language-switch" href=")[^"]*(" lang="en")/g,'$1/en/$2');
 await writeFile(file,html);
}
export async function configurePagesPaths(){
 const base=new URL(process.env.SITE_URL || 'http://localhost:8080/').pathname.replace(/\/$/,'')+'/';
 for(const file of ['dist/index.html','dist/en/index.html']){
  let html=await readFile(file,'utf8');
  html=html.replace(/<base\b[^>]*>/g,'').replace('<head>',`<head><base href="${base}">`);
  html=html.replaceAll('href="/en/"',`href="${base}en/"`).replaceAll('href="/"',`href="${base}"`);
  await writeFile(file,html);
 }
 await writeFile('dist/.nojekyll','');
}

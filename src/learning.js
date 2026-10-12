import {installAnalytics} from './analytics.js';
import {installLanguagePicker} from './language-picker.js';
installAnalytics();
const $=id=>document.getElementById(id),en=document.documentElement.lang==='en',guide=en?'en/guide/':'guide/';
// Japanese and English preserve the current guide; other options open their localized app.
for(const option of $('languageSelect').options){if(['ja','en'].includes(option.value)){const slug=location.pathname.match(/(?:guide|examples\/(?:constant-speed|projectile-motion))\/?$/)?.[0]||'guide/';option.dataset.url=(option.value==='en'?'en/':'')+slug;}}
installLanguagePicker();
$('helpButton').onclick=()=>location.assign(new URL(guide,document.baseURI).href);
$('settingsButton').onclick=()=>{
 let p={interval:.1,resolution:960,timeDecimals:2,openingAnimation:true};try{p={...p,...JSON.parse(localStorage.getItem('motion-strobe-preferences')||'{}')};}catch{}
 $('defaultInterval').value=String(p.interval);$('resolution').value=String(p.resolution);$('timeDecimals').value=String(p.timeDecimals);$('openingAnimation').checked=p.openingAnimation!==false;$('settingsDialog').showModal();
};
for(const b of document.querySelectorAll('.close-dialog'))b.onclick=()=>b.closest('dialog').close();
$('saveSettings').onclick=()=>{
 const interval=Number($('defaultInterval').value);if(!Number.isFinite(interval)||interval<=0||interval>2){$('defaultInterval').setCustomValidity(en?'Enter an interval greater than 0 and no more than 2 seconds.':'0より大きく、2秒以下の間隔を入力してください。');$('defaultInterval').reportValidity();return;}
 let p={};try{p=JSON.parse(localStorage.getItem('motion-strobe-preferences')||'{}');}catch{}
 try{localStorage.setItem('motion-strobe-preferences',JSON.stringify({...p,interval,resolution:Number($('resolution').value),timeDecimals:Number($('timeDecimals').value),openingAnimation:$('openingAnimation').checked}));}catch{}
 $('settingsDialog').close();
};
$('defaultInterval').oninput=()=>$('defaultInterval').setCustomValidity('');

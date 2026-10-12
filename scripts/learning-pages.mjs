import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {languages,languagePath,languageFile} from './languages.mjs';
const copy={ja:{name:'モーションストロボ',home:'スタートページ',guide:'使い方ガイド',examples:'解析例',start:'このサンプルで試す',pair:'English'},en:{name:'Motion Strobe',home:'Start page',guide:'How to use Motion Strobe',examples:'Analysis examples',start:'Try this sample',pair:'日本語'}};
const content={ja:[
 {
 "slug": "guide",
 "title": "使い方ガイド",
 "description": "撮影、感度の調整、写真・動画の保存、位置検出、表示設定、座標データ・グラフの使い方を画面付きで説明します。",
 "intro": "ストロボ写真や動画を作成し、必要に応じて物体の位置や運動を解析します。各画面の「？」でも、その項目の説明を確認できます。",
 "sections": [
  [
   "1. 動画を撮る・選ぶ",
   [
    "動画を撮る際は、スマホやタブレットを台や三脚で固定し、撮影中動かないようにします。明るい場所で、背景と色がはっきり違う物体を撮るときれいに合成できます。",
    "速い動きには端末のカメラアプリのスローモーション撮影が有効です。距離も測りたい場合は、物体と同じ面に物差しを置きます。",
    "スタート画面の「動画を選ぶ」で撮影済みの動画を読み込みます。「動画を撮る」でその場で撮影することも、「サンプル動画」で試すこともできます。ただし「動画を撮る」ではスロー撮影ができない場合があるので注意が必要です。このガイドではサンプル動画の「球の放物運動」を使います。"
   ]
  ],
  [
   "2. 時間範囲と背景を決める",
   [
    "画面右側の「時間範囲」で、使う部分の開始・終了を指定します。時刻の入力、±ボタン、画像の下の時間バーで変更できます。±は1コマずつ動きます。",
    "背景は「自動」のままで進めます。物体の跡が残る場合は「手動」に切り替え、物体が写っていないコマを選びます。右下の「次へ」で進みます。"
   ],
   ["range-013-073","range-end-013-073"]
  ],
  [
   "3. 時間間隔を決めて合成する",
   [
    "右側の「時間間隔」を設定します。この例は0.05秒です。像が重なりすぎる場合は間隔を広げます。コマ/秒や総枚数の値を目安に決めます。",
    "「基準」の時刻を設定すると、必ず使うコマを選べます。通常はそのままで大丈夫です。右下の「写真を作る」を押し、合成が終わるまで待ちます。"
   ],
   "sampling-005"
  ],
  [
   "4. 写真・動画の確認",
   [
    "合成が終わると「完成」画面にストロボ写真が表示されます。画像の左上にある「写真」「動画」で表示を切り替えます。",
    "右側の一番上にある「感度」を確認します。背景との色の差をどこまで拾うかを決める数値です。初期値は30です。数値を下げると小さな色の差も残り、物体の薄い部分を拾いやすくなりますが、背景のむらやノイズも入りやすくなります。上げると背景の残りを抑えますが、物体が欠けることがあります。物体が欠けるときは少し下げ、背景が汚れるときは少し上げて、写真を見ながら調整します。"
   ],
   "result-013-073"
  ],
  [
   "5. 保存",
   [
    "写真は右側の「保存」にある「写真を保存」でPNGとして保存します。「共有」から対応アプリへ渡すこともできます。",
    "「動画」を押すと設定画面が開きます。速さ（×0.25・×0.5・×1・×2・×4・×8）とシャッター音の有無を選び、「動画を作成」を押します。作成後は右側の保存ボタンでMP4を保存します。元動画の音声は入りません。"
   ],
   "video-options"
  ],
  [
   "6. 物体の位置を検出する",
   [
    "「完成」画面の右側、「物体の位置検出」にある「位置を検出」を押します。開いた画面の画像で物体をタップすると、その近くの中心を決定します。",
    "「全コマを自動検出」で、指定した位置を手がかりに他のコマを追跡します。上の時刻バーや±でコマを切り替え、結果を確認します。誤った点は「手動」で直し、物体が写っていないコマは「なし」にします。",
    "2つの物体を調べる場合は、上の「物体1」「物体2」を切り替えてそれぞれ指定します。画像はピンチやホイールで拡大でき、「移動」で表示位置を動かせます。"
   ],
   "detection-005"
  ],
  [
   "7. 表示の調整",
   [
    "位置検出の画面を閉じ、「完成」画面の右側の「表示」を使います。「時刻」「コマ/秒」で文字の表示を切り替え、「物体中心のグリッド」で検出位置の線・中心点を表示します。",
    "グリッドの横の「設定」を押すと、縦横・縦だけ・横だけ・線なしを選べます。「中心点を表示」と「中心点の大きさ」で点の表示・サイズを変えます。物体1・物体2のどちらに表示するかも選べます。",
    "線の角度、色、太さ、不透明度を調整し、下の「適用」を押します。写真と動画に反映されます。位置を検出していないコマには、線や中心点は表示されません。"
   ],
   [
    "grid-settings",
    "grid-result"
   ]
  ],
  [
   "8. 座標データの確認・保存",
   [
    "「完成」画面の「物体の位置検出」にある「座標データ」を押すと、各コマの時刻と位置を表で確認できます。下の「コピー」または「CSVを保存」で、表計算ソフトなどへ渡せます。",
    "m単位で測る場合は、表の上の「長さ・軸を校正」を開きます。画像の点A・点Bを既知の長さの両端に合わせ、実際の距離をmで入力して適用します。未校正ではpx単位です。"
   ],
   "coordinates"
  ],
  [
   "9. グラフで運動を調べる",
   [
    "「完成」画面の「物体の位置検出」にある「グラフ」を押します。y–x（軌道）・x–t（横方向の位置）・y–t（縦方向の位置）の3つのグラフを確認できます。物体1・物体2・両方を選べます。",
    "各グラフの下の「関数フィット」で0次（一定）・1次・2次・3次・sinを選ぶと、測定点に合わせた曲線と式を表示します。±で拡大縮小、ドラッグで移動し、各グラフの右上の全体表示ボタンで表示範囲を戻します。",
    "時刻0は選んだ時間範囲の開始です。未検出や「なし」のコマは測定点に含めません。撮影fpsで時刻を補正する場合は、「時間間隔」画面右上のfpsから設定し、写真を作り直します。"
   ],
   "graphs"
  ]
 ]
},
 {slug:'examples/constant-speed',title:'等速直線運動の解析例',description:'等速直線運動のサンプルで、像の間隔とx–tグラフから速度を調べます。',sample:'constant-speed',image:'sample-constant-speed.png',width:960,height:540,alt:'等速直線運動のストロボ写真',intro:'像の間隔と、位置のグラフを比べます。',sections:[
  ['1. 写真を作る','下のボタンでサンプルを開き、時間範囲と間隔を選んで写真を作ります。像がほぼ等間隔に並ぶことを確認します。'],
  ['2. x–tグラフを表示する','物体の同じ部分を指定し、「全コマを自動検出」を押します。運動する方向にx軸を合わせ、「グラフ」からx–tを選びます。'],
  ['3. 速度を求める','1次フィットを選びます。x(t) = a + bt の傾きbが速度です。長さを校正した場合はm/s、未校正ならpx/sで表します。']
 ]},
 {slug:'examples/projectile-motion',title:'放物運動の解析例',description:'球の放物運動のサンプルで、水平・鉛直方向のグラフとフィットから速度と加速度を調べます。',sample:'parabolic-motion',image:'guide-images/projectile-013-073-005.png',width:960,height:540,alt:'0.13〜0.73秒を0.05秒間隔で合成した球の放物運動',intro:'横方向と縦方向の動きを、それぞれのグラフで調べます。',sections:[
  ['1. 球の位置を検出する','下のボタンでサンプルを開き、開始0.13 s・終了0.73 s・時間間隔0.05 sで写真を作ります。球の中心を指定し、「全コマを自動検出」を押します。検出点が中心に合っているか確認します。'],
  ['2. 軸とグラフを選ぶ','x軸を水平方向、y軸を上向きに合わせます。x–tは横方向、y–tは縦方向の位置変化、y–xは軌道を表します。'],
  ['3. フィットを比べる','x–tは1次、y–tは2次フィットを選びます。y(t) = a + bt + ct² の加速度は2cです。長さをmに校正し、撮影時刻が正しければm/s²で求められます。重力だけが働く理想的な運動では、上向きを正とした鉛直加速度は−gです。']
 ]}
],en:[
 {
 "slug": "guide",
 "title": "How to use Motion Strobe",
 "description": "An illustrated guide to filming, sensitivity, saving photos and videos, detecting positions, display settings, coordinate data and graphs.",
 "intro": "Create strobe photos or videos, then detect object positions and analyze motion as needed. The ? buttons on each screen also explain the nearby controls.",
 "sections": [
  [
   "1. Record or choose a video",
   [
    "Fix your phone or tablet on a stand or tripod so it stays still throughout recording. Good lighting and an object that clearly contrasts with the background help produce a clean composite.",
    "For fast motion, use slow-motion recording in your device’s camera app. If you also want to measure distances, place a ruler in the same plane as the object.",
    "On the start page, select Choose a video to open a recording, Record a video to film now, or Sample videos to try an example. Record a video may not support slow-motion capture. This guide uses the Projectile motion of a ball sample."
   ]
  ],
  [
   "2. Set the time range and background",
   [
    "In Time range on the right, choose the start and end of the clip to use. You can use the time fields, ± buttons or the timeline below the image. The ± buttons move one frame at a time.",
    "Keep the background set to Auto. If traces of the object remain, switch to Manual and choose a frame without the object. Select Next at the bottom right."
   ],
   ["range-013-073","range-end-013-073"]
  ],
  [
   "3. Set the sampling interval and create a photo",
   [
    "Set Sampling interval on the right. This example uses 0.05 seconds. Increase the interval if the object images overlap too much. Use frames/s and Total frames to help choose an interval.",
    "Setting the Reference time selects a frame that must be included. You can usually leave it as it is. Select Create photo at the bottom right and wait for the composite to finish."
   ],
   "sampling-005"
  ],
  [
   "4. Review the photo or video",
   [
    "The Result screen displays the finished strobe photo. Use Photo and Video at the top left of the image to switch views.",
    "Check Sensitivity at the top of the right panel. This value sets the minimum color difference from the background to retain; the default is 30. Lower values retain smaller differences and faint parts of the object, but may also include background variations and noise. Higher values suppress background artifacts but can cut away parts of the object. Lower it slightly if the object is incomplete, or raise it if the background looks noisy, while watching the photo update."
   ],
   "result-013-073"
  ],
  [
   "5. Save the result",
   [
    "Use Save photo under Save on the right to download a PNG. Share sends the result to a supported app.",
    "Selecting Video opens its settings. Choose a speed (×0.25, ×0.5, ×1, ×2, ×4 or ×8) and whether to include shutter sound, then select Create video. Once it is ready, use the save button on the right to download an MP4. Original video audio is omitted."
   ],
   "video-options"
  ],
  [
   "6. Detect object positions",
   [
    "On the right of the Result screen, select Detect positions under Object position detection. Tap the object in the image to estimate its center nearby.",
    "Use Detect all frames to track the other frames from the position you marked. Inspect the results with the time slider and ± buttons at the top. Correct mistakes in Manual mode and choose Skip when the object is absent.",
    "For two objects, select Object 1 or Object 2 at the top and mark each separately. Pinch or scroll to zoom; use Pan to move the image."
   ],
   "detection-005"
  ],
  [
   "7. Adjust the display",
   [
    "Close the detection screen and use Display on the right of the Result screen. Time and frames/s toggle the labels. Center grid displays lines and center points at detected positions.",
    "Select Settings next to Center grid to choose both lines, vertical only, horizontal only or no lines. Show center point toggles the points; Center point size changes their size. You can also choose which objects to display.",
    "Adjust the angle, color, width and opacity, then select Apply at the bottom. The changes apply to photos and videos. Frames without a detected position have no grid or center point."
   ],
   [
    "grid-settings",
    "grid-result"
   ]
  ],
  [
   "8. Review and export coordinate data",
   [
    "Select Coordinate data under Object position detection on the Result screen to view each frame’s time and position. Use Copy or Save CSV at the bottom to transfer the data to a spreadsheet.",
    "For meter measurements, select Calibrate length and axes above the table. Place points A and B at the ends of a known length, enter its distance in meters and apply. Without calibration, distances are in pixels."
   ],
   "coordinates"
  ],
  [
   "9. Analyze motion with graphs",
   [
    "Select Graphs under Object position detection on the Result screen. Three graphs show y–x (trajectory), x–t (horizontal position) and y–t (vertical position). Choose Object 1, Object 2 or both.",
    "Use Curve fit below each graph to choose a constant, linear, quadratic, cubic or sine function and display the fitted curve and equation. Zoom with ± and drag to pan. The fit-both-axes button at the top right of each graph restores its view.",
    "Time zero is the start of the selected range. Missing or skipped positions are excluded. To correct timing with a known capture fps, open the fps button at the top right of Sampling interval, change the setting and recreate the photo."
   ],
   "graphs"
  ]
 ]
},
 {slug:'examples/constant-speed',title:'Constant velocity: an analysis example',description:'Use a constant-velocity sample to compare image spacing and calculate velocity from a position–time graph.',sample:'constant-speed',image:'sample-constant-speed.png',width:960,height:540,alt:'A strobe photo of constant-velocity motion',intro:'Compare the spacing of the object images with a position–time graph.',sections:[
  ['1. Create a photo','Open the sample below, choose a time range and interval, and create a photo. Check that successive images are spaced approximately equally.'],
  ['2. Plot x–t','Mark the same point on the object and select Detect all frames. Align the x-axis with the direction of motion, then select x–t from Graphs.'],
  ['3. Calculate velocity','Choose a linear fit. In x(t) = a + bt, the slope b is velocity along the x-axis. The unit is m/s after length calibration, or px/s without it.']
 ]},
 {slug:'examples/projectile-motion',title:'Projectile motion: an analysis example',description:'Use a ball’s flight to compare horizontal and vertical motion graphs and estimate velocity and acceleration with curve fits.',sample:'parabolic-motion',image:'guide-images/projectile-013-073-005.png',width:960,height:540,alt:'Ball motion from 0.13 to 0.73 seconds, combined at 0.05-second intervals',intro:'Examine horizontal and vertical motion in separate graphs.',sections:[
  ['1. Detect the ball’s positions','Open the sample below and create a photo from 0.13 s to 0.73 s at 0.05-second intervals. Mark the ball’s center and select Detect all frames. Check that the detected points follow the center.'],
  ['2. Choose axes and graphs','Set x horizontally and y upward. Use x–t for horizontal position, y–t for vertical position, and y–x for the trajectory.'],
  ['3. Compare fits','Choose a linear fit for x–t and a quadratic fit for y–t. In y(t) = a + bt + ct², acceleration is 2c. With meter calibration and correct recording times, its unit is m/s². For ideal motion under gravity alone, upward-positive vertical acceleration is −g.']
 ]}
]};
export const learningPages=Object.entries(content).flatMap(([lang,pages])=>pages.map(p=>({...p,lang,path:`/${languagePath(lang)}${p.slug}/`,file:`dist/${languagePath(lang)}${p.slug}/index.html`,locale:lang==='ja'?'ja_JP':'en_US',name:copy[lang].name})));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function languageLinks(){return `<nav class="language-links" data-language-links aria-label="Languages">${languages.map(l=>`<a href="${languagePath(l.code)||'./'}" lang="${l.code}" hreflang="${l.code}">${esc(l.name)}</a>`).join('')}</nav>`;}
export function homeLearning(language,catalog={}){
 const lang=language.code==='ja'?'ja':'en';const label=language.code==='ja'?copy.ja.guide:language.code==='en'?copy.en.guide:catalog[copy.en.guide];
 if(!label)throw Error(`Missing ${language.code} guide link translation`);
 return `<p class="home-guide-link"><a class="secondary guide-entry" href="${languagePath(lang)}guide/" lang="${language.code}" hreflang="${lang}">${language.code==='ja'?'<span class="beginner-mark" aria-hidden="true">🔰</span>':''}<span>${esc(label)}</span></a></p>`;
}
export async function writeLearningPages(version){
 const captures=JSON.parse(await readFile('dist/guide-images/captures.json','utf8'));
 for(const page of learningPages){
  const c=copy[page.lang],root=languagePath(page.lang),base='../'.repeat(page.path.split('/').filter(Boolean).length);
  const app=await readFile(languageFile(page.lang),'utf8');
  // Reuse the start page's exact header and settings dialog; only the guide body has its own CSS.
  const header=app.match(/<header>[\s\S]*?<\/header>/)[0];
  const settings=app.match(/<dialog id="settingsDialog"[\s\S]*?<\/dialog>/)[0];
  const sections=page.sections.map(([heading,text,shots],n)=>{
   const paragraphs=(Array.isArray(text)?text:[text]).map(t=>`<p>${esc(t)}</p>`).join('');
   const figures=(shots?(Array.isArray(shots)?shots:[shots]):[]).map(shot=>{const file=`${page.lang}-${shot}.jpg`,meta=captures[file];if(!meta)throw Error(`Missing guide capture: ${file}`);return `<figure class="operation-capture"><a href="guide-images/${file}?v=${version}${meta.revision?'-'+meta.revision:''}" target="_blank" rel="noopener" aria-label="${esc(page.lang==='ja'?'画面を大きく表示':'View full-size screenshot')}"><img src="guide-images/${file}?v=${version}${meta.revision?'-'+meta.revision:''}" alt="${esc(meta.caption)}" width="${meta.width}" height="${meta.height}" loading="lazy" decoding="async"></a></figure>`;}).join('');
   return `<section id="section-${n+1}"><h2>${esc(heading)}</h2>${paragraphs}${figures}</section>`;
  }).join('\n');
  const contents=page.slug==='guide'?`<nav class="guide-toc" aria-label="${page.lang==='ja'?'操作の流れ':'Guide contents'}"><ol>${page.sections.map(([heading],n)=>`<li><a href="${page.path.slice(1)}#section-${n+1}">${esc(heading.replace(/^\d+\.\s*/,''))}</a></li>`).join('')}</ol></nav>`:'';

  const examples=learningPages.filter(p=>p.lang===page.lang&&p.sample);
  const html=`<!doctype html><html lang="${page.lang}"><head><base href="${base}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101b25"><link rel="icon" type="image/svg+xml" href="motion-strobe-icon.svg?v=${version}"><link rel="stylesheet" href="style.css?v=${version}"><link rel="stylesheet" href="learn.css?v=${version}"></head><body class="learning-page">${header}<main class="guide-main"><nav class="guide-breadcrumb" aria-label="Breadcrumb"><a href="${root||'./'}">${esc(c.home)}</a> / <a href="${root}guide/">${esc(c.guide)}</a></nav><article><h1>${esc(page.title)}</h1><p class="guide-intro">${esc(page.intro)}</p>${page.image?`<figure class="example-image"><img src="${page.image}" alt="${esc(page.alt)}" width="${page.width}" height="${page.height}" fetchpriority="high"></figure><a class="guide-cta" href="${root||'./'}?sample=${page.sample}">${esc(c.start)} →</a>`:''}${contents}${sections}</article><aside class="guide-related"><h2>${esc(c.examples)}</h2><div class="guide-examples">${examples.filter(p=>p.slug!==page.slug).map(p=>`<a href="${root}${p.slug}/"><img src="${p.image}" alt="" width="${p.width}" height="${p.height}" loading="lazy"><span>${esc(p.title)} →</span></a>`).join('')}</div><p><a href="${root||'./'}">${esc(c.home)} →</a>${page.slug!=='guide'?` · <a class="secondary guide-entry" href="${root}guide/">${page.lang==='ja'?'<span class="beginner-mark" aria-hidden="true">🔰</span>':''}<span>${esc(c.guide)}</span></a>`:''}</p></aside></main><footer class="guide-footer">${languageLinks()}</footer>${settings}<script type="module" src="learning.js?v=${version}"></script></body></html>`;
  await mkdir(page.file.slice(0,page.file.lastIndexOf('/')),{recursive:true});await writeFile(page.file,html);
 }
 // Old links lead back to the guide, without retaining a pendulum example in search results.
 for(const lang of ['ja','en']){const root=languagePath(lang),file=`dist/${root}examples/pendulum/index.html`;await mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});await writeFile(file,`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0;url=../../guide/"><title>${esc(copy[lang].guide)}</title></head><body><a href="../../guide/">${esc(copy[lang].guide)}</a></body></html>`);}
}

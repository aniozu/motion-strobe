import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
test('opening assets and worker cache versions agree without a composite poster in the initial video',async()=>{
 const [html,app,opening,manifest]=await Promise.all([read('../dist/index.html'),read('../dist/app.js'),read('../dist/opening.js'),read('../package.json')]);
 const version=JSON.parse(manifest).version;
 assert(opening.includes(`opening-soccer-poster.webp?v=${version}`));assert(opening.includes(`opening-soccer.mp4?v=${version}`));assert(app.includes(`worker.js?v=${version}`));
 assert(html.includes(`opening.js?v=${version}`));
 const video=html.match(/<video\b[^>]*id="homeExampleVideo"[^>]*>/)[0];
 assert(!/\bposter=/.test(video));
 assert(html.includes('home-example is-example-loading'));
});
test('picked files use the probe and processing diagnostics are available in the deployed UI',async()=>{
 const [html,source,app]=await Promise.all([read('../dist/index.html'),read('../src/app.js'),read('../dist/app.js')]);
 assert.match(source,/safeVideoBlob\(file\)/);assert.match(source,/await probeVideoBlob\(blob\)/);
 for(const id of ['decodeReport','decodeReportText','copyDecodeReport','retryDecode']){assert(html.includes(`id="${id}"`));assert(app.includes(id));}
});


test('opening video is muted and inline, and settings exposes explicit animation control',async()=>{
 const [html,css]=await Promise.all([read('../dist/index.html'),read('../dist/style.css')]);
 assert(html.includes('muted playsinline preload="none"'));assert(!html.includes('homeExampleStill'));assert(!html.includes('prefers-reduced-motion'));assert(html.includes('id="openingAnimation"'));
 assert(!css.includes('@media(prefers-reduced-motion:no-preference)'));assert(css.includes('html[data-home-animation=off] .home-visual'));
});

test('source previews use the compact playback control and export retains its player controls',async()=>{
 const [html,css]=await Promise.all([read('../dist/index.html'),read('../dist/style.css')]);
 const source=html.match(/<video\b[^>]*id="video"[^>]*>/)[0],exportVideo=html.match(/<video\b[^>]*id="exportPreview"[^>]*>/)[0];
 assert(!/\bcontrols\b/.test(source));assert(/\bcontrols\b/.test(exportVideo));
 assert(html.includes('id="sourcePlayPause"'));assert(html.includes('id="sourcePlaybackControls"'));
 assert(html.includes('id="sourceSeek"'));assert(html.includes('id="sourcePlaybackTime"'));
 assert(html.indexOf('id="toggleSamplingPreview"')<html.indexOf('id="video"'));
 assert(!html.slice(html.indexOf('id="samplingPanel"'),html.indexOf('id="resultPanel"')).includes('id="toggleSamplingPreview"'));
 assert(css.includes('.view-area[data-preview-frame=extract]::after'));
 assert(css.includes('.source-playback-controls{position:absolute;bottom:6px;left:8px;'));
 assert.match(css,/\.workspace \.preview-chip\{[^}]*height:28px;[^}]*font-size:13px/);
 assert(!css.includes('.sampling-timeline .timeline-top{display:none}'));
 assert(html.indexOf('id="samplingTimeline"')<html.indexOf('class="sampling-metrics"'));
 assert(html.includes('id="previewFrameCount"'));
 assert(html.includes('data-point="reference"'));
});

test('start screen omits correction test samples while selected-range correction remains available',async()=>{
 const [html,source,timeline,css]=await Promise.all([read('../dist/index.html'),read('../src/app.js'),read('../src/timeline.js'),read('../dist/style.css')]);
 for(const id of ['tryStabilization','stabilizationSample','stabilizationTestTitle'])assert(!html.includes(`id="${id}"`));
 assert(!source.includes('stabilizationSamples'));assert(html.includes('id="stabilizeCamera"'));
 assert(timeline.includes('rgba(35,89,219,.18)'));
 assert(html.includes('type="checkbox">カメラの動きを補正</label>'));
 assert(!html.includes('静止した背景に合わせて'));
 assert(!html.includes('画面の端で欠ける部分は'));
 assert(css.includes('height:clamp(190px,36svh,340px)'));
});

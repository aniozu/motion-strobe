// Timestamp access is centralized so UI, labels and analysis never substitute
// frame index / average fps for a timestamp recorded on that frame.
export function frameTime(clock,index,playback=false){
 const times=playback?clock.playbackTimes:clock.times;
 if(!times?.length)return index*clock.period;
 const value=Math.max(0,Math.min(times.length-1,index)),low=Math.floor(value),high=Math.ceil(value);
 return times[low]+(times[high]-times[low])*(value-low);
}
export function indexAtTime(clock,time,playback=false){
 const times=playback?clock.playbackTimes:clock.times;
 if(!times?.length)return Math.max(0,Math.min((clock.count||Infinity)-1,Math.round(time/clock.period)));
 let low=0,high=times.length-1;
 while(low<high){const middle=Math.floor((low+high)/2);if(times[middle]<time)low=middle+1;else high=middle;}
 if(low&&Math.abs(time-times[low-1])<=Math.abs(times[low]-time))low--;
 return low;
}
export function analysisClock(clock,captureFps=null){
 if(!Number.isFinite(captureFps)||captureFps<=0)return clock;
 return {...clock,period:1/captureFps,fps:captureFps,times:clock.times.map((_,i)=>i/captureFps),variable:false,captureFps};
}
// QuickTime edits map media PTS to movie playback time. Keep that mapping
// separate: slow playback is not elapsed time in a physics experiment.
export function applyMovieEdits(clock,entries,movieTimescale,mediaTimescale){
 if(!entries?.length)return {...clock,playbackTimes:clock.ordered.map(s=>s.cts/mediaTimescale),playbackDurations:clock.ordered.map(s=>s.duration/mediaTimescale||clock.period),hasRateEdits:false};
 if(!Number.isFinite(movieTimescale)||movieTimescale<=0)throw Error('動画の再生時刻を読み取れませんでした。');
 let movieStart=0;const segments=[];
 for(const entry of entries){
  const duration=entry.segment_duration/movieTimescale,rate=entry.media_rate_integer+(entry.media_rate_fraction&0xffff)/65536;
  if(!Number.isFinite(duration)||duration<0)throw Error('動画の編集時刻を読み取れませんでした。');
  if(entry.media_time!==-1){
   if(!Number.isFinite(rate)||rate<=0)throw Error('停止・逆再生を含む動画です。連続した元動画を選んでください。');
   const mediaStart=entry.media_time/mediaTimescale;
   segments.push({movieStart,duration,rate,mediaStart,mediaEnd:mediaStart+duration*rate});
  }
  movieStart+=duration;
 }
 const ordered=[],playbackTimes=[],playbackDurations=[];
 for(const sample of clock.ordered){
  const pts=sample.cts/mediaTimescale;
  const matches=segments.filter(s=>pts>=s.mediaStart-1e-9&&pts<s.mediaEnd-1e-9);
  if(matches.length>1)throw Error('同じコマを繰り返す編集があるため、連続した元動画を選んでください。');
  const segment=matches[0];if(!segment)continue;
  ordered.push(sample);playbackTimes.push(segment.movieStart+(pts-segment.mediaStart)/segment.rate);
  const duration=sample.duration/mediaTimescale||clock.period;
  // A frame can cross a speed-change boundary. End it at the next movie PTS
  // below; this duration is used only for the final frame in a chosen clip.
  playbackDurations.push(Math.min(duration,segment.mediaEnd-pts)/segment.rate);
 }
 if(ordered.length<2)throw Error('表示できる動画のコマが不足しています。');
 if(playbackTimes.some((t,i)=>i&&t<=playbackTimes[i-1]))throw Error('再生順が入れ替わる編集動画は対応していません。元動画を選んでください。');
 const origin=ordered[0].cts/mediaTimescale,times=ordered.map(s=>(s.cts-ordered[0].cts)/mediaTimescale);
 for(let i=0;i<playbackTimes.length-1;i++)playbackDurations[i]=playbackTimes[i+1]-playbackTimes[i];
 const period=(times.at(-1)-times[0])/(times.length-1),variable=times.some((t,i)=>i&&Math.abs(t-times[i-1]-period)>Math.max(1.1/mediaTimescale,period*.002));
 return {...clock,ordered,times,origin,period,variable,fps:1/period,playbackTimes,playbackDurations,hasRateEdits:segments.some(s=>Math.abs(s.rate-1)>1e-8)};
}

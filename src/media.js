import {applyMovieEdits} from './frame-clock.js';
import {createFile,DataStream} from 'mp4box';
import {timing} from './sampling.js';
export async function parseVideo(file,onProgress=()=>{}){
 const mp4=createFile(true); let info,parseError;
 mp4.onReady=i=>info=i;mp4.onError=e=>parseError=String(e);
 const block=Math.min(4*1024*1024,Math.max(16*1024,Math.ceil(file.size/32)));
 for(let offset=0;offset<file.size;offset+=block){const ab=await file.slice(offset,offset+block).arrayBuffer();ab.fileStart=offset;mp4.appendBuffer(ab);onProgress(Math.min(1,(offset+block)/file.size));await new Promise(resolve=>setTimeout(resolve,0));}
 mp4.flush(); if(parseError||!info)throw Error('動画を読み込めません。MP4またはMOVの動画を選んでください。');
 const track=info.videoTracks?.[0];if(!track)throw Error('動画の映像トラックが見つかりません。');
 const trak=mp4.getTrackById(track.id);const samples=mp4.getTrackSamplesInfo(track.id);const clock=applyMovieEdits(timing(samples,track.timescale),trak.edts?.elst?.entries,info.timescale,track.timescale);
 const entry=trak.mdia.minf.stbl.stsd.entries[0];let description;
 for(const key of ['avcC','hvcC','vpcC','av1C'])if(entry[key]){const stream=new DataStream(undefined,0,DataStream.BIG_ENDIAN);entry[key].write(stream);description=new Uint8Array(stream.buffer,8);break;}
 const config={codec:track.codec,codedWidth:track.video.width,codedHeight:track.video.height,...(description?{description}: {})};
 const matrix=trak.tkhd.matrix;const rotation=matrix?((Math.round(Math.atan2(matrix[1],matrix[0])*180/Math.PI)%360+360)%360):0;
 const ptsToIndex=new Map(clock.ordered.map((s,i)=>[Math.round(s.cts*1e6/s.timescale),i]));
 return {mp4,track,trak,samples,clock,config,rotation,ptsToIndex};
}

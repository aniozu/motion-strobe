import {objectSeries} from './object-data.js';
import {formatSeconds} from './format.js';
import {calibrationBasis,coordinateOrigin,physicalCoordinates} from './calibration.js';

export const coordinateStatus=p=>p?.confidence==='skipped'?'打たない':p?.confidence==='missing'?'未検出':p?.confidence==='uncertain'?'要確認':p?.confidence==='auto'?'自動':p?.confidence==='manual'?'手動':'未指定';

// Presentation precision must not be applied to the recorded data. CSV export
// requests six fractional digits; screen/table/clipboard keep their settings.
export function coordinateRows(data={},options={}){
 const {centers=[],size={}}=data,origin=coordinateOrigin(data),basis=calibrationBasis(data.calibration,size);
 const digits=options.coordinateDecimals??4,timeDigits=options.timeDecimals;
 const fixed=value=>(Math.abs(value)<.5*10**-digits?0:value).toFixed(digits);
 return centers.map((p,n)=>{
  const pixels=physicalCoordinates(p,origin,null),meters=basis?physicalCoordinates(p,origin,basis):null;
  const time=timeDigits===undefined?formatSeconds(p.time):formatSeconds(p.time,timeDigits);
  const row=[String(n+1),time,pixels?fixed(pixels.x):'',pixels?fixed(pixels.y):''];
  if(basis)row.push(meters?fixed(meters.x):'',meters?fixed(meters.y):'');
  row.push(coordinateStatus(p));
  return row;
 });
}

export function coordinateTable(data={},options={}){
 const calibrated=!!calibrationBasis(data.calibration,data.size),series=objectSeries(data),header=['コマ','時刻(s)'];
 for(const object of series){
  const prefix=series.length>1?`物体${object.id+1} `:'';
  header.push(`${prefix}x(px)`,`${prefix}y(px)`);
  if(calibrated)header.push(`${prefix}x(m)`,`${prefix}y(m)`);
  header.push(`${prefix}状態`);
 }
 const perObject=series.map(o=>coordinateRows(o.data,options)),count=perObject[0]?.length||0;
 const rows=Array.from({length:count},(_,n)=>[...perObject[0][n].slice(0,2),...perObject.flatMap(item=>item[n].slice(2))]);
 return {header,rows};
}

export function coordinateText(data,separator='\t'){
 const options=separator===','?{timeDecimals:6,coordinateDecimals:6}:{};
 const {header,rows}=coordinateTable(data,options);
 return [header,...rows].map(row=>row.join(separator)).join('\r\n');
}

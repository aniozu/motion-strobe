import {formatSeconds} from './format.js';
import {calibrationBasis,coordinateOrigin,physicalCoordinates} from './calibration.js';
export const coordinateStatus=p=>p?.confidence==='skipped'?'打たない':p?.confidence==='missing'?'未検出':p?.confidence==='uncertain'?'要確認':p?.confidence==='auto'?'自動':p?.confidence==='manual'?'手動':'未指定';
export function coordinateRows(data={}){
 const {centers=[],size={}}=data,origin=coordinateOrigin(data),basis=calibrationBasis(data.calibration,size);
 return centers.map((p,n)=>{
  const pixels=physicalCoordinates(p,origin,null),meters=basis?physicalCoordinates(p,origin,basis):null,fixed=v=>(Math.abs(v)<.00005?0:v).toFixed(4);
  const row=[String(n+1),formatSeconds(p.time),pixels?fixed(pixels.x):'',pixels?fixed(pixels.y):''];
  if(basis)row.push(meters?fixed(meters.x):'',meters?fixed(meters.y):'');
  row.push(coordinateStatus(p),String(size.width||''),String(size.height||''));
  if(basis)row.push(String(basis.length),basis.distance.toFixed(4),(-basis.angle).toFixed(4),origin?origin.x.toFixed(4):'',origin?origin.y.toFixed(4):'');
  return row;
 });
}
export function coordinateText(data,separator='\t'){
 const calibrated=!!calibrationBasis(data.calibration,data.size),header=['コマ','時刻(s)','x(px)','y(px)'];
 if(calibrated)header.push('x(m)','y(m)');
 header.push('状態','画像幅(px)','画像高(px)');
 if(calibrated)header.push('校正長さ(m)','校正距離(px)','x軸角度(度)','原点x(px)','原点y(px)');
 return [header,...coordinateRows(data)].map(row=>row.join(separator)).join('\r\n');
}

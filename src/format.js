// Display precision only. Sampling and encoding retain their full timestamps.
let timeDecimals=2;
export function setTimeDecimals(value){if(Number.isInteger(value)&&value>=0&&value<=6)timeDecimals=value;return timeDecimals;}
export const formatSeconds=(value,decimals=timeDecimals)=>value.toFixed(decimals);

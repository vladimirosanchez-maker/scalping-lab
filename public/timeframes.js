export const FRAMES = { '5m':300, '15m':900, '1h':3600, '4h':14400, '1d':86400, '1w':604800, '1M':null };
export const frameLabel = frame => ({'1d':'D','1w':'W','1M':'M'}[frame] ?? frame.toUpperCase());
export function frameCoordinate(time, frame) {
  if(frame !== '1M') return time / FRAMES[frame];
  const d=new Date(time*1000), y=d.getUTCFullYear(), m=d.getUTCMonth();
  const start=Date.UTC(y,m,1)/1000, end=Date.UTC(y,m+1,1)/1000;
  return y*12+m+(time-start)/(end-start);
}
export function coordinateTime(index, frame) {
  if(frame !== '1M') return index*FRAMES[frame];
  const month=Math.floor(index), y=Math.floor(month/12), m=month%12;
  const start=Date.UTC(y,m,1)/1000, end=Date.UTC(y,m+1,1)/1000;
  return start+(index-month)*(end-start);
}
export const candleEnd = (time, frame) => coordinateTime(frameCoordinate(time,frame)+1,frame);

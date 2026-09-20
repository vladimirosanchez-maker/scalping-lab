import test from 'node:test';
import assert from 'node:assert/strict';
import {candleEnd,frameCoordinate,coordinateTime} from '../public/timeframes.js';
import {normalizeCandles} from '../public/market-schema.js';
const utc=s=>Date.parse(s)/1000;
test('Monthly candles close at next calendar month including leap years and December',()=>{
 for(const [start,end] of [['2024-02-01','2024-03-01'],['2025-02-01','2025-03-01'],['2026-12-01','2027-01-01']]) assert.equal(candleEnd(utc(start),'1M'),utc(end));
 const t=utc('2024-02-15'); assert.ok(Math.abs(coordinateTime(frameCoordinate(t,'1M'),'1M')-t)<0.001);
 assert.equal(frameCoordinate(utc('2024-03-01'),'1M')-frameCoordinate(utc('2024-02-01'),'1M'),1);
});
test('4H, daily and weekly lengths and short monthly history validation',()=>{
 assert.equal(candleEnd(0,'4h'),14400);assert.equal(candleEnd(0,'1d'),86400);assert.equal(candleEnd(0,'1w'),604800);
 const row={time:utc('2026-01-01')*1000,open:10,high:12,low:9,close:11,volume:4};
 assert.equal(normalizeCandles([row],1).length,1); assert.throws(()=>normalizeCandles([row]));
});

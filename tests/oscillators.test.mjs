import test from 'node:test';
import assert from 'node:assert/strict';
import {sma, squeezeMomentum} from '../public/oscillators.js';
const bars = (n, slope=1) => Array.from({length:n},(_,i)=>({time:i*300,open:100+i*slope,close:100+i*slope,high:101+i*slope,low:99+i*slope}));
test('RSI smoothing waits for 14 valid values and does not treat null as zero',()=>{
  assert.deepEqual(sma([null,10,20,30,null,50],3),[null,null,null,20,null,null]);
  const result=sma([null,...Array(14).fill(60)],14);
  assert.equal(result[13],null);assert.equal(result[14],60);
});
test('Squeeze regression matches an analytical linear ramp and its mirror',()=>{
  for(const slope of [1,-1]) {
    const out=squeezeMomentum(bars(80,slope));
    assert.equal(out[37].value,null);
    for(const point of out.slice(38)) assert.ok(Math.abs(point.value-9.5*slope)<1e-10);
    assert.equal(out[38].color,slope>0?'#00dd00':'#ff0000');
    assert.equal(out[79].color,slope>0?'#008000':'#800000');
    assert.equal(out[79].state,'off');
  }
});
test('BB multiplier and True Range change squeeze state and future bars cannot change history',()=>{
  const wide=bars(80,0).map((b,i)=>({...b,close:100+(i%2?1:-1),high:102,low:98}));
  assert.equal(squeezeMomentum(wide).at(-1).state,'on');
  assert.equal(squeezeMomentum(wide,20,10).at(-1).state,'off');
  const gaps=bars(80,0).map((b,i)=>({...b,close:i%2?110:90,high:(i%2?110:90)+0.1,low:(i%2?110:90)-0.1}));
  assert.equal(squeezeMomentum(gaps,20,2,20,1.5,true).at(-1).state,'on');
  assert.equal(squeezeMomentum(gaps,20,2,20,1.5,false).at(-1).state,'off');
  assert.deepEqual(squeezeMomentum(gaps).slice(0,60),squeezeMomentum(gaps.slice(0,60)));
});

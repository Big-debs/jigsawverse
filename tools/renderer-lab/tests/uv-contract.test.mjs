import test from 'node:test';
import assert from 'node:assert/strict';
import { imageUvRect, glyphUvRect } from '../src/uvContract.js';
import { KINDS } from '../src/demoState.js';

test('Assemble UVs preserve image corner order and reject invalid cells', () => {
  assert.deepEqual(imageUvRect(5,0,0),{u0:0,u1:.2,v0:.8,v1:1});
  const br=imageUvRect(5,4,4);
  assert.equal(br.u0,.8);assert.equal(br.u1,1);assert.equal(br.v0,0);
  assert.ok(Math.abs(br.v1-.2)<1e-12);
  assert.throws(()=>imageUvRect(5,5,0),RangeError);
});
test('Planar glyph cells are distinct and cover exactly six atlas regions', () => {
  const rects=KINDS.map(glyphUvRect);
  assert.equal(rects.length,6);
  assert.equal(new Set(rects.map(r=>r.u0+':'+r.v0)).size,6);
  for(const r of rects){
    assert.ok(r.u0>=0&&r.u1<=1&&r.v0>=0&&r.v1<=1);
    assert.ok(Math.abs((r.u1-r.u0)-1/3)<1e-8);
    assert.equal(r.v1-r.v0,.5);
  }
  assert.throws(()=>glyphUvRect('unknown'),RangeError);
});

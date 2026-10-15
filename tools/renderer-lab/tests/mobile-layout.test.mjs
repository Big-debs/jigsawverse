import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateViewportFit,MODE_FRAMING} from '../src/mobileLayout.js';

test('portrait camera preserves complete Assemble board + rack and Planar 6x6 rails',()=>{
  for(const family of ['assemble','planar']){
    const fit=calculateViewportFit(family,370,489);
    assert.ok(fit.worldWidth>=MODE_FRAMING[family].minWidth);
    assert.ok(fit.worldHeight>=MODE_FRAMING[family].minHeight);
    assert.ok(fit.cellPx>=40);
  }
});
test('narrow phones report glyph legibility risk without modifying puzzle rules',()=>{
  const fit=calculateViewportFit('planar',300,420);
  assert.ok(fit.glyphPx<32);
  assert.equal(fit.glyphNeedsReview,true);
  assert.equal(calculateViewportFit('assemble',300,420).glyphPx,null);
});
test('landscape compact surfaces advise testing instead of cropping the board',()=>{
  const fit=calculateViewportFit('assemble',740,335);
  assert.equal(fit.landscapeCompact,true);
  assert.ok(fit.worldWidth>=MODE_FRAMING.assemble.minWidth);
  assert.ok(fit.worldHeight>=MODE_FRAMING.assemble.minHeight);
});
test('invalid dimensions and game families rejected',()=>{
  assert.throws(()=>calculateViewportFit('planar-cube',390,500),RangeError);
  assert.throws(()=>calculateViewportFit('assemble',0,500),RangeError);
  assert.throws(()=>calculateViewportFit('planar',Infinity,500),RangeError);
});

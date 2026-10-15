import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackController } from '../src/feedbackController.js';

/** Deterministic browser API shims for storyboard interruption. */
function withAnimationHarness(run) {
  const prior = {
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let nextId = 0;
  const frames = new Map();
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.requestAnimationFrame = callback => {
    const id = ++nextId; frames.set(id, callback); return id;
  };
  globalThis.cancelAnimationFrame = id => { frames.delete(id); };
  const advance = (timestamp) => {
    const [id, callback] = frames.entries().next().value || [];
    if(!callback) return false;
    frames.delete(id);
    callback(timestamp);
    return true;
  };
  try { run({ frames, advance }); }
  finally {
    for(const [key, value] of Object.entries(prior)){
      if(value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test('interrupting an active preview clears stale aria-live progress', () => {
  withAnimationHarness(({frames, advance}) => {
    const node = { textContent: '' };
    const feedback = new FeedbackController(node);
    const originalClock = performance.now();
    feedback.playPreview();
    assert.equal(frames.size,1);
    advance(originalClock + 340);
    assert.match(node.textContent,/Illustration: drop/);
    assert.equal(frames.size,1);
    feedback.cancelPreview();
    assert.equal(frames.size,0);
    assert.equal(node.textContent,'Preview stopped · no game changes');
  });
});

test('stale queued frame cannot rewrite the interruption message', () => {
  withAnimationHarness(({frames}) => {
    const node = { textContent: '' };
    const feedback = new FeedbackController(node);
    feedback.playPreview();
    const callback = [...frames.values()][0];
    feedback.cancelPreview();
    callback(performance.now()+900);
    assert.equal(node.textContent,'Preview stopped · no game changes');
    assert.equal(frames.size,0);
  });
});

test('reset and mode/renderer switches may call cancellation repeatedly', () => {
  withAnimationHarness(({frames}) => {
    const node = { textContent: '' };
    const feedback = new FeedbackController(node);
    feedback.playPreview();
    feedback.cancelPreview();
    feedback.cancelPreview();
    assert.equal(frames.size,0);
    assert.equal(node.textContent,'Preview stopped · no game changes');
    feedback.playPreview();
    assert.equal(frames.size,1);
    feedback.cancelPreview();
    assert.equal(frames.size,0);
  });
});

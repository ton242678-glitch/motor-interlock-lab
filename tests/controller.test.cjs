const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Controller, resolveOutputs } = require('../controller.js');
const stopped = c => assert.deepEqual(c.outputs, { forward: false, reverse: false });
const enabled = () => { const c = new Controller(); c.enable(); return c; };

test('truth table: every boolean input combination preserves mutual exclusion', () => {
  for (const enable of [false, true]) for (const forward of [false, true])
    for (const reverse of [false, true]) for (const estop of [false, true]) {
      const o = resolveOutputs(enable, forward, reverse, estop);
      assert.ok(!(o.forward && o.reverse));
      if (!enable || estop || forward && reverse) assert.deepEqual(o, { forward: false, reverse: false });
      else assert.deepEqual(o, { forward, reverse });
    }
});
test('starts disarmed and never energizes on enable alone', () => {
  const c = new Controller(); stopped(c); assert.throws(() => c.request(true, false));
  c.enable(); assert.equal(c.state, 'IDLE'); stopped(c);
});
test('normal stop then reverse works; direct reversal is rejected without changing output', () => {
  const c = enabled(); c.request(true, false); assert.equal(c.outputs.forward, true);
  assert.throws(() => c.request(false, true), /先停止/);
  assert.equal(c.state, 'FORWARD'); assert.equal(c.outputs.forward, true);
  c.stop(); stopped(c); c.request(false, true); assert.equal(c.outputs.reverse, true);
  assert.throws(() => c.request(true, false), /先停止/); c.request(false, false); stopped(c);
});
test('conflict deenergizes, latches and needs reset then enable', () => {
  const c = enabled(); c.request(true, false); c.request(true, true);
  assert.equal(c.state, 'DIRECTION_FAULT'); stopped(c);
  c.stop(); assert.equal(c.state, 'DIRECTION_FAULT'); stopped(c);
  assert.throws(() => c.request(false, true)); assert.throws(() => c.enable());
  c.reset(); assert.equal(c.state, 'DISARMED'); assert.throws(() => c.request(true, false));
  c.enable(); c.request(false, true); assert.equal(c.outputs.reverse, true);
});
test('estop closes outputs in all states and release cannot auto-restart', () => {
  const cases = [() => new Controller(), enabled,
    () => { const c = enabled(); c.request(true, false); return c; },
    () => { const c = enabled(); c.request(false, true); return c; },
    () => { const c = enabled(); c.request(true, true); return c; }];
  for (const prepare of cases) {
    const c = prepare(); c.emergencyStop(); stopped(c); assert.equal(c.estopLatched, true);
    assert.throws(() => c.reset()); assert.throws(() => c.enable());
    c.stop(); assert.equal(c.state, 'ESTOP'); c.releaseEmergency(); stopped(c);
    assert.equal(c.state, 'ESTOP'); assert.throws(() => c.enable()); assert.throws(() => c.request(true, false));
    c.reset(); stopped(c); c.enable(); stopped(c); c.request(true, false); assert.equal(c.outputs.forward, true);
  }
});
test('reset while moving stops and never rearms itself', () => {
  const c = enabled(); c.request(false, true); c.reset(); stopped(c);
  assert.equal(c.state, 'DISARMED'); assert.throws(() => c.request(false, true));
});
test('invalid inputs and invalid release do not change state', () => {
  const c = enabled(); const before = c.snapshot();
  for (const [f, r] of [[1, false], [true, null], ['false', false], [undefined, true]]) assert.throws(() => c.request(f, r), TypeError);
  assert.throws(() => c.releaseEmergency()); assert.deepEqual(c.snapshot(), before);
});
test('returned snapshots and logs cannot mutate controller internals', () => {
  const c = enabled(); c.request(true, false);
  const snapshot = c.snapshot(); snapshot.inputs.reverse = true; snapshot.outputs.reverse = true;
  const events = c.events; events[0].inputs.reverse = true; events[0].outputs.forward = false; events.pop();
  assert.deepEqual(c.outputs, { forward: true, reverse: false }); assert.equal(c.inputs.reverse, false);
  assert.equal(c.events[0].outputs.forward, true);
});
test('logs have stable sequential steps and export chronological CSV with BOM', () => {
  const c = enabled(); c.request(true, false); c.stop();
  const rows = c.toCSV().split('\r\n'); assert.ok(rows[0].startsWith('\ufeff'));
  assert.equal(rows.length, c.events.length + 1); assert.ok(rows[1].startsWith('"1","创建会话"'));
  assert.ok(rows.at(-1).includes('"停止"')); assert.equal(c.events[0].action, '停止');
});
test('bounded event history retains latest 100 steps', () => {
  const c = enabled(); for (let i = 0; i < 150; i++) c.stop();
  assert.equal(c.events.length, 100); assert.equal(c.events[0].step, 152); assert.equal(c.events.at(-1).step, 53);
});
test('mixed command sequences cannot energize both outputs or energize while locked', () => {
  const commands = [c => c.enable(), c => c.request(true, false), c => c.request(false, true),
    c => c.request(true, true), c => c.stop(), c => c.reset(), c => c.emergencyStop(), c => c.releaseEmergency()];
  let seed = 314159;
  for (let run = 0; run < 30; run++) {
    const c = new Controller();
    for (let step = 0; step < 150; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      try { commands[seed % commands.length](c); } catch {}
      const o = c.outputs; assert.ok(!(o.forward && o.reverse));
      if (['DISARMED', 'DIRECTION_FAULT', 'ESTOP'].includes(c.state) || c.estopLatched) stopped(c);
    }
  }
});

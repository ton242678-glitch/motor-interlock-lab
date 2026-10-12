'use strict';
const controller = new MotorInterlock.Controller();
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function render() {
  const s = controller.snapshot();
  const active = ['IDLE', 'FORWARD', 'REVERSE'].includes(s.state);
  $('state').textContent = MotorInterlock.STATES[s.state];
  $('state').className = 'state-chip' + (['FORWARD', 'REVERSE'].includes(s.state) ? ' running' : s.alarm ? ' fault' : '');
  for (const direction of ['forward', 'reverse']) {
    for (const [prefix, data] of [['in', s.inputs], ['out', s.outputs]]) {
      const element = $(`${prefix}-${direction}`); element.textContent = Number(data[direction]);
      element.parentElement.classList.toggle('on', data[direction]);
    }
  }
  $('scene').dataset.direction = s.outputs.forward ? 'forward' : s.outputs.reverse ? 'reverse' : 'stopped';
  $('direction').textContent = s.outputs.forward ? '→ 正向运行' : s.outputs.reverse ? '← 反向运行' : '■ 停止';
  $('enable').disabled = s.state !== 'DISARMED';
  for (const id of ['forward', 'reverse', 'conflict']) $(id).disabled = !active;
  $('forward').classList.toggle('active', s.outputs.forward); $('reverse').classList.toggle('active', s.outputs.reverse);
  $('release').disabled = !s.estopLatched; $('reset').disabled = s.estopLatched;
  $('alarm').hidden = !s.alarm; $('alarm').textContent = s.alarm || '';
  const events = controller.events;
  $('log-count').textContent = `最近 ${events.length} 步`;
  $('events').innerHTML = events.map(e => `<tr><td>${e.step}</td><td>${escapeHTML(e.action)}</td><td>${escapeHTML(MotorInterlock.STATES[e.state])}</td><td>${+e.outputs.forward} / ${+e.outputs.reverse}</td><td>${escapeHTML(e.detail)}</td></tr>`).join('');
}
function bind(id, action, message) {
  $(id).addEventListener('click', () => {
    try { action(); $('feedback').textContent = message; $('feedback').className = 'feedback'; }
    catch (error) { $('feedback').textContent = error.message; $('feedback').className = 'feedback error'; }
    render();
  });
}
bind('enable', () => controller.enable(), '已使能，等待方向命令。');
bind('forward', () => controller.request(true, false), '正向运行。反转前请先停止。');
bind('reverse', () => controller.request(false, true), '反向运行。正转前请先停止。');
bind('stop', () => controller.stop(), '两个输出已关闭。已有锁定保持，正常停机后可以换向。');
bind('conflict', () => controller.request(true, true), '方向冲突已触发：两个输出为 0，需要复位和重新使能。');
bind('estop', () => controller.emergencyStop(), '急停锁存，两个输出为 0。');
bind('release', () => controller.releaseEmergency(), '急停已解除，仍需复位和使能，不会自动重启。');
bind('reset', () => controller.reset(), '已回到待使能。请主动使能，再发出方向命令。');
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([controller.toCSV()], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'motor-interlock-trace.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();

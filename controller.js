/* Educational motor control model; no PLC connection. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorInterlock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STATES = Object.freeze({
    DISARMED: '待使能', IDLE: '已使能 · 停止', FORWARD: '正向运行',
    REVERSE: '反向运行', DIRECTION_FAULT: '方向冲突锁定', ESTOP: '急停锁定'
  });
  const ENABLED = new Set(['IDLE', 'FORWARD', 'REVERSE']);
  function resolveOutputs(enabled, forward, reverse, estop) {
    for (const value of [enabled, forward, reverse, estop]) {
      if (typeof value !== 'boolean') throw new TypeError('输入必须为布尔值');
    }
    const permit = enabled && !estop && !(forward && reverse);
    return { forward: permit && forward, reverse: permit && reverse };
  }
  class Controller {
    #state = 'DISARMED';
    #latched = false;
    #inputs = { forward: false, reverse: false };
    #events = [];
    #sequence = 0;
    constructor() { this.#log('创建会话', '先使能，再发出方向命令'); }
    get state() { return this.#state; }
    get estopLatched() { return this.#latched; }
    get inputs() { return { ...this.#inputs }; }
    get outputs() { return resolveOutputs(ENABLED.has(this.#state), this.#inputs.forward, this.#inputs.reverse, this.#latched); }
    get events() { return this.#events.map(event => ({ ...event, inputs: { ...event.inputs }, outputs: { ...event.outputs } })); }
    get alarm() {
      if (this.#state === 'DIRECTION_FAULT') return '方向冲突：两个输出均关闭。先复位，再重新使能。';
      if (this.#state === 'ESTOP') return this.#latched ? '急停已锁存：解除急停 → 复位 → 重新使能。' : '急停已解除：仍需复位和重新使能。';
      return null;
    }
    #require(condition, message) { if (!condition) throw new Error(message); }
    #log(action, detail) {
      this.#events.unshift({ step: ++this.#sequence, action, detail, state: this.#state,
        inputs: this.inputs, outputs: this.outputs, estopLatched: this.#latched });
      this.#events = this.#events.slice(0, 100);
    }
    enable() {
      this.#require(this.#state === 'DISARMED' && !this.#latched, '请先处理锁定并复位，再使能');
      this.#state = 'IDLE'; this.#inputs = { forward: false, reverse: false };
      this.#log('使能', '等待方向命令，不自动启动');
    }
    request(forward, reverse) {
      resolveOutputs(true, forward, reverse, false); // Validate before modifying state.
      this.#require(ENABLED.has(this.#state) && !this.#latched, '请先使能，或处理锁定并复位');
      if (!forward && !reverse) { this.stop(); return; }
      if (forward && reverse) {
        this.#inputs = { forward, reverse }; this.#state = 'DIRECTION_FAULT';
        this.#log('同时请求正反转', '互锁动作：两个输出均关闭，故障保持'); return;
      }
      const next = forward ? 'FORWARD' : 'REVERSE';
      if (this.#state !== 'IDLE' && this.#state !== next) {
        this.#log('换向被拦截', '当前方向继续保持；请先停止，再请求另一方向');
        throw new Error('换向前请先停止。当前方向保持，未直接换向。');
      }
      this.#inputs = { forward, reverse }; this.#state = next;
      this.#log(forward ? '请求正转' : '请求反转', '仅允许一个方向输出');
    }
    stop() {
      this.#inputs = { forward: false, reverse: false };
      if (ENABLED.has(this.#state)) this.#state = 'IDLE';
      this.#log('停止', '两个输出均关闭；已有故障或急停锁定继续保持');
    }
    emergencyStop() {
      this.#latched = true; this.#state = 'ESTOP';
      this.#inputs = { forward: false, reverse: false };
      this.#log('触发急停', '两个输出立即关闭，禁止自动恢复');
    }
    releaseEmergency() {
      this.#require(this.#latched, '当前没有锁存的急停');
      this.#latched = false;
      this.#log('解除急停', '保持停机锁定；仍需复位和使能');
    }
    reset() {
      this.#require(!this.#latched, '请先解除急停，再复位');
      this.#inputs = { forward: false, reverse: false }; this.#state = 'DISARMED';
      this.#log('复位', '清除锁定，回到待使能，不自动启动');
    }
    snapshot() { return { state: this.state, inputs: this.inputs, outputs: this.outputs, estopLatched: this.estopLatched, alarm: this.alarm }; }
    toCSV() {
      const rows = [['步骤', '操作', '状态', '正转请求', '反转请求', '正转输出', '反转输出', '急停锁存', '说明'],
        ...this.events.reverse().map(e => [e.step, e.action, e.state, +e.inputs.forward, +e.inputs.reverse,
          +e.outputs.forward, +e.outputs.reverse, +e.estopLatched, e.detail])];
      return '\ufeff' + rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    }
  }
  return { Controller, STATES, resolveOutputs };
});

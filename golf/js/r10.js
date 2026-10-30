// Golf Improvement App — Garmin Approach R10 Bluetooth protocol (Web Bluetooth).
// Classic script: shares globals with the other files; load order is set in golf-improvement-app.html.

// ════════════════════════════════════════════════════════════
// GARMIN R10 — direct Bluetooth connection (Web Bluetooth)
// A JavaScript port of the reverse-engineered protocol documented by the
// open-source 10over project (github.com/divotmaker/10over, MIT/Apache-2.0):
//   BLE MultiLink → COBS framing → GFDI messages (CRC-16/ARC) → protobuf.
// Unofficial: Garmin does not publish this protocol, so an R10 firmware
// update could change it. Needs Chrome/Edge over https:// or localhost.
// ════════════════════════════════════════════════════════════
const R10_UUID    = s => `6a4e${s}-667b-11e3-949a-0800200c9a66`;
const R10_SERVICE = R10_UUID('2800'); // MultiLink service
const R10_CHAR_RX = R10_UUID('2810'); // notifications + REGISTER command
const R10_CHAR_TX = R10_UUID('2820'); // GFDI writes (handle-prefixed)

const GFDI = { ACK: 5000, FIT_DEF: 5011, FIT_DATA: 5012, DEVICE_INFO: 5024, PB_REQ: 5043, PB_RESP: 5044, CONFIG: 5050 };
const R10_STATES = ['Standby', 'Interference test', 'Waiting', 'Recording', 'Processing', 'Error'];
const R10_ERRORS = ['Unknown error', 'Overheating', 'Radar saturation — move it away from walls, nets or metal', 'Unit tilted — level the R10'];
const R10_MAX_REARM = 8; // automatic re-arm attempts after an error state
const MS_TO_MPH  = 2.23694;

// CRC-16/ARC, nibble-table form used by Garmin GFDI ("123456789" → 0xBB3D)
const R10_CRC_T = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
                   0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
function r10Crc(bytes) {
  let crc = 0;
  for (const b of bytes) {
    const t = ((crc >> 4) & 0x0FFF) ^ R10_CRC_T[crc & 0xF] ^ R10_CRC_T[b & 0xF];
    crc = ((t >> 4) & 0x0FFF) ^ R10_CRC_T[t & 0xF] ^ R10_CRC_T[b >> 4];
  }
  return crc;
}

// Standard COBS: removes 0x00 bytes so 0x00 can delimit frames
function r10CobsEncode(data) {
  const out = [0];
  let codeIdx = 0, code = 1;
  for (const b of data) {
    if (b === 0) { out[codeIdx] = code; codeIdx = out.length; out.push(0); code = 1; continue; }
    out.push(b);
    if (++code === 0xFF) { out[codeIdx] = code; codeIdx = out.length; out.push(0); code = 1; }
  }
  out[codeIdx] = code;
  return out;
}
function r10CobsDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const code = data[i++];
    if (code === 0) throw new Error('COBS: unexpected zero');
    for (let k = 1; k < code; k++) {
      if (i >= data.length) throw new Error('COBS: truncated');
      out.push(data[i++]);
    }
    if (code < 0xFF && i < data.length) out.push(0);
  }
  return out;
}

// GFDI frame: [length u16][type u16][payload][crc u16], little-endian.
// Devices may send a compressed header: [length][type-5000 u8][txn | 0x80].
function r10Frame(type, payload) {
  const len = 2 + 2 + payload.length + 2;
  const f = [len & 0xFF, len >> 8, type & 0xFF, type >> 8, ...payload];
  const crc = r10Crc(f);
  f.push(crc & 0xFF, crc >> 8);
  return f;
}
function r10Ack(origType, status = 0, payload = []) {
  return r10Frame(GFDI.ACK, [origType & 0xFF, origType >> 8, status, ...payload]);
}
function r10ParseFrame(f) {
  if (f.length < 6) throw new Error('GFDI: frame too short');
  const crc = f[f.length - 2] | (f[f.length - 1] << 8);
  if (crc !== r10Crc(f.slice(0, -2))) throw new Error('GFDI: CRC mismatch');
  const type = (f[3] & 0x80) ? f[2] + 5000 : (f[2] | (f[3] << 8));
  return { type, payload: f.slice(4, -2) };
}

// Minimal protobuf codec — just what the R10 messages need
const pb = {
  varint(n) {
    const o = [];
    do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 0x80; o.push(b); } while (n);
    return o;
  },
  msg(field, bytes) { return [...pb.varint(field * 8 + 2), ...pb.varint(bytes.length), ...bytes]; },
  uint(field, n)    { return [...pb.varint(field * 8), ...pb.varint(n)]; },
  // Returns { fieldNumber: [values...] }; length-delimited values stay as byte arrays
  decode(bytes) {
    bytes = Array.from(bytes);
    const fields = {};
    let i = 0;
    const readVarint = () => {
      let r = 0, s = 1, b;
      do {
        b = bytes[i++];
        if (b === undefined) throw new Error('protobuf: truncated');
        r += (b & 0x7F) * s; s *= 128;
      } while (b & 0x80);
      return r;
    };
    const fixed = (n, get) => {
      const v = get(new DataView(new Uint8Array(bytes.slice(i, i + n)).buffer));
      i += n; return v;
    };
    while (i < bytes.length) {
      const key = readVarint(), f = Math.floor(key / 8), w = key & 7;
      let v;
      if (w === 0) v = readVarint();
      else if (w === 2) { const n = readVarint(); v = bytes.slice(i, i + n); i += n; }
      else if (w === 5) v = fixed(4, d => d.getFloat32(0, true));
      else if (w === 1) v = fixed(8, d => d.getFloat64(0, true));
      else throw new Error('protobuf: unsupported wire type ' + w);
      (fields[f] = fields[f] || []).push(v);
    }
    return fields;
  },
  sub(fields, f) { const v = fields && fields[f]; return v ? pb.decode(v[v.length - 1]) : null; },
  num(fields, f) { const v = fields && fields[f]; return v ? v[v.length - 1] : undefined; },
};

// Smart{ EventSharing(30){ subscribe_request{ alerts{ type: LAUNCH_MONITOR(8) } } } }
const R10_SUBSCRIBE = pb.msg(30, pb.msg(1, pb.msg(1, pb.uint(1, 8))));
// Smart{ LaunchMonitor(38){ wake_up_request{} } }
const R10_WAKEUP    = pb.msg(38, pb.msg(3, []));

const r10Str = s => [s.length, ...Array.from(s, c => c.charCodeAt(0))];
// Host reply to the device's 5024: protocol 150, product/unit unset, app v100
const R10_HOST_INFO = [150, 0, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 100, 0, 0xFF, 0xFF,
                       ...r10Str('Golf Improvement'), ...r10Str('Web'), ...r10Str('Browser'), 0x01];
// Host 5050: 13-byte capability bitmap with bit 30 (SwingSensor) set
const R10_HOST_CAPS = [13, 0x00, 0x00, 0x00, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const R10 = {
  device: null, rx: null, tx: null,
  handle: 0, phase: 'idle', buf: [], reqId: 1,
  recentShots: [], lastState: null, lastShot: null, info: null,
  status: 'disconnected', statusText: 'Not connected',
  listeners: {}, writeChain: Promise.resolve(), timer: null, closing: false,
  log: [], // recent connection events and shots, for troubleshooting (Copy log on the R10 panel)

  addLog(msg) {
    this.log.push(`${new Date().toLocaleTimeString()}  ${msg}`);
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
  },

  supported()  { return !!navigator.bluetooth && window.isSecureContext; },
  unsupportedReason() {
    if (!window.isSecureContext) return 'Open the app from https:// or http://localhost (not as a file) to use Bluetooth.';
    if (!navigator.bluetooth) return 'This browser can\'t use Bluetooth. Use Chrome or Edge on Windows, Mac, Android or ChromeOS (iPhone and iPad don\'t support it).';
    return '';
  },
  isConnected() { return this.phase === 'active'; },
  on(evt, fn)  { (this.listeners[evt] = this.listeners[evt] || []).push(fn); },
  emit(evt, ...a) { (this.listeners[evt] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); },
  setStatus(status, text) {
    if (status !== this.status || text !== this.statusText) this.addLog(`status ${status}: ${text}`);
    this.status = status; this.statusText = text; this.emit('status', status, text);
    if (this.phase === 'active') this.autoTries = 0;
    r10KeepAwake(this.phase !== 'idle');
  },

  async connect() {
    this.addLog('connect: ' + navigator.userAgent);
    if (!this.supported()) { this.setStatus('error', this.unsupportedReason()); return; }
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Approach R10' }, { manufacturerData: [{ companyIdentifier: 0x0087 }] }],
        optionalServices: [R10_SERVICE],
      });
    } catch (e) {
      if (e.name !== 'NotFoundError') this.setStatus('error', 'Bluetooth error: ' + e.message);
      return; // NotFoundError = the user closed the device chooser
    }
    this.wanted = true;
    if (this.device !== device) {
      this.device = device;
      device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
    }
    await this.open();
  },

  async reconnect() { if (this.device) await this.open(); },

  async open() {
    this.reset();
    this.setStatus('connecting', 'Connecting…');
    try {
      const server = await this.device.gatt.connect();
      const svc = await server.getPrimaryService(R10_SERVICE);
      this.rx = await svc.getCharacteristic(R10_CHAR_RX);
      this.tx = await svc.getCharacteristic(R10_CHAR_TX);
      this._onNotify = this._onNotify || (e => {
        const v = e.target.value;
        this.onNotify(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      // Remove first so a reconnect can never deliver each notification twice
      this.rx.removeEventListener('characteristicvaluechanged', this._onNotify);
      this.rx.addEventListener('characteristicvaluechanged', this._onNotify);
      await this.rx.startNotifications();
      this.phase = 'registering';
      this.setStatus('connecting', 'Linking to the R10…');
      this.armTimeout();
      // MultiLink REGISTER: reserved, cmd 0, txn_id u64 = 1, service 1 (GFDI), reserved
      await this.write(this.rx, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    } catch (e) {
      this.fail('Couldn\'t connect: ' + e.message + '. Make sure the R10 is on and paired in your Bluetooth settings.');
    }
  },

  reset() {
    clearTimeout(this.timer);
    this.handle = 0; this.phase = 'idle'; this.buf = []; this.reqId = 1;
    this.lastState = null; this.closing = false; this.writeChain = Promise.resolve();
    clearTimeout(this.rearmTimer); this.errorRetries = 0; this.lastError = null;
  },

  armTimeout() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.phase === 'active') return;
      this.fail(this.phase === 'registering'
        ? 'The R10 didn\'t answer. Pair it in your computer\'s Bluetooth settings first, and close the Garmin Golf app — the R10 only talks to one app at a time.'
        : 'The R10 connected but didn\'t finish setup. Turn the R10 off and on, then try again.');
    }, 15000);
  },

  disconnect() {
    this.closing = true; this.wanted = false;
    clearTimeout(this.timer);
    try { this.device && this.device.gatt.connected && this.device.gatt.disconnect(); } catch {}
    this.phase = 'idle';
    this.setStatus('disconnected', 'Not connected');
  },

  fail(msg) {
    this.closing = true; // keep this message instead of the generic "disconnected" one
    clearTimeout(this.timer);
    try { this.device && this.device.gatt.connected && this.device.gatt.disconnect(); } catch {}
    this.phase = 'idle';
    this.setStatus('error', msg);
  },

  onDisconnected() {
    clearTimeout(this.timer);
    const wasClosing = this.closing;
    this.phase = 'idle';
    if (!wasClosing) this.setStatus('disconnected', 'Connection lost — the R10 may be off or out of range.');
    r10AutoReconnect(3000);
  },

  // GATT operations must not overlap, so writes are chained
  write(ch, bytes) {
    const data = new Uint8Array(bytes);
    const run = () => (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse)
      ? ch.writeValueWithoutResponse(data)
      : (ch.writeValueWithResponse ? ch.writeValueWithResponse(data) : ch.writeValue(data));
    const p = this.writeChain.then(run, run);
    this.writeChain = p.catch(() => {});
    return p;
  },

  // [0x00][COBS(frame)][0x00], split into 20-byte writes each prefixed by the handle
  sendFrame(frame) {
    const wire = [0, ...r10CobsEncode(frame), 0];
    const writes = [];
    for (let i = 0; i < wire.length; i += 19) writes.push(this.write(this.tx, [this.handle, ...wire.slice(i, i + 19)]));
    return Promise.all(writes).catch(e => this.fail('Lost contact with the R10 (' + e.message + ').'));
  },

  // 5043 with the 14-byte fragmentation header: req_id u16, offset u32, total u32, chunk u32
  sendProto(pbBytes) {
    const id = this.reqId++ & 0xFFFF, n = pbBytes.length;
    const u32 = v => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
    return this.sendFrame(r10Frame(GFDI.PB_REQ, [id & 0xFF, id >> 8, ...u32(0), ...u32(n), ...u32(n), ...pbBytes]));
  },

  onNotify(chunk) {
    chunk = Array.from(chunk);
    if (this.phase === 'registering' && chunk.length >= 15 && chunk[1] === 0x01) {
      // REGISTER_RESPONSE: status at [12], assigned handle at [13]
      const status = chunk[12];
      this.addLog(`register response: status ${status}, handle ${chunk[13]}`);
      if (status !== 0) {
        const why = { 2: 'it\'s waiting for authentication — pair the R10 in your Bluetooth settings first',
                      3: 'it\'s already in use — close the Garmin Golf app', 4: 'it rejected the connection' }[status] || 'it refused the link';
        this.fail(`The R10 couldn't link because ${why}.`);
        return;
      }
      this.handle = chunk[13];
      this.phase = 'handshake';
      this.setStatus('connecting', 'Handshaking…');
      return;
    }
    if (chunk[0] !== this.handle) return; // traffic for another MultiLink service
    this.buf.push(...chunk.slice(1));
    if (this.buf.length > 65536) this.buf = [];
    this.drain();
  },

  drain() {
    for (;;) {
      const s = this.buf.indexOf(0);
      if (s < 0) { this.buf = []; return; }
      const e = this.buf.indexOf(0, s + 1);
      if (e < 0) { this.buf = this.buf.slice(s); return; } // wait for the rest
      const body = this.buf.slice(s + 1, e);
      if (!body.length) { this.buf = this.buf.slice(e); continue; } // "00 00": second zero starts the next frame
      this.buf = this.buf.slice(e + 1);
      let frame;
      try { frame = r10ParseFrame(r10CobsDecode(body)); }
      catch (err) { console.warn('R10:', err.message); this.addLog('bad frame: ' + err.message); continue; }
      this.dispatch(frame);
    }
  },

  dispatch({ type, payload }) {
    switch (type) {
      case GFDI.DEVICE_INFO:
        this.info = r10ParseDeviceInfo(payload);
        this.addLog('device info ' + JSON.stringify(this.info));
        this.sendFrame(r10Ack(GFDI.DEVICE_INFO, 0, R10_HOST_INFO));
        this.phase = 'capabilities';
        break;
      case GFDI.CONFIG:
        this.addLog('device capabilities received');
        this.sendFrame(r10Ack(GFDI.CONFIG, 0));
        this.sendFrame(r10Frame(GFDI.CONFIG, R10_HOST_CAPS));
        this.phase = 'capabilitiesAck';
        break;
      case GFDI.FIT_DEF:
      case GFDI.FIT_DATA:
        this.sendFrame(r10Ack(type, 0, [0x00]));
        break;
      case GFDI.ACK: {
        if (payload.length < 3) break;
        const orig = payload[0] | (payload[1] << 8), status = payload[2];
        if (status !== 0) { this.fail(`The R10 rejected message ${orig} (status ${status}).`); break; }
        this.addLog(`ack ${orig} (phase ${this.phase})`);
        if (orig === GFDI.CONFIG && this.phase === 'capabilitiesAck') {
          this.phase = 'subscribing';
          this.setStatus('connecting', 'Subscribing to swing data…');
          this.sendProto(R10_SUBSCRIBE);
        }
        break;
      }
      case GFDI.PB_REQ:
      case GFDI.PB_RESP:
        try { this.handleProto(payload); } catch (err) { console.warn('R10:', err.message); this.addLog('bad message: ' + err.message); }
        this.sendFrame(r10Ack(type, 0)); // the R10 resends un-ACKed alerts
        break;
    }
  },

  handleProto(payload) {
    if (payload.length < 14) return;
    const chunk = payload[10] | (payload[11] << 8) | (payload[12] << 16) | (payload[13] << 24);
    const smart = pb.decode(payload.slice(14, 14 + chunk));
    const es = pb.sub(smart, 30), lm = pb.sub(smart, 38);

    if (es) {
      if (es[2]) { // subscribe_response → wake the radar
        if (this.phase === 'subscribing') {
          this.phase = 'waking';
          this.setStatus('connecting', 'Waking the R10…');
          this.sendProto(R10_WAKEUP);
        }
        return;
      }
      const notif = pb.sub(es, 3);
      const details = notif && pb.sub(notif, 1001); // LaunchMonitor AlertDetails extension
      if (!details) return;
      // An alert can carry several parts at once (e.g. the error state *and* its reason),
      // so read the error first rather than stopping at the state
      if (details[3]) {
        const err = pb.sub(details, 3), code = pb.num(err, 1) ?? 0;
        this.lastError = R10_ERRORS[code] || `Unknown error (${code})`;
        this.addLog(`device error ${code}: ${this.lastError} ${JSON.stringify(err)}`);
        this.emit('deviceError', this.lastError);
      }
      if (details[2]) return this.handleShot(pb.sub(details, 2));
      if (details[1]) {
        const st = pb.num(pb.sub(details, 1), 1) ?? 0;
        if (st === 5) this.addLog('error alert ' + JSON.stringify(details));
        return this.handleState(st);
      }
      return;
    }

    if (lm && lm[4]) { // wake_up_response: 0 SUCCESS, 1 ALREADY_AWAKE
      const status = pb.num(pb.sub(lm, 4), 1) ?? 0;
      this.addLog('wake response ' + status);
      if (this.phase === 'waking') {
        this.phase = 'active';
        clearTimeout(this.timer);
        this.setStatus('ready', 'Connected — waiting for the radar');
      }
      if (status === 1) this.handleState(2); // already armed
    }
  },

  handleState(st) {
    if (st === this.lastState) return;
    this.lastState = st;
    this.addLog('radar state ' + st);
    if (st === 0 && this.phase === 'active') this.sendProto(R10_WAKEUP); // dropped to standby: re-arm
    if (st === 2) { this.errorRetries = 0; this.lastError = null; }
    if (st === 5) this.rearmAfterError();
    this.emit('state', st);
    const text = { 0: 'Standby — re-arming…', 1: 'Checking for interference…', 2: 'Ready — swing away',
                   3: 'Recording swing…', 4: 'Processing…',
                   5: `R10 error: ${this.lastError || 'no reason given'}${(this.errorRetries || 0) <= R10_MAX_REARM ? ' — re-arming…' : ''}` }[st] || 'Connected';
    this.setStatus(st === 5 ? 'error' : st === 2 ? 'ready' : 'busy', text);
  },

  // After an error state the radar stays off until it's woken again: retry a few times,
  // so fixing the cause (levelling the unit, moving it back from a net) is enough
  rearmAfterError() {
    clearTimeout(this.rearmTimer);
    this.errorRetries = (this.errorRetries || 0) + 1;
    if (this.errorRetries > R10_MAX_REARM) { this.addLog('gave up re-arming after errors'); return; }
    this.rearmTimer = setTimeout(() => {
      if (this.phase !== 'active' || this.lastState !== 5) return;
      this.addLog(`re-arming after error (try ${this.errorRetries})`);
      this.lastState = null; // so the next state report is shown even if it's the error again
      this.sendProto(R10_WAKEUP);
    }, 4000);
  },

  handleShot(m) {
    const id = pb.num(m, 1) ?? 0, now = Date.now();
    // The R10 retransmits until ACKed — drop duplicates by shot id
    this.recentShots = this.recentShots.filter(s => now - s.t < 60000);
    if (this.recentShots.some(s => s.id === id)) { this.addLog(`shot ${id} repeated (ignored)`); return; }
    this.recentShots.push({ id, t: now });

    const ball = pb.sub(m, 3) || {}, club = pb.sub(m, 4) || {};
    const r1 = v => (v === undefined || !isFinite(v)) ? null : Math.round(v * 10) / 10;
    const clubMs = pb.num(club, 1), ballMs = pb.num(ball, 3);
    const shot = {
      id, at: now,
      clubMph: clubMs ? r1(clubMs * MS_TO_MPH) : null, // 0 means the swing was too slow to read
      ballMph: ballMs ? r1(ballMs * MS_TO_MPH) : null,
      launch: r1(pb.num(ball, 1)), direction: r1(pb.num(ball, 2)), spin: r1(pb.num(ball, 5)),
      spinAxis: r1(pb.num(ball, 4)), // degrees; tilts the spin to curve the ball (draw/fade)
      face: r1(pb.num(club, 2)), path: r1(pb.num(club, 3)), attack: r1(pb.num(club, 4)),
    };
    this.lastShot = shot;
    this.addLog('shot ' + JSON.stringify(shot));
    this.emit('shot', shot);
  },
};

function r10ParseDeviceInfo(p) {
  if (p.length < 12) return null;
  const u16 = i => p[i] | (p[i + 1] << 8);
  let pos = 12;
  const str = () => {
    const n = p[pos++] || 0;
    const s = String.fromCharCode(...p.slice(pos, pos + n));
    pos += n; return s;
  };
  return { protocol: u16(0), product: u16(2), software: u16(8), friendlyName: str(), deviceName: str(), model: str() };
}

// ════════════════════════════════════════════════════════════
// STAYING CONNECTED ON A PHONE
// A phone that sleeps, or a switch to another app, pauses the page and drops
// the R10. So while connected the screen is kept awake (Wake Lock), and if the
// link drops anyway it's re-opened when the page is back in front — up to
// three tries, so an R10 that's switched off isn't retried forever.
// ════════════════════════════════════════════════════════════
let r10Wake = null;
async function r10KeepAwake(on) {
  if (!('wakeLock' in navigator)) return;
  let mine = false;
  try {
    if (on && !r10Wake && !r10KeepAwake.asking && document.visibilityState === 'visible') {
      r10KeepAwake.asking = mine = true;
      const w = await navigator.wakeLock.request('screen');
      if (R10.phase === 'idle') return w.release(); // disconnected while asking
      r10Wake = w;
      w.addEventListener('release', () => { if (r10Wake === w) r10Wake = null; });
    } else if (!on && r10Wake) { const w = r10Wake; r10Wake = null; await w.release(); }
  } catch (e) { R10.addLog('screen wake lock unavailable: ' + e.message); }
  finally { if (mine) r10KeepAwake.asking = false; }
}
function r10AutoReconnect(delay) {
  clearTimeout(r10AutoReconnect.timer);
  r10AutoReconnect.timer = setTimeout(() => {
    if (!R10.wanted || !R10.device || R10.phase !== 'idle' || document.visibilityState !== 'visible') return;
    if ((R10.autoTries = (R10.autoTries || 0) + 1) > 3) return;
    R10.addLog(`auto-reconnect (try ${R10.autoTries} of 3)`);
    R10.reconnect();
  }, delay);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (R10.phase !== 'idle') r10KeepAwake(true); // the browser releases the lock when the page is hidden
  else r10AutoReconnect(500);
});

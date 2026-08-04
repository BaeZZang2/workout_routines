/* 내 루틴 — 운동 루틴 ↔ 내 폰 동영상 연결 PWA */
'use strict';

const BUILD = '2026-08-04a';
const PROBLEMS = [];
let rendered = false;

function fatal(msg) {
  PROBLEMS.push(msg);
  const v = document.getElementById('view');
  if (!v || rendered) return;
  v.innerHTML =
    '<div class="card" style="border-color:#e04b3c">' +
    '<h2 style="color:#e04b3c">앱을 시작하지 못했습니다</h2>' +
    '<div class="it-sub" style="white-space:pre-wrap;word-break:break-all;color:var(--text)">' +
    String(msg).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) +
    '</div><button class="btn" style="width:100%;margin-top:12px" onclick="location.reload()">다시 시도</button></div>';
}
window.addEventListener('error', (e) => fatal(`${e.message}\n${e.filename || ''}:${e.lineno || ''}`));
window.addEventListener('unhandledrejection', (e) => {
  PROBLEMS.push('rejection: ' + ((e.reason && e.reason.message) || e.reason));
});

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const $ = (s) => document.querySelector(s);

/* ---------- 아이콘 ---------- */
const ICON = {
  play: '<path d="m8 5 11 7-11 7z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  unlink: '<path d="M4 4l16 16M10 13a5 5 0 0 0 6.5.5M13.5 7.5A5 5 0 0 1 20 10l-2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
  yt: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 3-5 3z"/>',
  paste: '<rect x="7" y="4" width="12" height="16" rx="2"/><path d="M5 8v10a2 2 0 0 0 2 2h1"/>',
  open: '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
};
const ic = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- IndexedDB ---------- */
const DB_NAME = 'workout-routine';
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos', { keyPath: 'id' });
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
async function idb(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.onerror = () => rej(tx.error);
    tx.oncomplete = () => res(req && req.result);
  });
}
const dbGet = (s, k) => idb(s, 'readonly', (o) => o.get(k));
const dbAll = (s) => idb(s, 'readonly', (o) => o.getAll());
const dbPut = (s, v, k) => idb(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k)));
const dbDel = (s, k) => idb(s, 'readwrite', (o) => o.delete(k));

/* ---------- 상태 ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = () => dayKey(new Date());
const todayIdx = () => (new Date().getDay() + 6) % 7;

/* 이번 주(월요일 시작) 날짜 — 월요일이 지나면 자동으로 새 주가 되어 체크가 초기화된다 */
let _week = null;
function weekInfo() {
  const tk = todayKey();
  if (_week && _week.today === tk) return _week;
  const n = new Date();
  const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - todayIdx());
  const dates = Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  _week = { today: tk, dates, keys: dates.map(dayKey) };
  return _week;
}

function newTab(name) {
  return {
    id: uid(),
    name,
    days: DAYS.map(() => [
      { id: uid(), name: '운동 1', videoId: null, base: true },
      { id: uid(), name: '운동 2', videoId: null, base: true },
    ]),
  };
}
function blankState() {
  const t = newTab('루틴 1');
  return { v: 1, activeTabId: t.id, tabs: [t], logs: {}, openDay: todayIdx() };
}

let S = blankState();
let VIDEOS = new Map();
let NAV = 'routine';
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { dbPut('meta', S, 'state').catch(() => toast('저장에 실패했습니다')); }, 120);
}
const activeTab = () => S.tabs.find((t) => t.id === S.activeTabId) || S.tabs[0];

function findItem(itemId) {
  for (const t of S.tabs) for (let d = 0; d < 7; d++) {
    const i = t.days[d].findIndex((x) => x.id === itemId);
    if (i >= 0) return { tab: t, day: d, idx: i, item: t.days[d][i] };
  }
  return null;
}

/* ---------- 유틸 ---------- */
function toast(msg, ms) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, ms || 2000);
}
const fmtDur = (s) => {
  if (!s || !isFinite(s)) return '';
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
};
const fmtSize = (b) => {
  if (!b) return '';
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};

/* ---------- 동영상 선택 / 저장 ---------- */
const hasPicker = typeof window.showOpenFilePicker === 'function';

function pickViaInput() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'video/*';
    inp.style.position = 'fixed';
    inp.style.left = '-9999px';
    document.body.appendChild(inp);
    let done = false;
    const finish = (f) => { if (done) return; done = true; inp.remove(); resolve(f); };
    inp.addEventListener('change', () => finish(inp.files && inp.files[0] ? inp.files[0] : null));
    inp.addEventListener('cancel', () => finish(null));
    inp.click();
  });
}

async function pickVideo() {
  if (hasPicker) {
    try {
      const opts = { multiple: false, startIn: 'videos' };
      let handles;
      try {
        handles = await window.showOpenFilePicker({
          ...opts,
          types: [{ description: '동영상', accept: { 'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.3gp', '.avi'] } }],
        });
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        handles = await window.showOpenFilePicker(opts);
      }
      const handle = handles[0];
      const file = await handle.getFile();
      return { file, handle };
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      // 피커가 실제로는 동작하지 않는 환경 → 입력 방식으로 폴백
    }
  }
  const file = await pickViaInput();
  return file ? { file, handle: null } : null;
}

async function probe(file) {
  const out = { duration: 0, poster: null, w: 0, h: 0 };
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.muted = true;
  v.playsInline = true;
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 8000);
      v.onloadedmetadata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error('decode')); };
      v.src = url;
    });
    out.duration = v.duration || 0;
    out.w = v.videoWidth; out.h = v.videoHeight;
    await new Promise((res) => {
      const t = setTimeout(res, 4000);
      v.onseeked = () => { clearTimeout(t); res(); };
      v.currentTime = Math.min(1.2, (v.duration || 3) / 3);
    });
    const cw = 176;
    const ch = Math.max(1, Math.round(cw * ((v.videoHeight || 9) / (v.videoWidth || 16))));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(v, 0, 0, cw, ch);
    out.poster = c.toDataURL('image/jpeg', 0.55);
  } catch (_) { /* 메타/썸네일 실패해도 재생은 가능 */ }
  v.src = '';
  URL.revokeObjectURL(url);
  return out;
}

/* ---------- 유튜브 ---------- */
const isYT = (v) => !!v && v.kind === 'yt';
const YT_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'];

function parseStart(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Math.min(+t, 86399);
  const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function parseYT(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return { id: s, start: 0 };
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (_) { return null; }
  const host = u.hostname.replace(/^(www|m)\./i, '').toLowerCase();
  let id = '';
  if (host === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0];
  } else if (YT_HOSTS.includes(host)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (!/^[\w-]{11}$/.test(id)) return null;
  return { id, start: parseStart(u.searchParams.get('t') || u.searchParams.get('start')) };
}

async function ytMeta(id) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const url = 'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return {};
    const j = await r.json();
    return { title: j.title, author: j.author_name };
  } catch (_) { return {}; }
}

/* ---------- 연결 ---------- */
function linkVideo(item) {
  sheet('동영상 연결', [
    { icon: 'phone', label: '내 폰에서 파일 선택', run: () => linkFile(item) },
    { icon: 'yt', label: '유튜브 링크 붙여넣기', run: () => askYouTube(item) },
  ]);
}

function attach(item, rec, autoName) {
  VIDEOS.set(rec.id, rec);
  const old = item.videoId;
  item.videoId = rec.id;
  if (autoName && (item.name === '운동 1' || item.name === '운동 2' || !item.name)) {
    item.name = autoName.slice(0, 40);
  }
  save();
  if (old && old !== rec.id) gcVideo(old);
  toast('연결했습니다');
  render();
}

function askYouTube(item) {
  const el = $('#sheet');
  el.innerHTML =
    `<div class="sheet-title">유튜브 링크 연결</div>
     <form>
       <input class="field" id="ytIn" placeholder="https://youtu.be/..." inputmode="url" autocomplete="off" spellcheck="false" autocapitalize="off">
       <div class="it-sub" id="ytMsg" style="margin:8px 2px 0;white-space:normal">유튜브 앱에서 공유 → 링크 복사 후 붙여넣으세요.</div>
       <div class="btn-row">
         <button type="button" class="btn btn-ghost" id="ytPaste">붙여넣기</button>
         <button type="submit" class="btn btn-accent">연결</button>
       </div>
     </form>`;
  const inp = el.querySelector('#ytIn');
  const msg = el.querySelector('#ytMsg');
  el.onclick = async (e) => {
    if (e.target.id !== 'ytPaste') return;
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) { inp.value = txt.trim(); msg.textContent = '붙여넣었습니다. [연결]을 누르세요.'; }
      else msg.textContent = '클립보드가 비어 있습니다.';
    } catch (_) {
      msg.textContent = '붙여넣기 권한이 없습니다. 입력칸을 길게 눌러 붙여넣으세요.';
      inp.focus();
    }
  };
  el.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const info = parseYT(inp.value);
    if (!info) {
      msg.textContent = '유튜브 주소를 알아볼 수 없습니다. youtu.be/… 또는 youtube.com/watch?v=… 형식이어야 합니다.';
      msg.classList.add('warn');
      return;
    }
    closeSheet();
    linkYouTube(item, info);
  };
  $('#sheetWrap').hidden = false;
  setTimeout(() => inp.focus(), 60);
}

async function linkYouTube(item, info) {
  const dup = [...VIDEOS.values()].find((v) => isYT(v) && v.ytId === info.id);
  if (dup) { attach(item, dup, dup.name); return true; }
  toast('영상 정보를 가져오는 중…', 7000);
  const meta = await ytMeta(info.id);
  const rec = {
    id: uid(),
    kind: 'yt',
    ytId: info.id,
    start: info.start || 0,
    name: meta.title || '유튜브 영상',
    channel: meta.author || '',
    poster: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${info.id}`,
    duration: 0,
    addedAt: Date.now(),
  };
  try {
    await dbPut('videos', rec);
  } catch (_) {
    toast('링크를 저장하지 못했습니다');
    return false;
  }
  attach(item, rec, rec.name);
  return true;
}

async function linkFile(item) {
  const picked = await pickVideo();
  if (!picked) return false;
  const { file, handle } = picked;
  toast('동영상을 등록하는 중…', 8000);
  const meta = await probe(file);
  const rec = {
    id: uid(),
    kind: 'file',
    name: file.name || '동영상',
    size: file.size || 0,
    type: file.type || '',
    duration: meta.duration,
    poster: meta.poster,
    mode: handle ? 'handle' : 'blob',
    handle: handle || undefined,
    blob: handle ? undefined : file,
    addedAt: Date.now(),
  };
  try {
    await dbPut('videos', rec);
  } catch (e) {
    if (rec.mode === 'handle') { toast('동영상 저장에 실패했습니다'); return false; }
    toast('저장공간이 부족합니다. 영상함에서 사용하지 않는 영상을 지워보세요', 4000);
    return false;
  }
  attach(item, rec, (file.name || '운동').replace(/\.[^.]+$/, ''));
  return true;
}

async function gcVideo(videoId) {
  const used = S.tabs.some((t) => t.days.some((d) => d.some((i) => i.videoId === videoId)));
  if (used) return;
  await dbDel('videos', videoId).catch(() => {});
  VIDEOS.delete(videoId);
}

async function getPlayable(videoId) {
  const rec = VIDEOS.get(videoId) || (await dbGet('videos', videoId));
  if (!rec) throw new Error('없음');
  if (rec.mode === 'handle' && rec.handle) {
    let p = await rec.handle.queryPermission({ mode: 'read' });
    if (p !== 'granted') p = await rec.handle.requestPermission({ mode: 'read' });
    if (p !== 'granted') throw new Error('권한');
    return await rec.handle.getFile();
  }
  if (rec.blob) return rec.blob;
  throw new Error('없음');
}

/* ---------- 완료 기록 ---------- */
const todayLog = () => (S.logs[todayKey()] = S.logs[todayKey()] || {});

/* 이번 주 완료 상태: '' 미완료 / 'day' 해당 요일에 수행 / 'off' 다른 날에 수행 */
function doneState(id, dayIdx) {
  const { keys } = weekInfo();
  if (dayIdx >= 0) {
    const own = S.logs[keys[dayIdx]];
    if (own && own[id]) return 'day';
  }
  return doneDayIdx(id, dayIdx) >= 0 ? 'off' : '';
}

/* 이번 주에서 dayIdx가 아닌 날 중 이 운동을 수행한 요일 (없으면 -1) */
function doneDayIdx(id, dayIdx) {
  const { keys } = weekInfo();
  for (let i = 0; i < 7; i++) {
    if (i === dayIdx) continue;
    const l = S.logs[keys[i]];
    if (l && l[id]) return i;
  }
  return -1;
}

function setDone(id, on) {
  if (on) todayLog()[id] = 1;
  else weekInfo().keys.forEach((k) => { if (S.logs[k]) delete S.logs[k][id]; });
  save();
}

/* ---------- 재생 ---------- */
let curURL = null, curItemId = null, wakeLock = null;
let ytPlayer = null, ytAPI = null;

async function openPlayer(item) {
  curItemId = item.id;
  $('#playerTitle').textContent = item.name;
  $('#player').hidden = false;
  document.body.style.overflow = 'hidden';
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}

function loadYTAPI() {
  if (ytAPI) return ytAPI;
  ytAPI = new Promise((res, rej) => {
    if (window.YT && window.YT.Player) return res(window.YT);
    const t = setTimeout(() => rej(new Error('timeout')), 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(t);
      if (typeof prev === 'function') prev();
      res(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(t); rej(new Error('load')); };
    document.head.appendChild(s);
  });
  ytAPI.catch(() => { ytAPI = null; });
  return ytAPI;
}

async function playYT(rec) {
  const box = $('#ytbox');
  box.hidden = false;
  $('#video').hidden = true;
  box.innerHTML = '<div id="ytmount"></div>';
  const vars = { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start: rec.start || 0 };
  try {
    const YT = await loadYTAPI();
    if ($('#player').hidden) return;
    ytPlayer = new YT.Player('ytmount', {
      videoId: rec.ytId,
      playerVars: vars,
      events: {
        onReady: (e) => { try { e.target.playVideo(); } catch (_) {} },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED && curItemId) {
            setDone(curItemId, true);
            toast('완료로 표시했습니다');
          }
        },
        onError: () => sheet('재생할 수 없습니다', [
          { html: '<div style="padding:6px 12px 10px;color:var(--dim);font-size:13.5px">업로더가 외부 재생을 막았거나 삭제된 영상입니다. 유튜브에서 열어보세요.</div>' },
          { icon: 'open', label: '유튜브에서 열기', run: () => window.open(rec.url, '_blank', 'noopener') },
        ]),
      },
    });
  } catch (_) {
    const q = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('&');
    box.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(rec.ytId)}?${q}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }
}

async function play(item) {
  if (!item.videoId) { linkVideo(item); return; }
  const rec = VIDEOS.get(item.videoId) || (await dbGet('videos', item.videoId).catch(() => null));

  if (isYT(rec)) {
    await openPlayer(item);
    playYT(rec);
    return;
  }

  let file;
  try {
    file = await getPlayable(item.videoId);
  } catch (e) {
    const why = e.message === '권한' ? '파일 접근 권한이 필요합니다' : '동영상을 찾을 수 없습니다';
    sheet(item.name, [
      { html: `<div style="padding:6px 12px 10px;color:var(--dim);font-size:13.5px">${esc(why)}. 다시 연결하시겠어요?</div>` },
      { icon: 'link', label: '동영상 다시 연결', run: () => linkVideo(item) },
    ]);
    return;
  }
  if (curURL) URL.revokeObjectURL(curURL);
  curURL = URL.createObjectURL(file);
  const v = $('#video');
  v.hidden = false;
  $('#ytbox').hidden = true;
  v.src = curURL;
  await openPlayer(item);
  v.play().catch(() => {});
}

function closePlayer() {
  const v = $('#video');
  v.pause();
  v.removeAttribute('src');
  v.load();
  v.hidden = false;
  if (ytPlayer) { try { ytPlayer.destroy(); } catch (_) {} ytPlayer = null; }
  $('#ytbox').innerHTML = '';
  $('#ytbox').hidden = true;
  $('#player').hidden = true;
  document.body.style.overflow = '';
  if (curURL) { URL.revokeObjectURL(curURL); curURL = null; }
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  curItemId = null;
  render();
}

/* ---------- 바텀시트 ---------- */
function sheet(title, rows) {
  const el = $('#sheet');
  el.innerHTML =
    (title ? `<div class="sheet-title">${esc(title)}</div>` : '') +
    rows.map((r, i) => {
      if (r.html) return r.html;
      return `<button class="sheet-item ${r.danger ? 'danger' : ''}" data-r="${i}">${ic(r.icon)}<span>${esc(r.label)}</span></button>`;
    }).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = rows[+b.dataset.r];
    closeSheet();
    if (r && r.run) r.run();
  };
  $('#sheetWrap').hidden = false;
}
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }

function askText(title, value, onOk) {
  const el = $('#sheet');
  el.innerHTML =
    `<div class="sheet-title">${esc(title)}</div>
     <form><input class="field" id="askIn" value="${esc(value || '')}" maxlength="40" autocomplete="off">
     <div class="btn-row"><button type="button" class="btn btn-ghost" id="askNo">취소</button>
     <button type="submit" class="btn btn-accent">저장</button></div></form>`;
  el.onclick = (e) => { if (e.target.id === 'askNo') closeSheet(); };
  el.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const v = el.querySelector('#askIn').value.trim();
    closeSheet();
    if (v) onOk(v);
  };
  $('#sheetWrap').hidden = false;
  setTimeout(() => { const i = el.querySelector('#askIn'); i.focus(); i.select(); }, 60);
}

/* ---------- 탭 / 길게 누르기 ---------- */
function bindPress(el, tap, hold) {
  let t = null, sx = 0, sy = 0, fired = false;
  const clear = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', (e) => {
    fired = false; sx = e.clientX; sy = e.clientY;
    if (hold) t = setTimeout(() => { fired = true; clear(); if (navigator.vibrate) navigator.vibrate(12); hold(); }, 480);
  });
  el.addEventListener('pointermove', (e) => {
    if (t && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) clear();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, clear));
  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (fired) { fired = false; return; }
    if (tap) tap();
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------- 렌더 ---------- */
function render() {
  renderTabs();
  if (NAV === 'routine') renderRoutine();
  else if (NAV === 'log') renderLog();
  else renderLib();
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('is-on', b.dataset.nav === NAV));
  $('#tabstrip').hidden = NAV !== 'routine';
  rendered = true;
}

async function showDiag() {
  let est = '확인 불가';
  try {
    const e = await navigator.storage.estimate();
    est = `${fmtSize(e.usage)} / ${fmtSize(e.quota)}`;
  } catch (_) {}
  const lines = [
    ['빌드', BUILD],
    ['주소', location.href],
    ['보안 컨텍스트', window.isSecureContext ? '예 (https)' : '아니오 — https가 아니면 동작하지 않습니다'],
    ['홈 화면 실행', matchMedia('(display-mode: standalone)').matches ? '예' : '아니오 (브라우저 탭)'],
    ['IndexedDB', 'indexedDB' in window ? '사용 가능' : '없음'],
    ['서비스 워커', 'serviceWorker' in navigator ? '사용 가능' : '없음'],
    ['파일 피커', hasPicker ? '지원 (원본 참조)' : '미지원 (앱 저장소 복사)'],
    ['저장 사용량', est],
    ['루틴 / 영상', `${S.tabs.length}개 / ${VIDEOS.size}개 (유튜브 ${[...VIDEOS.values()].filter(isYT).length}개)`],
    ['네트워크', navigator.onLine === false ? '오프라인 — 유튜브 영상은 재생되지 않습니다' : '온라인'],
    ['기록된 오류', PROBLEMS.length ? PROBLEMS.join(' | ') : '없음'],
  ];
  const text = lines.map(([k, v]) => `${k}: ${v}`).join('\n');
  sheet('진단 정보', [
    { html: `<div style="padding:4px 12px 10px">${lines.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span style="text-align:right;word-break:break-all">${esc(v)}</span></div>`).join('')}</div>` },
    { icon: 'copy', label: '진단 정보 복사', run: () => navigator.clipboard.writeText(text).then(() => toast('복사했습니다'), () => toast('복사에 실패했습니다')) },
    { icon: 'refresh', label: '캐시 비우고 새로고침', run: async () => {
        try {
          const rs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(rs.map((r) => r.unregister()));
          const ks = await caches.keys();
          await Promise.all(ks.map((k) => caches.delete(k)));
        } catch (_) {}
        location.reload();
      } },
  ]);
}

function renderTabs() {
  const strip = $('#tabstrip');
  strip.innerHTML =
    S.tabs.map((t) => `<button class="tab ${t.id === S.activeTabId ? 'is-on' : ''}" data-tab="${t.id}">${esc(t.name)}</button>`).join('') +
    `<button class="tab-add" id="tabAdd" aria-label="루틴 추가">${ic('plus')}</button>`;
  strip.querySelectorAll('[data-tab]').forEach((el) => {
    const t = S.tabs.find((x) => x.id === el.dataset.tab);
    bindPress(el,
      () => { if (S.activeTabId === t.id) return tabMenu(t); S.activeTabId = t.id; save(); render(); },
      () => tabMenu(t));
  });
  $('#tabAdd').onclick = () => askText('새 루틴 이름', '', (name) => {
    const t = newTab(name);
    S.tabs.push(t); S.activeTabId = t.id; save(); render();
  });
}

function tabMenu(t) {
  const i = S.tabs.indexOf(t);
  const rows = [
    { icon: 'edit', label: '이름 변경', run: () => askText('루틴 이름', t.name, (n) => { t.name = n; save(); render(); }) },
    {
      icon: 'copy', label: '복제', run: () => {
        const c = JSON.parse(JSON.stringify(t));
        c.id = uid(); c.name = t.name + ' 복사본';
        c.days.forEach((d) => d.forEach((it) => { it.id = uid(); }));
        S.tabs.splice(i + 1, 0, c); S.activeTabId = c.id; save(); render();
      },
    },
  ];
  if (i > 0) rows.push({ icon: 'up', label: '왼쪽으로 이동', run: () => { S.tabs.splice(i - 1, 0, S.tabs.splice(i, 1)[0]); save(); render(); } });
  if (i < S.tabs.length - 1) rows.push({ icon: 'down', label: '오른쪽으로 이동', run: () => { S.tabs.splice(i + 1, 0, S.tabs.splice(i, 1)[0]); save(); render(); } });
  if (S.tabs.length > 1) rows.push({
    icon: 'trash', label: '루틴 삭제', danger: true, run: () => {
      const ids = t.days.flat().map((x) => x.videoId).filter(Boolean);
      S.tabs.splice(i, 1);
      if (S.activeTabId === t.id) S.activeTabId = S.tabs[0].id;
      save(); render();
      ids.forEach(gcVideo);
    },
  });
  sheet(t.name, rows);
}

function renderRoutine() {
  const t = activeTab();
  const ti = todayIdx();
  const { dates } = weekInfo();
  const doneCount = (i) => t.days[i].filter((x) => doneState(x.id, i)).length;

  const week = DAYS.map((d, i) => {
    const items = t.days[i];
    const date = dates[i];
    const label = date.getDate() === 1 ? `${date.getMonth() + 1}/1` : date.getDate();
    const doneN = doneCount(i);
    return `<div class="wcell ${i === ti ? 'is-today' : ''} ${items.length && doneN === items.length ? 'is-full' : ''}">
      <b>${d}</b><em>${label}</em><i>${doneN}/${items.length}</i></div>`;
  }).join('');

  const days = DAYS.map((d, i) => {
    const open = S.openDay === i;
    const items = t.days[i];
    const preview = items.map((x) => x.name).join(' · ') || '운동 없음';
    return `<section class="day ${i === ti ? 'is-today' : ''} ${open ? 'is-open' : ''}">
      <button class="day-h" data-day="${i}">
        <span class="nm">${d}요일</span>
        ${i === ti ? '<span class="pill">오늘</span>' : ''}
        ${!open ? `<span class="cnt" style="margin-left:8px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${esc(preview)}</span>` : ''}
        <span class="cnt">${doneCount(i)}/${items.length}</span>
        ${ic('chev', 'chev')}
      </button>
      ${open ? `<div class="day-b">${items.map((x) => itemRow(x, i)).join('') || '<div style="padding:14px 4px;color:var(--faint);font-size:13.5px">운동이 없습니다</div>'}
        <button class="addbtn" data-add="${i}">＋ 추가 운동</button></div>` : ''}
    </section>`;
  }).join('');

  $('#view').innerHTML = `<div class="week">${week}</div>${days}`;

  $('#view').querySelectorAll('[data-day]').forEach((el) => {
    el.onclick = () => { const i = +el.dataset.day; S.openDay = S.openDay === i ? -1 : i; save(); render(); };
  });
  $('#view').querySelectorAll('[data-add]').forEach((el) => {
    el.onclick = () => askText('추가 운동 이름', '', (n) => {
      t.days[+el.dataset.add].push({ id: uid(), name: n, videoId: null, base: false });
      save(); render();
    });
  });
  $('#view').querySelectorAll('[data-item]').forEach((el) => {
    const ref = findItem(el.dataset.item);
    if (!ref) return;
    bindPress(el, () => play(ref.item), () => itemMenu(ref.item));
  });
}

function itemRow(x, dayIdx) {
  const v = x.videoId ? VIDEOS.get(x.videoId) : null;
  const st = doneState(x.id, dayIdx);
  const oi = st === 'off' ? doneDayIdx(x.id, dayIdx) : -1;
  let cls = 'it-sub', txt, thumb;
  if (!x.videoId) {
    cls += ' warn';
    txt = '동영상 연결 필요';
    thumb = `<span class="thumb empty-thumb">${ic('link')}</span>`;
  } else if (!v) {
    cls += ' warn';
    txt = '연결 끊김 — 다시 연결하세요';
    thumb = `<span class="thumb empty-thumb">${ic('unlink')}</span>`;
  } else {
    const tag = isYT(v) ? '유튜브' : fmtDur(v.duration);
    txt = [tag, x.base ? '기본' : '추가 운동'].filter(Boolean).join(' · ');
    thumb = `<span class="thumb">${v.poster ? `<img src="${esc(v.poster)}" alt="" loading="lazy">` : ''}<span class="ov">${ic('play')}</span>${isYT(v) ? '<span class="yt"></span>' : ''}</span>`;
  }
  if (oi >= 0) txt = [txt, `${DAYS[oi]}요일에 완료`].filter(Boolean).join(' · ');
  return `<button class="item ${st ? 'is-done' : ''}" data-item="${x.id}">
    ${thumb}
    <span class="it-main"><span class="it-nm">${esc(x.name)}</span><span class="${cls}">${esc(txt)}</span></span>
    <span class="it-end ${st === 'day' ? 'done' : ''}${st === 'off' ? 'done-off' : ''}">${ic(st ? 'check' : 'circle')}</span>
  </button>`;
}

function itemMenu(item) {
  const ref = findItem(item.id);
  const list = ref.tab.days[ref.day];
  const vid = item.videoId ? VIDEOS.get(item.videoId) : null;
  const rows = [];
  if (item.videoId) rows.push({ icon: 'play', label: '재생', run: () => play(item) });
  rows.push({ icon: 'link', label: item.videoId ? '동영상 변경' : '동영상 연결', run: () => linkVideo(item) });
  if (isYT(vid)) rows.push({ icon: 'open', label: '유튜브에서 열기', run: () => window.open(vid.url, '_blank', 'noopener') });
  rows.push({ icon: 'edit', label: '이름 변경', run: () => askText('운동 이름', item.name, (n) => { item.name = n; save(); render(); }) });
  const st = doneState(item.id, ref.day);
  rows.push({
    icon: st ? 'circle' : 'check',
    label: st ? '이번 주 완료 취소' : '오늘 완료로 표시',
    run: () => { setDone(item.id, !st); render(); },
  });
  if (ref.idx > 0) rows.push({ icon: 'up', label: '위로 이동', run: () => { list.splice(ref.idx - 1, 0, list.splice(ref.idx, 1)[0]); save(); render(); } });
  if (ref.idx < list.length - 1) rows.push({ icon: 'down', label: '아래로 이동', run: () => { list.splice(ref.idx + 1, 0, list.splice(ref.idx, 1)[0]); save(); render(); } });
  if (item.videoId) rows.push({
    icon: 'unlink', label: '연결 해제', run: () => { const old = item.videoId; item.videoId = null; save(); render(); gcVideo(old); },
  });
  if (!item.base) rows.push({
    icon: 'trash', label: '운동 삭제', danger: true,
    run: () => { const old = item.videoId; list.splice(ref.idx, 1); save(); render(); if (old) gcVideo(old); },
  });
  sheet(item.name, rows);
}

function renderLog() {
  /* 운동 id → 원래 배정된 요일 (0=월). 삭제된 운동은 없음 */
  const dayOf = new Map();
  S.tabs.forEach((t) => t.days.forEach((d, di) => d.forEach((i) => dayOf.set(i.id, di))));

  const rows = [];
  const d = new Date();
  let streak = 0, streakOn = true;
  for (let k = 0; k < 21; k++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k);
    const wi = (day.getDay() + 6) % 7;
    const ids = Object.keys(S.logs[dayKey(day)] || {});
    const n = ids.length;
    if (streakOn) { if (n > 0) streak++; else if (k > 0) streakOn = false; }
    const dots = n
      ? ids.map((id) => {
          const di = dayOf.get(id);
          return `<i class="dot ${di === undefined ? 'gone' : di === wi ? 'on' : 'off'}"></i>`;
        }).join('')
      : '<i class="dot"></i>';
    rows.push(`<div class="logrow">
      <span class="d">${day.getMonth() + 1}/${day.getDate()} (${DAYS[wi]})</span>
      <span class="dots">${dots}</span>
      <span class="n">${n}</span></div>`);
  }
  const total = Object.values(S.logs).reduce((a, o) => a + Object.keys(o).length, 0);
  $('#view').innerHTML = `
    <div class="card"><h2>요약</h2>
      <div class="kv"><span>연속 달성</span><span>${streak}일</span></div>
      <div class="kv"><span>누적 완료</span><span>${total}회</span></div>
      <div class="kv"><span>오늘 완료</span><span>${Object.keys(todayLog()).length}회</span></div>
    </div>
    <div class="card"><h2>최근 3주</h2>
      <div class="legend">
        <span><i class="dot on"></i>배정된 요일에 수행</span>
        <span><i class="dot off"></i>다른 요일에 수행</span>
        <span><i class="dot gone"></i>삭제된 운동</span>
      </div>${rows.join('')}</div>`;
}

function renderLib() {
  const list = [...VIDEOS.values()].sort((a, b) => b.addedAt - a.addedAt);
  const usedBy = (id) => {
    const out = [];
    S.tabs.forEach((t) => t.days.forEach((d, di) => d.forEach((i) => { if (i.videoId === id) out.push(`${t.name} · ${DAYS[di]}`); })));
    return out;
  };
  const body = list.length ? list.map((v) => {
    const u = usedBy(v.id);
    const meta = isYT(v)
      ? ['유튜브', v.channel]
      : [fmtDur(v.duration), v.mode === 'blob' ? fmtSize(v.size) : '원본 참조'];
    return `<div class="card" style="padding:12px">
      <div style="display:flex;gap:11px;align-items:center">
        <span class="thumb">${v.poster ? `<img src="${esc(v.poster)}" alt="" loading="lazy">` : ic('play')}${isYT(v) ? '<span class="yt"></span>' : ''}</span>
        <span class="it-main"><span class="it-nm">${esc(v.name)}</span>
          <span class="it-sub">${esc(meta.filter(Boolean).join(' · '))}</span></span>
        <button class="icon-btn" data-del="${v.id}" aria-label="삭제">${ic('trash')}</button>
      </div>
      <div class="it-sub" style="margin-top:8px">${u.length ? esc(u.join(', ')) : '사용 중인 운동 없음'}</div>
    </div>`;
  }).join('') : '<div class="empty"><b>아직 연결한 영상이 없습니다</b>루틴 탭에서 운동을 눌러 폰에 있는 동영상이나 유튜브 링크를 연결하세요.</div>';

  $('#view').innerHTML = `<div class="card" id="storeCard"><h2>저장공간</h2><div class="it-sub">확인하는 중…</div></div>${body}`;

  $('#view').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.del;
      sheet('이 영상을 삭제할까요?', [{
        icon: 'trash', label: '삭제', danger: true, run: async () => {
          S.tabs.forEach((t) => t.days.forEach((d) => d.forEach((i) => { if (i.videoId === id) i.videoId = null; })));
          save();
          await dbDel('videos', id).catch(() => {});
          VIDEOS.delete(id);
          render();
        },
      }]);
    };
  });
  showStorage();
}

async function showStorage() {
  const card = $('#storeCard');
  if (!card) return;
  let used = 0, quota = 0, persisted = false;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      used = e.usage || 0; quota = e.quota || 0;
    }
    if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch (_) {}
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  card.innerHTML = `<h2>저장공간</h2>
    <div class="kv"><span>사용 중</span><span>${fmtSize(used) || '0 KB'}${quota ? ` / ${fmtSize(quota)}` : ''}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="kv" style="margin-top:8px"><span>브라우저 자동 삭제 방지</span><span>${persisted ? '적용됨' : '미적용'}</span></div>
    ${persisted ? '' : '<button class="btn" style="width:100%;margin-top:10px" id="btnPersist">자동 삭제 방지 켜기</button>'}
    <div class="it-sub" style="margin-top:10px;white-space:normal">${hasPicker ? '이 기기는 원본 파일을 참조합니다. 원본을 지우거나 옮기면 연결이 끊깁니다.' : '이 기기는 영상을 앱 저장소로 복사합니다. 원본을 지워도 재생되지만 용량을 차지합니다.'} 유튜브 링크는 저장공간을 쓰지 않지만 재생할 때 인터넷이 필요합니다.</div>`;
  const bp = $('#btnPersist');
  if (bp) bp.onclick = async () => {
    const ok = await navigator.storage.persist().catch(() => false);
    toast(ok ? '적용했습니다' : '브라우저가 거부했습니다. 홈 화면에 추가한 뒤 다시 시도해 보세요', 3000);
    showStorage();
  };
}

/* ---------- 데이터 백업 ---------- */
function exportData() {
  const clean = JSON.parse(JSON.stringify({ v: S.v, tabs: S.tabs, logs: S.logs }));
  // 유튜브 링크는 주소만 있으면 되므로 백업에 함께 담는다. 폰 파일 연결은 기기를 벗어날 수 없다.
  const yt = [...VIDEOS.values()].filter(isYT).map((v) => ({
    id: v.id, kind: 'yt', ytId: v.ytId, start: v.start || 0,
    name: v.name, channel: v.channel || '', poster: v.poster, url: v.url,
    duration: 0, addedAt: v.addedAt,
  }));
  const keep = new Set(yt.map((v) => v.id));
  clean.tabs.forEach((t) => t.days.forEach((d) => d.forEach((i) => { if (!keep.has(i.videoId)) i.videoId = null; })));
  clean.videos = yt;
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `routine-backup-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('유튜브 링크는 함께 저장됩니다. 폰 파일 연결은 포함되지 않습니다', 3500);
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.tabs || !Array.isArray(j.tabs)) throw new Error('형식');
      if (Array.isArray(j.videos)) {
        for (const v of j.videos) {
          if (!v || v.kind !== 'yt' || !/^[\w-]{11}$/.test(String(v.ytId || ''))) continue;
          await dbPut('videos', v).catch(() => {});
          VIDEOS.set(v.id, v);
        }
      }
      S.tabs = j.tabs; S.logs = j.logs || {}; S.activeTabId = S.tabs[0].id;
      save(); render(); toast('불러왔습니다');
    } catch (_) { toast('파일 형식이 맞지 않습니다'); }
  };
  inp.click();
}

/* ---------- 이벤트 ---------- */
$('#sheetWrap').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeSheet(); });
document.querySelectorAll('.navbtn').forEach((b) => { b.onclick = () => { NAV = b.dataset.nav; render(); window.scrollTo(0, 0); }; });
$('#btnStorage').onclick = () => sheet('데이터', [
  { icon: 'copy', label: '루틴 백업 파일 내보내기', run: exportData },
  { icon: 'link', label: '백업 파일 불러오기', run: importData },
  { icon: 'info', label: '진단 정보 보기', run: showDiag },
]);
$('#playerClose').onclick = closePlayer;
$('#playerSkip').onclick = closePlayer;
$('#playerDone').onclick = () => { if (curItemId) setDone(curItemId, true); closePlayer(); };
$('#video').addEventListener('ended', () => { if (curItemId) { setDone(curItemId, true); toast('완료로 표시했습니다'); } });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#player').hidden) closePlayer();
  else if (!$('#sheetWrap').hidden) closeSheet();
});
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !$('#player').hidden && navigator.wakeLock && !wakeLock) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
});

/* ---------- 뒤로 가기 / 앱 종료 ---------- */
/* 히스토리에 더미 항목을 하나 얹어두고, 뒤로 가기로 그 항목이 빠질 때마다 가로챈다. */
let exiting = false;
const pushGuard = () => { try { history.pushState({ guard: 1 }, ''); } catch (_) {} };

function askExit() {
  const el = $('#sheet');
  el.innerHTML =
    `<div class="sheet-title">앱 종료</div>
     <div style="padding:2px 12px 0;font-size:15px">앱을 종료할까요?</div>
     <div style="padding:0 12px 6px">
       <div class="btn-row">
         <button type="button" class="btn btn-ghost" id="exitNo">취소</button>
         <button type="button" class="btn btn-accent" id="exitYes">확인</button>
       </div>
     </div>`;
  el.onclick = (e) => {
    if (e.target.id === 'exitNo') closeSheet();
    else if (e.target.id === 'exitYes') { closeSheet(); exitApp(); }
  };
  $('#sheetWrap').hidden = false;
}

function exitApp() {
  exiting = true;
  try { window.close(); } catch (_) {}
  setTimeout(() => {
    try { history.back(); } catch (_) {}
    // 히스토리에 돌아갈 곳이 없어 그대로 남는 경우 (앱을 직접 실행한 첫 화면)
    setTimeout(() => {
      if (!exiting) return;
      exiting = false;
      toast('뒤로 가기를 한 번 더 누르면 앱이 닫힙니다', 2500);
    }, 500);
  }, 100);
}

window.addEventListener('popstate', () => {
  if (exiting) return; // 종료를 확인했으면 막지 않는다
  if (!$('#player').hidden) { closePlayer(); pushGuard(); return; }
  if (!$('#sheetWrap').hidden) { closeSheet(); pushGuard(); return; }
  pushGuard();
  askExit();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) { exiting = false; pushGuard(); } });

/* ---------- 서비스 워커 ---------- */
/* 새 버전이 배포되면 워커가 바뀌는 순간 화면을 한 번 새로고침해 최신 앱으로 맞춘다. */
function setupSW() {
  if (!('serviceWorker' in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || reloading) return;          // 첫 설치 때는 새로고침할 것이 없다
    if (!$('#player').hidden) return;       // 재생 중에는 방해하지 않는다
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ---------- 시작 ---------- */
(async function init() {
  try {
    const saved = await dbGet('meta', 'state');
    if (saved && saved.tabs && saved.tabs.length) S = saved;
    (await dbAll('videos')).forEach((v) => VIDEOS.set(v.id, v));
  } catch (_) {
    toast('저장된 데이터를 읽지 못했습니다');
  }
  if (S.openDay === undefined) S.openDay = todayIdx();
  pushGuard();
  try {
    render();
  } catch (e) {
    fatal('화면을 그리지 못했습니다\n' + (e && e.message));
    return;
  }
  setupSW();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();

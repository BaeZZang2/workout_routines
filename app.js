/* 내 루틴 — 운동 루틴 ↔ 내 폰 동영상 연결 PWA */
'use strict';

const BUILD = '2026-07-28b';
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
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayIdx = () => (new Date().getDay() + 6) % 7;

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

async function linkVideo(item) {
  const picked = await pickVideo();
  if (!picked) return false;
  const { file, handle } = picked;
  toast('동영상을 등록하는 중…', 8000);
  const meta = await probe(file);
  const rec = {
    id: uid(),
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
  VIDEOS.set(rec.id, rec);
  const old = item.videoId;
  item.videoId = rec.id;
  if (item.name === '운동 1' || item.name === '운동 2' || !item.name) {
    item.name = (file.name || '운동').replace(/\.[^.]+$/, '').slice(0, 40);
  }
  save();
  if (old) gcVideo(old);
  toast('연결했습니다');
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
const isDone = (id) => !!todayLog()[id];
function setDone(id, on) {
  const l = todayLog();
  if (on) l[id] = 1; else delete l[id];
  save();
}

/* ---------- 재생 ---------- */
let curURL = null, curItemId = null, wakeLock = null;

async function play(item) {
  if (!item.videoId) { await linkVideo(item); render(); return; }
  let file;
  try {
    file = await getPlayable(item.videoId);
  } catch (e) {
    const why = e.message === '권한' ? '파일 접근 권한이 필요합니다' : '동영상을 찾을 수 없습니다';
    sheet(item.name, [
      { html: `<div style="padding:6px 12px 10px;color:var(--dim);font-size:13.5px">${esc(why)}. 다시 연결하시겠어요?</div>` },
      { icon: 'link', label: '동영상 다시 연결', run: async () => { await linkVideo(item); render(); } },
    ]);
    return;
  }
  if (curURL) URL.revokeObjectURL(curURL);
  curURL = URL.createObjectURL(file);
  curItemId = item.id;
  $('#playerTitle').textContent = item.name;
  const v = $('#video');
  v.src = curURL;
  $('#player').hidden = false;
  document.body.style.overflow = 'hidden';
  v.play().catch(() => {});
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}

function closePlayer() {
  const v = $('#video');
  v.pause();
  v.removeAttribute('src');
  v.load();
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
    ['루틴 / 영상', `${S.tabs.length}개 / ${VIDEOS.size}개`],
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
  const week = DAYS.map((d, i) => {
    const items = t.days[i];
    const linked = items.filter((x) => x.videoId).length;
    return `<div class="wcell ${i === ti ? 'is-today' : ''} ${items.length && linked === items.length ? 'is-full' : ''}">
      <b>${d}</b><i>${linked}/${items.length}</i></div>`;
  }).join('');

  const days = DAYS.map((d, i) => {
    const open = S.openDay === i;
    const items = t.days[i];
    const doneN = i === ti ? items.filter((x) => isDone(x.id)).length : 0;
    const preview = items.map((x) => x.name).join(' · ') || '운동 없음';
    return `<section class="day ${i === ti ? 'is-today' : ''} ${open ? 'is-open' : ''}">
      <button class="day-h" data-day="${i}">
        <span class="nm">${d}요일</span>
        ${i === ti ? '<span class="pill">오늘</span>' : ''}
        ${!open ? `<span class="cnt" style="margin-left:8px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${esc(preview)}</span>` : ''}
        <span class="cnt">${i === ti ? `${doneN}/${items.length}` : items.length}</span>
        ${ic('chev', 'chev')}
      </button>
      ${open ? `<div class="day-b">${items.map((x, j) => itemRow(x, i, j, i === ti)).join('') || '<div style="padding:14px 4px;color:var(--faint);font-size:13.5px">운동이 없습니다</div>'}
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

function itemRow(x, dayIdx, j, isToday) {
  const v = x.videoId ? VIDEOS.get(x.videoId) : null;
  const done = isToday && isDone(x.id);
  let sub, thumb;
  if (!x.videoId) {
    sub = '<span class="it-sub warn">동영상 연결 필요</span>';
    thumb = `<span class="thumb empty-thumb">${ic('link')}</span>`;
  } else if (!v) {
    sub = '<span class="it-sub warn">연결 끊김 — 다시 연결하세요</span>';
    thumb = `<span class="thumb empty-thumb">${ic('unlink')}</span>`;
  } else {
    sub = `<span class="it-sub">${[fmtDur(v.duration), x.base ? '기본' : '추가 운동'].filter(Boolean).join(' · ')}</span>`;
    thumb = `<span class="thumb">${v.poster ? `<img src="${v.poster}" alt="">` : ''}<span class="ov">${ic('play')}</span></span>`;
  }
  return `<button class="item ${done ? 'is-done' : ''}" data-item="${x.id}">
    ${thumb}
    <span class="it-main"><span class="it-nm">${esc(x.name)}</span>${sub}</span>
    <span class="it-end ${done ? 'done' : ''}">${ic(done ? 'check' : 'circle')}</span>
  </button>`;
}

function itemMenu(item) {
  const ref = findItem(item.id);
  const list = ref.tab.days[ref.day];
  const rows = [];
  if (item.videoId) rows.push({ icon: 'play', label: '재생', run: () => play(item) });
  rows.push({ icon: 'link', label: item.videoId ? '동영상 변경' : '동영상 연결', run: async () => { await linkVideo(item); render(); } });
  rows.push({ icon: 'edit', label: '이름 변경', run: () => askText('운동 이름', item.name, (n) => { item.name = n; save(); render(); }) });
  rows.push({
    icon: isDone(item.id) ? 'circle' : 'check',
    label: isDone(item.id) ? '오늘 완료 취소' : '오늘 완료로 표시',
    run: () => { setDone(item.id, !isDone(item.id)); render(); },
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
  const rows = [];
  const d = new Date();
  let streak = 0, streakOn = true;
  for (let k = 0; k < 21; k++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const n = Object.keys(S.logs[key] || {}).length;
    if (streakOn) { if (n > 0) streak++; else if (k > 0) streakOn = false; }
    rows.push(`<div class="logrow">
      <span class="d">${day.getMonth() + 1}/${day.getDate()} (${DAYS[(day.getDay() + 6) % 7]})</span>
      <span class="dots">${Array.from({ length: Math.max(n, 1) }, (_, i) => `<i class="dot ${i < n ? 'on' : ''}"></i>`).join('')}</span>
      <span class="n">${n}</span></div>`);
  }
  const total = Object.values(S.logs).reduce((a, o) => a + Object.keys(o).length, 0);
  $('#view').innerHTML = `
    <div class="card"><h2>요약</h2>
      <div class="kv"><span>연속 달성</span><span>${streak}일</span></div>
      <div class="kv"><span>누적 완료</span><span>${total}회</span></div>
      <div class="kv"><span>오늘 완료</span><span>${Object.keys(todayLog()).length}회</span></div>
    </div>
    <div class="card"><h2>최근 3주</h2>${rows.join('')}</div>`;
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
    return `<div class="card" style="padding:12px">
      <div style="display:flex;gap:11px;align-items:center">
        <span class="thumb">${v.poster ? `<img src="${v.poster}" alt="">` : ic('play')}</span>
        <span class="it-main"><span class="it-nm">${esc(v.name)}</span>
          <span class="it-sub">${[fmtDur(v.duration), v.mode === 'blob' ? fmtSize(v.size) : '원본 참조'].filter(Boolean).join(' · ')}</span></span>
        <button class="icon-btn" data-del="${v.id}" aria-label="삭제">${ic('trash')}</button>
      </div>
      <div class="it-sub" style="margin-top:8px">${u.length ? esc(u.join(', ')) : '사용 중인 운동 없음'}</div>
    </div>`;
  }).join('') : '<div class="empty"><b>아직 연결한 영상이 없습니다</b>루틴 탭에서 운동을 눌러 폰에 있는 동영상을 연결하세요.</div>';

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
    <div class="it-sub" style="margin-top:10px">${hasPicker ? '이 기기는 원본 파일을 참조합니다. 원본을 지우거나 옮기면 연결이 끊깁니다.' : '이 기기는 영상을 앱 저장소로 복사합니다. 원본을 지워도 재생되지만 용량을 차지합니다.'}</div>`;
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
  clean.tabs.forEach((t) => t.days.forEach((d) => d.forEach((i) => { i.videoId = null; })));
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `routine-backup-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('동영상 연결은 백업에 포함되지 않습니다', 3000);
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
  try {
    render();
  } catch (e) {
    fatal('화면을 그리지 못했습니다\n' + (e && e.message));
    return;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();

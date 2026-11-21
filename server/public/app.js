/* SafePath prototype client.
   Plain modules, no build step, no third-party code. Every state transition that
   matters (sharing on/off, membership, freshness) is decided by the server; this
   file renders what it is told and never infers that a position is current. */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  user: null,
  families: [],
  currentFamilyId: null,
  familyData: null,
  pendingInviteToken: null,
  pendingJoinPeek: null,
  pollTimer: null,
  shareTimer: null,
  countdownTimers: new Map(),
  lastFix: null,
  busy: false,
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'x-safepath-client': 'web' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((json && json.error && json.error.message) || `Request failed (${res.status})`);
    err.code = json && json.error ? json.error.code : 'http_' + res.status;
    err.status = res.status;
    err.details = json && json.error ? json.error.details : null;
    throw err;
  }
  return json;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function toast(message, kind = '') {
  const stack = $('#toast-stack');
  // Never stack more than two: on a phone they cover the controls underneath.
  while (stack.children.length >= 2) stack.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  $('#toast-stack').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function relTime(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function clockTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function metres(m) {
  if (m === null || m === undefined) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function show(viewId) {
  for (const v of $$('.view')) v.hidden = v.id !== viewId;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

const MODALS = ['modal-consent', 'modal-invite', 'modal-join', 'modal-manage', 'modal-legal', 'modal-pricing', 'modal-emergency'];
function openModal(id) {
  for (const m of MODALS) $('#' + m).hidden = m !== id;
  $('#modal-backdrop').hidden = false;
  const first = $('#' + id).querySelector('button, input');
  if (first) first.focus();
}
function closeModals() {
  for (const m of MODALS) $('#' + m).hidden = true;
  $('#modal-backdrop').hidden = true;
  for (const t of state.countdownTimers.values()) clearInterval(t);
  state.countdownTimers.clear();
}

function confirmAction(message) {
  // eslint-disable-next-line no-alert
  return window.confirm(message);
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

let authEmail = '';

function showAuthError(msg) {
  const el = $('#auth-error');
  el.textContent = msg;
  el.hidden = !msg;
}

async function sendCode() {
  showAuthError('');
  const email = $('#auth-email').value.trim();
  const name = $('#auth-name').value.trim();
  if (!email) return showAuthError('Enter your email address.');
  const btn = $('#auth-send');
  btn.disabled = true;
  try {
    const result = await api('/api/auth/request-code', { method: 'POST', body: { email } });
    authEmail = email;
    state.displayName = name;
    $('#auth-step-email').hidden = true;
    $('#auth-step-code').hidden = false;
    $('#auth-code-target').textContent = `Sent to ${email}. The code expires in ${Math.round(result.expiresInSec / 60)} minutes.`;
    if (result.devCode) {
      $('#dev-code').hidden = false;
      $('#dev-code-value').textContent = result.devCode;
    } else {
      $('#dev-code').hidden = true;
    }
    $('#auth-code').focus();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function verifyCode() {
  showAuthError('');
  const code = $('#auth-code').value.replace(/\D/g, '');
  if (code.length !== 6) return showAuthError('Enter the 6-digit code.');
  const btn = $('#auth-verify');
  btn.disabled = true;
  try {
    await api('/api/auth/verify', {
      method: 'POST',
      body: { email: authEmail, code, displayName: state.displayName },
    });
    await boot();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  stopPolling();
  stopShareLoop();
  state.user = null;
  $('#signout-btn').hidden = true;
  show('view-auth');
}

/* ------------------------------------------------------------------ */
/* Boot and home                                                       */
/* ------------------------------------------------------------------ */

async function boot() {
  let me;
  try {
    me = await api('/api/me');
  } catch (err) {
    if (err.status === 401) {
      show('view-auth');
      $('#signout-btn').hidden = true;
      return;
    }
    toast(err.message, 'error');
    show('view-auth');
    return;
  }

  state.user = me.user;
  state.families = me.families || [];
  state.policy = me.policy;
  $('#signout-btn').hidden = false;
  $('#home-greeting').textContent = `Hello, ${me.user.displayName}`;

  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (hash && hash.length >= 20) {
    state.pendingInviteToken = hash;
    history.replaceState(null, '', location.pathname);
    await openJoinFromToken(hash);
    return;
  }

  if (state.currentFamilyId && state.families.some((f) => f.familyId === state.currentFamilyId)) {
    await openFamily(state.currentFamilyId);
  } else {
    renderHome();
    show('view-home');
  }
}

function renderHome() {
  const list = $('#family-list');
  list.innerHTML = '';
  $('#home-empty').hidden = state.families.length > 0;

  for (const f of state.families) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'family-tile';
    tile.innerHTML = `
      <h3>${escapeHtml(f.familyName)}</h3>
      <div class="meta">${f.memberCount} ${f.memberCount === 1 ? 'person' : 'people'} · ${f.role === 'owner' ? 'You own this group' : 'Member'}</div>
      <div class="tile-row">
        <span class="badge ${sharingBadgeClass(f.sharingState)}">${sharingBadgeText(f.sharingState)}</span>
      </div>`;
    tile.addEventListener('click', () => openFamily(f.familyId));
    list.appendChild(tile);
  }
}

function sharingBadgeClass(s) {
  return s === 'on' ? 'current' : s === 'paused' ? 'paused' : 'off';
}
function sharingBadgeText(s) {
  return s === 'on' ? 'Sharing on' : s === 'paused' ? 'Paused' : 'Not sharing';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function createFamily() {
  const name = window.prompt('Name for this group (for example "The Whitfields")');
  if (name === null) return;
  try {
    const res = await api('/api/families', { method: 'POST', body: { name } });
    toast('Group created. Invite another adult when you are ready.', 'ok');
    state.currentFamilyId = res.family.id;
    await boot();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Family view                                                         */
/* ------------------------------------------------------------------ */

async function openFamily(familyId) {
  state.currentFamilyId = familyId;
  stopShareLoop();
  await refreshFamily();
  show('view-family');
  startPolling();

  // Offer consent on arrival if the person is in a group but has never agreed.
  const d = state.familyData;
  if (d && !d.viewer.consent.foreground) {
    setTimeout(() => openConsent(), 350);
  }
}

async function refreshFamily() {
  if (!state.currentFamilyId) return;
  try {
    const data = await api(`/api/families/${state.currentFamilyId}`);
    state.familyData = data;
    renderFamily(data);
  } catch (err) {
    if (err.status === 404) {
      toast('That group is no longer available.', 'error');
      state.currentFamilyId = null;
      stopPolling();
      await boot();
      return;
    }
    if (err.status !== 401) toast(err.message, 'error');
    stopPolling();
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshFamily();
  }, 10_000);
}
function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function renderFamily(data) {
  const { family, viewer, members, policy } = data;

  $('#family-name').textContent = family.name;
  $('#family-meta').textContent =
    `${family.memberCount} of ${family.maxMembers} people · you ${viewer.role === 'owner' ? 'own this group' : 'are a member'}`;

  renderMap(data);
  renderSelf(viewer, policy);
  renderMembers(data);
  renderActivity();

  $('#invite-btn').hidden = viewer.role !== 'owner';
  $('#delete-group-block').hidden = viewer.role !== 'owner';
  $('#leave-owner-note').hidden = viewer.role !== 'owner';
}

/* ---------------- map ---------------- */

function renderMap(data) {
  const svg = $('#map');
  const empty = $('#map-empty');
  const caption = $('#map-caption');
  svg.innerHTML = '';

  const plotted = data.members.filter((m) => m.location && m.location.state !== 'unavailable');
  const hiddenCount = data.members.length - plotted.length;

  if (!plotted.length) {
    empty.hidden = false;
    caption.textContent = 'No current or recent position is available to show.';
    renderEmptyMapBackground(svg);
    return;
  }
  empty.hidden = true;

  const W = 800;
  const H = 520;
  const PAD = 64;

  const lat0 = plotted.reduce((s, m) => s + m.location.lat, 0) / plotted.length;
  const lng0 = plotted.reduce((s, m) => s + m.location.lng, 0) / plotted.length;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);

  const pts = plotted.map((m) => {
    const dx = (m.location.lng - lng0) * mPerDegLng;
    const dy = (m.location.lat - lat0) * mPerDegLat;
    return { m, dx, dy, r: Math.max(m.location.accuracyM, 12) };
  });

  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.dx - p.r); maxX = Math.max(maxX, p.dx + p.r);
    minY = Math.min(minY, p.dy - p.r); maxY = Math.max(maxY, p.dy + p.r);
  }
  // Minimum view span so a single accurate fix does not zoom to infinity.
  const spanX = Math.max(maxX - minX, 160);
  const spanY = Math.max(maxY - minY, 160);
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toScreen = (dx, dy) => [W / 2 + (dx - cx) * scale, H / 2 - (dy - cy) * scale];

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  // background + grid
  const defs = el('defs');
  const pattern = el('pattern', { id: 'grid', width: '40', height: '40', patternUnits: 'userSpaceOnUse' });
  pattern.appendChild(el('path', { d: 'M 40 0 L 0 0 0 40', fill: 'none', stroke: '#e3e1d8', 'stroke-width': '1' }));
  defs.appendChild(pattern);
  svg.appendChild(defs);
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#f4f2ec' }));
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#grid)' }));

  // subtle centre crosshair
  svg.appendChild(el('line', { x1: W / 2 - 9, y1: H / 2, x2: W / 2 + 9, y2: H / 2, stroke: '#cfcbbf', 'stroke-width': 1 }));
  svg.appendChild(el('line', { x1: W / 2, y1: H / 2 - 9, x2: W / 2, y2: H / 2 + 9, stroke: '#cfcbbf', 'stroke-width': 1 }));

  const palette = {
    current: { fill: '#0d635c', soft: 'rgba(13,99,92,.13)', stroke: '#0d635c' },
    stale: { fill: '#9a6208', soft: 'rgba(154,98,8,.13)', stroke: '#9a6208' },
  };

  // Accuracy circles first so markers sit above them.
  for (const p of pts) {
    const [x, y] = toScreen(p.dx, p.dy);
    const col = palette[p.m.location.state] || palette.stale;
    const r = Math.max(p.m.location.accuracyM * scale, 7);
    svg.appendChild(el('circle', {
      cx: x, cy: y, r,
      fill: col.soft,
      stroke: col.stroke,
      'stroke-width': 1,
      'stroke-dasharray': '4 4',
      opacity: 0.95,
    }));
  }

  // Markers + labels
  for (const p of pts) {
    const [x, y] = toScreen(p.dx, p.dy);
    const col = palette[p.m.location.state] || palette.stale;
    const g = el('g');
    g.setAttribute('class', 'pin');
    g.setAttribute('data-member', p.m.memberId);

    g.appendChild(el('circle', { cx: x, cy: y + 1.5, r: 14, fill: 'rgba(20,26,28,.1)' }));
    g.appendChild(el('circle', {
      cx: x, cy: y, r: 13, fill: '#ffffff', stroke: col.stroke, 'stroke-width': 2.5,
    }));
    const label = el('text', {
      x, y: y + 4.5, 'text-anchor': 'middle',
      'font-family': 'system-ui, sans-serif', 'font-size': '11', 'font-weight': '700', fill: col.fill,
    });
    label.textContent = initials(p.m.displayName);
    g.appendChild(label);

    // name + freshness under the pin
    const nameText = el('text', {
      x, y: y + 32, 'text-anchor': 'middle',
      'font-family': 'system-ui, sans-serif', 'font-size': '12', 'font-weight': '600', fill: '#151a1c',
    });
    nameText.textContent = p.m.isSelf ? `${p.m.displayName} (you)` : p.m.displayName;
    g.appendChild(nameText);

    const timeText = el('text', {
      x, y: y + 47, 'text-anchor': 'middle',
      'font-family': 'system-ui, sans-serif', 'font-size': '10.5', fill: col.fill,
    });
    timeText.textContent = `${p.m.location.state === 'current' ? 'now' : 'last seen'} · ${relTime(p.m.location.ageMs)}`;
    g.appendChild(timeText);

    if (p.m.sharing.mode === 'checkin') {
      const chip = el('text', {
        x, y: y + 61, 'text-anchor': 'middle',
        'font-family': 'system-ui, sans-serif', 'font-size': '10', fill: '#2d5570',
      });
      chip.textContent = 'checked in';
      g.appendChild(chip);
    }
    svg.appendChild(g);
  }

  // scale bar
  const targetPx = 110;
  const rawMetres = targetPx / scale;
  const nice = niceNumber(rawMetres);
  const barPx = nice * scale;
  const bx = 24;
  const by = H - 28;
  svg.appendChild(el('line', { x1: bx, y1: by, x2: bx + barPx, y2: by, stroke: '#151a1c', 'stroke-width': 2 }));
  svg.appendChild(el('line', { x1: bx, y1: by - 4, x2: bx, y2: by + 4, stroke: '#151a1c', 'stroke-width': 2 }));
  svg.appendChild(el('line', { x1: bx + barPx, y1: by - 4, x2: bx + barPx, y2: by + 4, stroke: '#151a1c', 'stroke-width': 2 }));
  const scaleText = el('text', {
    x: bx, y: by - 10, 'font-family': 'system-ui, sans-serif', 'font-size': '11', fill: '#3c474b',
  });
  scaleText.textContent = metres(nice);
  svg.appendChild(scaleText);

  // north indicator
  const n = el('g');
  n.appendChild(el('path', { d: `M ${W - 34} 30 l 6 16 l -6 -5 l -6 5 z`, fill: '#5c6a6f' }));
  const nt = el('text', {
    x: W - 34, y: 26, 'text-anchor': 'middle', 'font-family': 'system-ui, sans-serif',
    'font-size': '10', fill: '#5c6a6f', 'font-weight': '700',
  });
  nt.textContent = 'N';
  n.appendChild(nt);
  svg.appendChild(n);

  const freshest = plotted.reduce((best, m) => (m.location.ageMs < best ? m.location.ageMs : best), Infinity);
  caption.textContent = `Showing ${plotted.length} position${plotted.length === 1 ? '' : 's'}`
    + (hiddenCount ? ` · ${hiddenCount} not sharing right now` : '')
    + ` · freshest update ${relTime(freshest)}`;
}

function renderEmptyMapBackground(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', 0); rect.setAttribute('y', 0);
  rect.setAttribute('width', 800); rect.setAttribute('height', 520);
  rect.setAttribute('fill', '#f4f2ec');
  svg.appendChild(rect);
  for (let i = 1; i < 13; i += 1) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', i * 62); line.setAttribute('y1', 0);
    line.setAttribute('x2', i * 62); line.setAttribute('y2', 520);
    line.setAttribute('stroke', '#e8e6dd');
    svg.appendChild(line);
  }
  for (let i = 1; i < 9; i += 1) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 0); line.setAttribute('y1', i * 62);
    line.setAttribute('x2', 800); line.setAttribute('y2', i * 62);
    line.setAttribute('stroke', '#e8e6dd');
    svg.appendChild(line);
  }
}

function niceNumber(raw) {
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const candidates = [1, 2, 5, 10].map((n) => n * base);
  return candidates.find((c) => c >= raw) || candidates[candidates.length - 1];
}

/* ---------------- self panel ---------------- */

function renderSelf(viewer, policy) {
  const sharing = viewer.sharingState;
  const consent = viewer.consent.foreground;

  const badge = $('#self-badge');
  badge.className = 'badge ' + (sharing === 'on' ? 'current' : sharing === 'paused' ? 'paused' : 'off');
  badge.textContent = sharing === 'on' ? 'Sharing on' : sharing === 'paused' ? 'Paused' : 'Not sharing';

  $('#self-state').textContent = sharing === 'on'
    ? 'Your family can see your last reported position.'
    : sharing === 'paused'
      ? 'Paused. Nothing is stored and nothing is shown.'
      : consent
        ? 'Sharing is off. Your consent is still recorded but no position is collected.'
        : 'You have not agreed to share your location.';

  $('#share-on').hidden = sharing === 'on';
  $('#share-on').textContent = consent ? 'Turn sharing back on' : 'Turn on sharing';
  $('#share-pause').hidden = sharing !== 'on';
  $('#share-off').hidden = sharing === 'off' && !consent;

  $('#self-fineprint').textContent = sharing === 'on'
    ? `Updating while this tab is open. Your last position is deleted ${Math.round(policy.retentionMs / 60000)} minutes after it was captured.`
    : 'Nothing is being shared. Press "Turn on sharing" whenever you choose.';

  const bg = $('#bg-toggle');
  bg.checked = viewer.consent.background;
  if (!window.SafePathNative) {
    bg.disabled = true;
    $('#bg-note').textContent = 'Unavailable in this browser build. The native app requests this separately, with its own explanation, only when you choose it.';
  } else {
    bg.disabled = false;
    $('#bg-note').textContent = 'Keeps updating when your screen is locked. Uses more battery.';
  }
}

/* ---------------- members ---------------- */

function renderMembers(data) {
  const grid = $('#member-grid');
  grid.innerHTML = '';
  const sharingCount = data.members.filter((m) => m.sharing.state === 'on').length;
  $('#members-hint').textContent =
    `${sharingCount} of ${data.members.length} sharing right now. Positions are read from the server on every refresh.`;

  for (const m of data.members) {
    const card = document.createElement('div');
    card.className = 'member-card';

    const loc = m.location;
    const stateClass = loc ? loc.state : (m.sharing.state === 'paused' ? 'paused' : 'unavailable');
    const avatarState = loc && loc.state !== 'unavailable' ? loc.state : 'unavailable';

    let statusBadge;
    if (m.sharing.state === 'paused') statusBadge = '<span class="badge paused">Paused</span>';
    else if (m.sharing.state === 'off') statusBadge = '<span class="badge off">Not sharing</span>';
    else if (!loc) statusBadge = '<span class="badge unavailable">No position</span>';
    else statusBadge = `<span class="badge ${loc.state}">${loc.state === 'current' ? 'Current' : 'Stale'}</span>`;

    let detail = '';
    if (loc) {
      const acc = `${loc.accuracyM} m (${String(loc.accuracyBand).replace('_', ' ')})`;
      const lead = m.sharing.mode === 'checkin' ? 'Checked in' : (loc.state === 'current' ? 'Reported' : 'Last reported');
      detail = `
        <p class="member-detail"><strong>${lead}</strong>
          ${relTime(loc.ageMs)} <span class="muted">· ${clockTime(loc.capturedAt)}</span></p>
        <p class="member-detail">Accuracy radius <span class="num">${acc}</span></p>
        ${m.distanceFromViewerM !== null ? `<p class="member-detail">${metres(m.distanceFromViewerM)} from you</p>` : ''}
        ${m.sharing.mode === 'checkin' ? '<p class="member-detail"><strong>Checked in</strong> — a single deliberate share, not live sharing.</p>' : ''}`;
    } else {
      const reasons = {
        paused: 'Paused sharing — nothing is stored for this person.',
        not_sharing: 'Has not turned on sharing.',
        no_fix: 'Sharing is on but no position has arrived yet.',
      };
      detail = `<p class="member-detail">${escapeHtml(reasons[m.unavailableReason] || 'No position available.')}</p>`;
    }

    card.innerHTML = `
      <div class="member-top">
        <div class="avatar ${avatarState}">${escapeHtml(initials(m.displayName))}</div>
        <div class="member-who">
          <div class="member-name">${escapeHtml(m.displayName)}${m.isSelf ? '<span class="you">you</span>' : ''}</div>
          <div class="member-role">${m.role === 'owner' ? 'Group owner' : 'Adult member'}</div>
        </div>
        ${statusBadge}
      </div>
      ${detail}
      <div class="member-actions"></div>`;

    const actions = card.querySelector('.member-actions');
    if (!m.isSelf) {
      const nudge = document.createElement('button');
      nudge.className = 'btn ghost sm';
      nudge.type = 'button';
      nudge.textContent = 'Ask to check in';
      nudge.addEventListener('click', async () => {
        try {
          await api(`/api/families/${data.family.id}/checkin-request`, {
            method: 'POST', body: { memberId: m.memberId },
          });
          toast('Asked. They can ignore it — it cannot turn their location on.');
        } catch (err) { toast(err.message, 'error'); }
      });
      actions.appendChild(nudge);

      if (data.viewer.role === 'owner') {
        const remove = document.createElement('button');
        remove.className = 'btn ghost sm';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
          if (!confirmAction(`Remove ${m.displayName} from this group? Their position is deleted immediately.`)) return;
          try {
            await api(`/api/families/${data.family.id}/members/${m.memberId}`, { method: 'DELETE' });
            toast('Removed. Their stored position was deleted.', 'ok');
            refreshFamily();
          } catch (err) { toast(err.message, 'error'); }
        });
        actions.appendChild(remove);
      }
    } else {
      const selfNote = document.createElement('span');
      selfNote.className = 'hint';
      selfNote.textContent = 'Only you can change your own sharing.';
      actions.appendChild(selfNote);
    }

    grid.appendChild(card);
  }
}

/* ---------------- activity ---------------- */

const EVENT_TEXT = {
  'auth.signed_in': 'You signed in',
  'auth.code_requested': 'A sign-in code was requested',
  'family.created': 'You created a group',
  'family.left': 'You left a group',
  'family.deleted': 'You deleted a group',
  'invite.created': 'You created an invitation',
  'invite.revoked': 'You withdrew an invitation',
  'invite.accepted': 'An invitation was accepted',
  'member.removed': 'You removed a member',
  'sharing.changed': 'You changed your sharing setting',
  'consent.granted': 'You agreed to share your location',
  'consent.withdrawn': 'You withdrew location consent',
  'location.checkin': 'You checked in',
  'account.deleted': 'Account deleted',
};

async function renderActivity() {
  const list = $('#activity-list');
  try {
    const { entries } = await api('/api/me/activity');
    list.innerHTML = '';
    if (!entries.length) {
      list.innerHTML = '<li class="activity-empty">No events recorded yet.</li>';
      return;
    }
    for (const e of entries.slice(0, 40)) {
      const li = document.createElement('li');
      const when = new Date(e.ts);
      li.innerHTML = `<time datetime="${e.ts}">${when.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
        <span>${escapeHtml(EVENT_TEXT[e.event] || e.event)}${e.scope ? ` (${escapeHtml(e.scope)})` : ''}${e.state ? ` — ${escapeHtml(e.state)}` : ''}</span>`;
      list.appendChild(li);
    }
  } catch {
    list.innerHTML = '<li class="activity-empty">Activity is unavailable.</li>';
  }
}

/* ------------------------------------------------------------------ */
/* Consent + sharing                                                   */
/* ------------------------------------------------------------------ */

function openConsent() {
  const d = state.familyData;
  if (!d) return;
  $('#consent-family').textContent = d.family.name;
  $('#consent-version').textContent =
    `Consent version ${d.viewer.consent.currentVersion}. Your agreement is recorded with a timestamp so you can see exactly what you agreed to and when.`;
  openModal('modal-consent');
}

async function acceptConsent() {
  const btn = $('#consent-accept');
  btn.disabled = true;
  try {
    await api('/api/me/consent', {
      method: 'POST',
      body: { scope: 'foreground', accepted: true, version: state.familyData.viewer.consent.currentVersion },
    });
    await api('/api/me/sharing', { method: 'POST', body: { state: 'on' } });
    closeModals();
    toast('Sharing on. Sending your first position…', 'ok');
    await refreshFamily();
    startShareLoop();
    await pushFix('foreground');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function pauseSharing() {
  try {
    await api('/api/me/sharing', { method: 'POST', body: { state: 'paused' } });
    stopShareLoop();
    toast('Paused. Your stored position was deleted.', 'ok');
    await refreshFamily();
  } catch (err) { toast(err.message, 'error'); }
}

async function stopSharingAndClear() {
  if (!confirmAction('Stop sharing, delete your stored position and withdraw your consent? You will be asked again before anything is shared.')) return;
  try {
    await api('/api/me/sharing', { method: 'POST', body: { state: 'off' } });
    await api('/api/me/consent', { method: 'POST', body: { scope: 'foreground', accepted: false } });
    stopShareLoop();
    toast('Stopped. Consent withdrawn and position deleted.', 'ok');
    await refreshFamily();
  } catch (err) { toast(err.message, 'error'); }
}

async function turnSharingOn() {
  const d = state.familyData;
  if (!d) return;
  if (!d.viewer.consent.foreground) {
    openConsent();
    return;
  }
  try {
    await api('/api/me/sharing', { method: 'POST', body: { state: 'on' } });
    toast('Sharing on.', 'ok');
    await refreshFamily();
    startShareLoop();
    await pushFix('foreground');
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------------- geolocation ---------------- */

function getFix() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      const e = new Error('This browser cannot provide a position.');
      e.code = 'unsupported';
      return reject(e);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        capturedAt: pos.timestamp || Date.now(),
      }),
      (err) => {
        const e = new Error(
          err.code === 1 ? 'Location permission was denied in the browser.'
            : err.code === 2 ? 'No position fix is available right now.'
              : 'Timed out waiting for a position.',
        );
        e.code = err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'timeout';
        reject(e);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

async function pushFix(source) {
  const d = state.familyData;
  if (!d) return null;
  try {
    const fix = await getFix();
    state.lastFix = fix;
    const endpoint = source === 'checkin' ? '/api/me/checkin' : '/api/me/location';
    await api(endpoint, {
      method: 'POST',
      body: { memberId: d.viewer.memberId, ...fix, source },
    });
    await refreshFamily();
    return fix;
  } catch (err) {
    if (err.code === 'denied') {
      toast(`${err.message} You can still see others if they share.`, 'error');
    } else if (err.code) {
      toast(err.message, 'error');
    } else {
      toast(err.message, 'error');
    }
    return null;
  }
}

function startShareLoop() {
  stopShareLoop();
  if (!state.familyData || state.familyData.viewer.sharingState !== 'on') return;
  state.shareTimer = setInterval(() => {
    if (document.visibilityState === 'visible') pushFix('foreground');
  }, 30_000);
}
function stopShareLoop() {
  if (state.shareTimer) clearInterval(state.shareTimer);
  state.shareTimer = null;
}

async function checkIn() {
  const btn = $('#checkin-btn');
  btn.disabled = true;
  try {
    await pushFix('checkin');
    toast('Checked in. Your family can see this one position.', 'ok');
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Invitations                                                         */
/* ------------------------------------------------------------------ */

async function openInvite() {
  if (!state.familyData) return;
  openModal('modal-invite');
  $('#invite-link').value = 'Creating a link…';
  $('#invite-countdown').textContent = '';
  try {
    const { invite } = await api(`/api/families/${state.familyData.family.id}/invites`, { method: 'POST' });
    $('#invite-link').value = invite.link;
    $('#invite-ttl').textContent = `${Math.round(invite.expiresInSec / 60)} minutes`;
    startCountdown('invite', invite.expiresAt, $('#invite-countdown'));
    await renderInviteList();
  } catch (err) {
    $('#invite-link').value = '';
    toast(err.message, 'error');
  }
}

async function renderInviteList() {
  if (!state.familyData) return;
  const list = $('#invite-list');
  try {
    const { invites } = await api(`/api/families/${state.familyData.family.id}/invites`);
    list.innerHTML = '';
    if (!invites.length) {
      list.innerHTML = '<li class="hint">No invitations yet.</li>';
      return;
    }
    for (const inv of invites) {
      const li = document.createElement('li');
      const status = inv.status === 'active'
        ? `expires ${relTime(-(inv.expiresAt - Date.now()))}`
        : inv.status;
      li.innerHTML = `<span>${status} <span class="muted">· created ${clockTime(inv.createdAt)}</span></span>`;
      if (inv.status === 'active') {
        const btn = document.createElement('button');
        btn.className = 'btn ghost sm';
        btn.type = 'button';
        btn.textContent = 'Withdraw';
        btn.addEventListener('click', async () => {
          try {
            await api(`/api/invites/${inv.id}`, { method: 'DELETE' });
            toast('Invitation withdrawn.', 'ok');
            renderInviteList();
          } catch (err) { toast(err.message, 'error'); }
        });
        li.appendChild(btn);
      }
      list.appendChild(li);
    }
  } catch (err) {
    list.innerHTML = `<li class="hint">${escapeHtml(err.message)}</li>`;
  }
}

function startCountdown(key, expiresAt, el) {
  if (state.countdownTimers.has(key)) clearInterval(state.countdownTimers.get(key));
  const tick = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      el.textContent = 'This invitation has expired.';
      clearInterval(state.countdownTimers.get(key));
      state.countdownTimers.delete(key);
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `Expires in ${m}:${String(s).padStart(2, '0')} — single use.`;
  };
  tick();
  state.countdownTimers.set(key, setInterval(tick, 1000));
}

async function openJoinFromToken(token) {
  try {
    const peek = await api('/api/invites/peek', { method: 'POST', body: { token } });
    state.pendingJoinPeek = { ...peek, token };
    $('#join-family-name').textContent = peek.familyName;
    $('#join-inviter').textContent = `${peek.inviterName} invited you · ${peek.membersHint} ${peek.membersHint === 1 ? 'person' : 'people'} in the group`;
    startCountdown('join', peek.expiresAt, $('#join-countdown'));
    openModal('modal-join');
    renderHome();
    show('view-home');
  } catch (err) {
    toast(err.message, 'error');
    state.pendingInviteToken = null;
    renderHome();
    show('view-home');
  }
}

async function acceptJoin() {
  if (!state.pendingJoinPeek) return;
  const btn = $('#join-accept');
  btn.disabled = true;
  try {
    const res = await api('/api/invites/accept', {
      method: 'POST', body: { token: state.pendingJoinPeek.token },
    });
    closeModals();
    state.pendingJoinPeek = null;
    state.pendingInviteToken = null;
    toast('Joined. You are not sharing anything yet — choose below.', 'ok');
    await boot();
    state.currentFamilyId = res.family.id;
    await openFamily(res.family.id);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Group management                                                    */
/* ------------------------------------------------------------------ */

async function leaveGroup() {
  if (!state.familyData) return;
  if (!confirmAction('Leave this group? Your position is deleted and your membership ends immediately.')) return;
  try {
    await api(`/api/families/${state.familyData.family.id}/leave`, { method: 'POST' });
    closeModals();
    stopPolling();
    stopShareLoop();
    state.currentFamilyId = null;
    toast('You left the group.', 'ok');
    await boot();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteGroup() {
  if (!state.familyData) return;
  if (!confirmAction('Delete this group and everything in it? This cannot be undone.')) return;
  try {
    await api(`/api/families/${state.familyData.family.id}`, { method: 'DELETE' });
    closeModals();
    stopPolling();
    stopShareLoop();
    state.currentFamilyId = null;
    toast('Group deleted.', 'ok');
    await boot();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteMyData() {
  if (!confirmAction('Delete your account, every membership and every stored position? This cannot be undone.')) return;
  try {
    await api('/api/me/data', { method: 'DELETE' });
    stopPolling();
    stopShareLoop();
    state.user = null;
    state.currentFamilyId = null;
    closeModals();
    toast('Everything stored about you has been deleted.', 'ok');
    show('view-auth');
    $('#signout-btn').hidden = true;
  } catch (err) { toast(err.message, 'error'); }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  $('#auth-send').addEventListener('click', sendCode);
  $('#auth-verify').addEventListener('click', verifyCode);
  $('#auth-restart').addEventListener('click', () => {
    $('#auth-step-email').hidden = false;
    $('#auth-step-code').hidden = true;
    showAuthError('');
  });
  $('#auth-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyCode(); });
  $('#auth-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCode(); });
  $('#signout-btn').addEventListener('click', signOut);

  $('#open-create').addEventListener('click', createFamily);
  $('#join-peek').addEventListener('click', () => {
    const token = $('#join-token').value.trim();
    if (token.length < 20) return toast('Paste the full invitation code.', 'error');
    openJoinFromToken(token);
  });
  $('#back-home').addEventListener('click', async () => {
    stopPolling();
    stopShareLoop();
    await boot();
  });

  $('#invite-btn').addEventListener('click', openInvite);
  $('#invite-close').addEventListener('click', closeModals);
  $('#invite-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#invite-link').value);
      toast('Link copied.', 'ok');
    } catch {
      $('#invite-link').select();
      toast('Press ⌘/Ctrl+C to copy.');
    }
  });

  $('#consent-cancel').addEventListener('click', closeModals);
  $('#consent-accept').addEventListener('click', acceptConsent);

  $('#share-on').addEventListener('click', turnSharingOn);
  $('#share-pause').addEventListener('click', pauseSharing);
  $('#share-off').addEventListener('click', stopSharingAndClear);
  $('#checkin-btn').addEventListener('click', checkIn);
  $('#refresh-btn').addEventListener('click', refreshFamily);
  $('#delete-data-btn').addEventListener('click', deleteMyData);

  $('#bg-toggle').addEventListener('change', async (e) => {
    if (!window.SafePathNative) { e.target.checked = false; return; }
    try {
      await api('/api/me/consent', {
        method: 'POST', body: { scope: 'background', accepted: e.target.checked },
      });
      toast(e.target.checked ? 'Background updates agreed.' : 'Background updates stopped.', 'ok');
      refreshFamily();
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message, 'error');
    }
  });

  $('#manage-btn').addEventListener('click', () => openModal('modal-manage'));
  $('#manage-close').addEventListener('click', closeModals);
  $('#leave-btn').addEventListener('click', leaveGroup);
  $('#delete-group-btn').addEventListener('click', deleteGroup);

  $('#join-cancel').addEventListener('click', () => { closeModals(); state.pendingJoinPeek = null; });
  $('#join-accept').addEventListener('click', acceptJoin);

  function switchLegalTab(tab) {
    const isTerms = tab === 'terms';
    $('#legal-content-terms').hidden = !isTerms;
    $('#legal-content-privacy').hidden = isTerms;
    $('#tab-terms-btn').classList.toggle('active', isTerms);
    $('#tab-privacy-btn').classList.toggle('active', !isTerms);
  }

  $('#legal-terms-btn').addEventListener('click', () => {
    switchLegalTab('terms');
    openModal('modal-legal');
  });
  $('#legal-privacy-btn').addEventListener('click', () => {
    switchLegalTab('privacy');
    openModal('modal-legal');
  });
  $('#tab-terms-btn').addEventListener('click', () => switchLegalTab('terms'));
  $('#tab-privacy-btn').addEventListener('click', () => switchLegalTab('privacy'));
  $('#legal-close').addEventListener('click', closeModals);

  // Pricing modal
  $('#pricing-btn').addEventListener('click', () => openModal('modal-pricing'));
  $('#footer-pricing-btn').addEventListener('click', () => openModal('modal-pricing'));
  $('#pricing-close').addEventListener('click', closeModals);

  for (const card of $$('.tier-card')) {
    card.addEventListener('click', () => {
      for (const c of $$('.tier-card')) c.classList.remove('selected');
      card.classList.add('selected');
    });
  }

  $('#pricing-select-btn').addEventListener('click', () => {
    const selected = $('.tier-card.selected');
    const tierName = selected ? selected.querySelector('.tier-name').textContent : 'Plus';
    toast(`Plan vald: ${tierName}. I mobilappen slutförs köpet säkert via StoreKit/Google Play.`, 'ok');
    closeModals();
  });

  // Emergency SOS modal
  let emergencyCoords = null;
  function updateEmergencyCoordsDisplay() {
    if (!navigator.geolocation) {
      $('#emergency-coords-display').textContent = 'Geolokalisering stöds inte i webbläsaren';
      return;
    }
    $('#emergency-coords-display').textContent = 'Hämtar GPS-position…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        emergencyCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy),
        };
        const latStr = `${emergencyCoords.lat.toFixed(5)}° ${emergencyCoords.lat >= 0 ? 'N' : 'S'}`;
        const lngStr = `${emergencyCoords.lng.toFixed(5)}° ${emergencyCoords.lng >= 0 ? 'E' : 'W'}`;
        $('#emergency-coords-display').textContent = `${latStr}, ${lngStr}`;
        $('#emergency-coords-meta').textContent = `Noggrannhet: ±${emergencyCoords.acc} m · Hämtad nyss`;
      },
      (err) => {
        $('#emergency-coords-display').textContent = 'Kunde inte läsa position (tillåt behörighet)';
        $('#emergency-coords-meta').textContent = err.message;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  function setEmergencyNumber(num) {
    const callBtn = $('#emergency-call-btn');
    callBtn.href = `tel:${num}`;
    callBtn.textContent = `📞 Ring ${num} direkt`;
    $('#btn-num-112').classList.toggle('active', num === '112');
    $('#btn-num-911').classList.toggle('active', num === '911');
    $('#btn-num-999').classList.toggle('active', num === '999');
  }

  $('#btn-num-112').addEventListener('click', () => setEmergencyNumber('112'));
  $('#btn-num-911').addEventListener('click', () => setEmergencyNumber('911'));
  $('#btn-num-999').addEventListener('click', () => setEmergencyNumber('999'));

  function openEmergencyModal() {
    openModal('modal-emergency');
    updateEmergencyCoordsDisplay();
  }

  $('#emergency-btn').addEventListener('click', openEmergencyModal);
  $('#footer-emergency-btn').addEventListener('click', openEmergencyModal);
  $('#emergency-close').addEventListener('click', closeModals);

  $('#emergency-copy-coords-btn').addEventListener('click', () => {
    if (!emergencyCoords) {
      toast('Inga koordinater att kopiera än', 'error');
      return;
    }
    const txt = `${emergencyCoords.lat.toFixed(5)}, ${emergencyCoords.lng.toFixed(5)} (±${emergencyCoords.acc}m)`;
    navigator.clipboard?.writeText(txt).then(() => {
      toast('Koordinater kopierade till urklipp! ✓', 'ok');
    }).catch(() => {
      toast(txt, 'ok');
    });
  });

  $('#emergency-sms-btn').addEventListener('click', () => {
    if (!emergencyCoords) {
      toast('Inga koordinater tillgängliga än', 'error');
      return;
    }
    const maps = `https://maps.google.com/?q=${emergencyCoords.lat.toFixed(5)},${emergencyCoords.lng.toFixed(5)}`;
    const msg = encodeURIComponent(`🚨 Nödläge! Min position är lat: ${emergencyCoords.lat.toFixed(5)}, lon: ${emergencyCoords.lng.toFixed(5)} (±${emergencyCoords.acc}m). Karta: ${maps}`);
    window.location.href = `sms:?body=${msg}`;
  });

  $('#modal-backdrop').addEventListener('click', closeModals);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.currentFamilyId) refreshFamily();
  });
}

wire();
boot().catch((err) => {
  console.error(err);
  show('view-auth');
});

/* Poruwe Admin Console */
(function () {
  'use strict';
  const API = window.PORUWE_API;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LKR = (n) => (Math.round(+n || 0) === 0 ? 'FREE' : 'LKR ' + Math.round(+n || 0).toLocaleString('en-US'));
  const fdate = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }) : '—';
  const STATUS_LABEL = { draft: 'Draft', pending_payment: 'Awaiting payment', pending_verification: 'Verify payment', active: 'Live', rejected: 'Rejected', expired: 'Expired', revoked: 'Revoked' };

  let token = localStorage.getItem('poruwe_admin_token') || '';
  let view = 'dashboard';
  let ordersState = { status: '', kind: '', q: '', rows: [], total: 0 };
  let templatesCache = [];

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3000);
  }

  async function api(path, opts) {
    const o = opts || {};
    const r = await fetch(API + path, {
      method: o.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    if (r.status === 401) { logout(); throw new Error('Session expired — sign in again'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || 'Request failed');
    return j;
  }

  /* -------------------------------- auth -------------------------------- */
  function showShell(on) {
    $('#loginScreen').style.display = on ? 'none' : 'flex';
    $('#shell').classList.toggle('on', on);
  }
  function logout() {
    token = '';
    localStorage.removeItem('poruwe_admin_token');
    showShell(false);
  }
  $('#loginBtn').onclick = async () => {
    const pass = $('#loginPass').value;
    $('#loginErr').textContent = '';
    try {
      const j = await fetch(API + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) }).then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(r.status === 429 ? 'Too many attempts — wait 15 minutes' : 'Wrong password'); return b; });
      token = j.token;
      localStorage.setItem('poruwe_admin_token', token);
      showShell(true);
      go('dashboard');
    } catch (e) { $('#loginErr').textContent = e.message; }
  };
  $('#loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#logoutBtn').onclick = logout;
  $('#openSite').href = API;
  $('#burger') && ($('#burger').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); });
  document.addEventListener('click', (e) => {
    const side = $('#side');
    if (side.classList.contains('open') && !side.contains(e.target)) side.classList.remove('open');
  });
  $('#refreshBtn').onclick = () => go(view);

  /* ------------------------------ navigation ----------------------------- */
  document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { $('#side').classList.remove('open'); go(b.dataset.view); });
  function go(v) {
    view = v;
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('cur', b.dataset.view === v));
    $('#viewTitle').textContent = { dashboard: 'Dashboard', orders: 'Orders', templates: 'Templates', settings: 'Settings' }[v];
    $('#viewSub').textContent = '';
    ({ dashboard: renderDashboard, orders: renderOrders, templates: renderTemplates, settings: renderSettings })[v]();
  }

  /* ------------------------------ dashboard ------------------------------ */
  async function renderDashboard() {
    $('#view').innerHTML = '<div class="empty">Loading…</div>';
    let j;
    try { j = await api('/api/admin/overview'); } catch (e) { $('#view').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const s = j.stats, by = s.byStatus || {};
    $('#viewSub').textContent = 'Live overview of the platform';
    const tiles = [
      ['Awaiting verification', by.pending_verification || 0, (by.pending_verification || 0) > 0],
      ['Live invitations', by.active || 0, false],
      ['Drafts', by.draft || 0, false],
      ['Weddings in next 7 days', s.upcomingWeddings || 0, false],
      ['Revenue (paid)', LKR(s.revenue), true],
    ];
    const weekly = s.weekly || [];
    const maxW = Math.max(1, ...weekly.map((w) => w.n));
    $('#view').innerHTML = `
      <div class="tiles">${tiles.map(([k, v, gold]) => `<div class="tile ${gold ? 'gold' : ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
      ${weekly.length ? `<div class="card"><div class="card-h"><h3>Orders — last 8 weeks</h3></div><div class="bars">${weekly.map((w) => `<div class="bar" style="height:${Math.round((w.n / maxW) * 100)}%" title="${w.n} orders"><span>${w.wk.slice(5)}</span></div>`).join('')}</div><div style="height:26px"></div></div>` : ''}
      <div class="card"><div class="card-h"><h3>Recent orders</h3><button class="btn btn-ghost btn-sm" onclick="window.__go('orders')">View all →</button></div>${ordersTable(j.recent || [])}</div>`;
    bindOrderRows(j.recent || []);
  }
  window.__go = go;

  /* -------------------------------- orders ------------------------------- */
  function ordersTable(rows) {
    if (!rows.length) return '<div class="empty">No orders yet — they will appear here the moment someone starts building.</div>';
    const table = `<div class="otable" style="overflow-x:auto"><table><thead><tr><th>Order</th><th>Couple</th><th>Template</th><th>Status</th><th>Amount</th><th>Wedding</th><th>Created</th></tr></thead><tbody>
      ${rows.map((o) => {
        const c = (o.data && o.data.couple) || {};
        return `<tr data-oid="${o.id}"><td class="mono">${esc(o.order_no)}</td><td>${esc(c.groom || '—')} & ${esc(c.bride || '—')}</td><td>${esc(o.template_id)}</td>
          <td><span class="chip c-${o.status}">${STATUS_LABEL[o.status] || o.status}</span></td>
          <td>${o.payment && o.payment.amount != null ? LKR(o.payment.amount) : '—'}</td>
          <td>${o.wedding_date ? String(o.wedding_date).slice(0, 10) : '—'}</td><td>${fdate(o.created_at)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    const cards = `<div class="ocards">
      ${rows.map((o) => {
        const c = (o.data && o.data.couple) || {};
        return `<div class="ocard" data-oid="${o.id}">
          <div class="row1"><span class="names">${esc(c.groom || '—')} &amp; ${esc(c.bride || '—')}</span><span class="chip c-${o.status}">${STATUS_LABEL[o.status] || o.status}</span></div>
          <div class="row2"><span class="mono">${esc(o.order_no)}</span><span>${esc(o.template_id)}</span><span>${o.payment && o.payment.amount != null ? LKR(o.payment.amount) : '—'}</span></div>
        </div>`;
      }).join('')}</div>`;
    return table + cards;
  }
  function bindOrderRows(rows) {
    document.querySelectorAll('[data-oid]').forEach((tr) => tr.onclick = () => openDrawer(tr.dataset.oid));
  }

  async function renderOrders() {
    $('#viewSub').textContent = 'Click any order to manage it';
    $('#view').innerHTML = `
      <div class="card"><div class="card-h">
        <div class="filters">
          <select id="fStatus"><option value="">All statuses</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${ordersState.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select id="fKind"><option value="">All kinds</option><option value="website" ${ordersState.kind === 'website' ? 'selected' : ''}>Website</option><option value="pdf" ${ordersState.kind === 'pdf' ? 'selected' : ''}>PDF</option><option value="image" ${ordersState.kind === 'image' ? 'selected' : ''}>Image</option></select>
          <input id="fQ" placeholder="Search order no, names, phone…" value="${esc(ordersState.q)}" />
        </div>
        <button class="btn btn-ghost btn-sm" id="csvBtn">Export CSV</button>
      </div><div id="ordersBox"><div class="empty">Loading…</div></div></div>`;
    $('#fStatus').onchange = () => { ordersState.status = $('#fStatus').value; loadOrders(); };
    $('#fKind').onchange = () => { ordersState.kind = $('#fKind').value; loadOrders(); };
    let qt; $('#fQ').oninput = () => { clearTimeout(qt); qt = setTimeout(() => { ordersState.q = $('#fQ').value.trim(); loadOrders(); }, 400); };
    $('#csvBtn').onclick = exportCsv;
    loadOrders();
  }

  async function loadOrders() {
    try {
      const p = new URLSearchParams();
      if (ordersState.status) p.set('status', ordersState.status);
      if (ordersState.kind) p.set('kind', ordersState.kind);
      if (ordersState.q) p.set('q', ordersState.q);
      p.set('limit', '100');
      const j = await api('/api/admin/orders?' + p);
      ordersState.rows = j.orders; ordersState.total = j.total;
      $('#viewSub').textContent = `${j.total} order${j.total === 1 ? '' : 's'}`;
      $('#ordersBox').innerHTML = ordersTable(j.orders);
      bindOrderRows(j.orders);
    } catch (e) { $('#ordersBox').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  function exportCsv() {
    const rows = ordersState.rows;
    if (!rows.length) return toast('Nothing to export', true);
    const head = ['order_no', 'status', 'template', 'kind', 'groom', 'bride', 'customer', 'customer_wa', 'amount', 'method', 'reference', 'paid_at', 'wedding_date', 'created_at'];
    const csv = [head.join(',')].concat(rows.map((o) => {
      const c = (o.data && o.data.couple) || {}, cu = (o.data && o.data.customer) || {}, p = o.payment || {};
      return [o.order_no, o.status, o.template_id, o.kind, c.groom, c.bride, cu.name, cu.wa, p.amount, p.method, p.reference, p.paidAt, o.wedding_date, o.created_at]
        .map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',');
    })).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `poruwe-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  /* -------------------------------- drawer ------------------------------- */
  function closeDrawer() { $('#drawer').classList.remove('on'); $('#overlay').classList.remove('on'); }
  $('#drawerClose').onclick = closeDrawer;
  $('#overlay').onclick = closeDrawer;

  async function openDrawer(id) {
    $('#drawer').classList.add('on'); $('#overlay').classList.add('on');
    $('#drawerTitle').textContent = 'Loading…';
    $('#drawerBody').innerHTML = '';
    $('#drawerActions').innerHTML = '';
    let j;
    try { j = await api('/api/admin/orders/' + id); } catch (e) { $('#drawerBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const o = j.order, d = o.data || {}, c = d.couple || {}, cu = d.customer || {}, p = o.payment || {};
    $('#drawerTitle').textContent = `${o.order_no} · ${STATUS_LABEL[o.status] || o.status}`;
    const photoIds = Object.entries(d.photos || {}).filter(([, v]) => v);
    if (p.slipImage) photoIds.push(['payment slip', p.slipImage]);
    const liveUrl = o.slug ? `${API}/i/${o.slug}` : null;
    $('#drawerBody').innerHTML = `
      <div class="kv">
        <div class="k">Couple</div><div class="v">${esc(c.groom || '—')} &amp; ${esc(c.bride || '—')}</div>
        <div class="k">Template</div><div class="v">${esc(o.template_id)} (${esc(o.kind)})</div>
        <div class="k">Customer</div><div class="v">${esc(cu.name || '—')}${cu.wa ? ` · <a href="https://wa.me/${esc(cu.wa)}" target="_blank" rel="noopener">+${esc(cu.wa)}</a>` : ''}</div>
        <div class="k">Wedding date</div><div class="v">${o.wedding_date ? String(o.wedding_date).slice(0, 10) : '—'}</div>
        <div class="k">Expires</div><div class="v">${fdate(o.expires_at)}</div>
        <div class="k">Created</div><div class="v">${fdate(o.created_at)}</div>
        ${liveUrl ? `<div class="k">Live link</div><div class="v"><a href="${liveUrl}" target="_blank" rel="noopener">${liveUrl}</a></div>` : ''}
      </div>
      <div class="sect">Payment</div>
      <div class="kv">
        <div class="k">Method</div><div class="v">${esc(p.method || '—')}</div>
        <div class="k">Amount</div><div class="v">${p.amount != null ? LKR(p.amount) : '—'}</div>
        <div class="k">Reference</div><div class="v">${esc(p.reference || '—')}</div>
        <div class="k">Paid at</div><div class="v">${fdate(p.paidAt)}</div>
        ${p.rejectReason ? `<div class="k">Reject reason</div><div class="v">${esc(p.rejectReason)}</div>` : ''}
      </div>
      ${photoIds.length ? `<div class="sect">Images</div><div class="thumbs">${photoIds.map(([k, v]) => `<img src="${API}/img/${esc(v)}" title="${esc(k)}" data-zoom="${API}/img/${esc(v)}" />`).join('')}</div>` : ''}
      <div class="sect">Preview &amp; documents</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="${API}/p/${esc(o.token)}" target="_blank" rel="noopener">Open preview</a>
        <a class="btn btn-ghost btn-sm" href="${API}/receipt/${esc(o.token)}" target="_blank" rel="noopener">Receipt</a>
        <a class="btn btn-ghost btn-sm" href="${API}/status/${esc(o.token)}" target="_blank" rel="noopener">Customer status page</a>
      </div>
      <div class="sect">Activity</div>
      <div class="auditlog">${(j.audit || []).map((a) => `<div><b>${esc(a.action)}</b> · ${fdate(a.at)}</div>`).join('') || '—'}</div>`;
    $('#drawerBody').querySelectorAll('[data-zoom]').forEach((im) => im.onclick = () => { $('#lightboxImg').src = im.dataset.zoom; $('#lightbox').classList.add('on'); });

    const acts = [];
    if (['pending_verification', 'pending_payment', 'draft', 'rejected'].includes(o.status)) acts.push(`<button class="btn btn-gold" data-act="approve">Approve & activate</button>`);
    if (['pending_verification', 'pending_payment'].includes(o.status)) acts.push(`<button class="btn btn-red" data-act="reject">Reject</button>`);
    if (o.status === 'active') {
      acts.push(`<button class="btn btn-line" data-act="extend">Extend +7 days</button>`);
      acts.push(`<button class="btn btn-red" data-act="revoke">Revoke & purge</button>`);
      if (liveUrl) acts.push(`<button class="btn btn-ghost" data-act="copy">Copy link</button>`);
    }
    $('#drawerActions').innerHTML = acts.join('');
    $('#drawerActions').querySelectorAll('[data-act]').forEach((b) => b.onclick = () => doAction(o, b.dataset.act, liveUrl));
  }

  async function doAction(o, act, liveUrl) {
    try {
      if (act === 'copy') { await navigator.clipboard.writeText(liveUrl); return toast('Link copied'); }
      if (act === 'approve') {
        const j = await api(`/api/admin/orders/${o.id}/approve`, { method: 'POST' });
        toast(`Activated — ${j.order.slug ? 'live at /i/' + j.order.slug : 'deliverable unlocked'}`);
      }
      if (act === 'reject') {
        const reason = prompt('Reason (shown to the customer):', 'Payment could not be verified. Please contact us.');
        if (reason == null) return;
        await api(`/api/admin/orders/${o.id}/reject`, { method: 'POST', body: { reason } });
        toast('Order rejected');
      }
      if (act === 'revoke') {
        if (!confirm('Revoke this invitation and permanently purge its data? This cannot be undone.')) return;
        await api(`/api/admin/orders/${o.id}/revoke`, { method: 'POST' });
        toast('Revoked and purged');
      }
      if (act === 'extend') {
        const j = await api(`/api/admin/orders/${o.id}/extend`, { method: 'POST', body: { days: 7 } });
        toast('Extended to ' + fdate(j.order.expires_at));
      }
      openDrawer(o.id);
      if (view === 'orders') loadOrders(); else if (view === 'dashboard') renderDashboard();
    } catch (e) { toast(e.message, true); }
  }

  $('#lightbox').onclick = () => $('#lightbox').classList.remove('on');

  /* ------------------------------ templates ------------------------------ */
  async function renderTemplates() {
    $('#viewSub').textContent = 'Prices update instantly across the site';
    $('#view').innerHTML = '<div class="empty">Loading…</div>';
    try { templatesCache = await api('/api/admin/templates'); } catch (e) { $('#view').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    $('#view').innerHTML = `<div class="card"><div class="card-h"><h3>Template catalogue</h3></div>
      <div style="overflow-x:auto"><table><thead><tr><th>Template</th><th>Kind</th><th>Tier</th><th>Price (LKR)</th><th>Visible</th><th></th></tr></thead><tbody>
      ${templatesCache.map((t) => `<tr style="cursor:default">
        <td><b style="color:var(--cream)">${esc(t.name)}</b><br><span style="color:var(--muted);font-size:.72rem">${esc(t.tagline || '')}</span></td>
        <td>${esc(t.kind)}</td><td>${esc(t.tier)}</td>
        <td><input type="number" min="0" step="100" value="${t.price_lkr}" data-price="${t.id}" style="width:110px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--text);padding:8px 10px" /></td>
        <td><div class="switch ${t.active ? 'on' : ''}" data-active="${t.id}"></div></td>
        <td><button class="btn btn-line btn-sm" data-savetpl="${t.id}">Save</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    document.querySelectorAll('[data-active]').forEach((s) => s.onclick = () => s.classList.toggle('on'));
    document.querySelectorAll('[data-savetpl]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.savetpl;
      try {
        await api(`/api/admin/templates/${id}`, { method: 'PUT', body: {
          price_lkr: +document.querySelector(`[data-price="${id}"]`).value,
          active: document.querySelector(`[data-active="${id}"]`).classList.contains('on'),
        } });
        toast('Template updated');
      } catch (e) { toast(e.message, true); }
    });
  }

  /* ------------------------------- settings ------------------------------ */
  async function renderSettings() {
    $('#viewSub').textContent = 'Payments, support and security';
    $('#view').innerHTML = '<div class="empty">Loading…</div>';
    let s;
    try { s = await api('/api/admin/settings'); } catch (e) { $('#view').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const b = s.bank || {}, ph = s.payhere || {};
    $('#view').innerHTML = `
      <div class="card"><div class="card-h"><h3>Bank transfer details (shown to customers)</h3></div><div style="padding:22px">
        <div class="frow2">
          <div class="f"><label>Account name</label><input id="sBankName" value="${esc(b.accountName || '')}" /></div>
          <div class="f"><label>Bank</label><input id="sBank" value="${esc(b.bank || '')}" /></div>
          <div class="f"><label>Branch</label><input id="sBranch" value="${esc(b.branch || '')}" /></div>
          <div class="f"><label>Account number</label><input id="sAccNo" value="${esc(b.accountNumber || '')}" /></div>
        </div>
      </div></div>
      <div class="card"><div class="card-h"><h3>PayHere (online payments)</h3></div><div style="padding:22px">
        <div class="frow2">
          <div class="f"><label>Merchant ID</label><input id="sPhId" value="${esc(ph.merchantId || '')}" placeholder="Leave blank to disable" /></div>
          <div class="f"><label>Merchant secret</label><input id="sPhSecret" type="password" value="${esc(ph.merchantSecret || '')}" /></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px"><div class="switch ${ph.sandbox ? 'on' : ''}" id="sPhSandbox"></div><span style="font-size:.78rem;color:var(--muted)">Sandbox mode (turn off when your PayHere account is live)</span></div>
        <p style="font-size:.74rem;color:var(--muted);margin-top:12px">Stripe: planned — a US Stripe account can be plugged into the platform's payment adapter without changing anything else.</p>
      </div></div>
      <div class="card"><div class="card-h"><h3>Support & security</h3></div><div style="padding:22px">
        <div class="frow2">
          <div class="f"><label>Support WhatsApp number</label><input id="sSupport" value="${esc(s.supportWhatsapp || '')}" placeholder="9477xxxxxxx" /></div>
          <div class="f"><label>New admin password (optional)</label><input id="sNewPass" type="password" placeholder="Leave blank to keep current" /></div>
        </div>
      </div></div>
      <button class="btn btn-gold" id="saveSettings">Save all settings</button>`;
    $('#sPhSandbox').onclick = () => $('#sPhSandbox').classList.toggle('on');
    $('#saveSettings').onclick = async () => {
      try {
        const body = {
          bank: { accountName: $('#sBankName').value, bank: $('#sBank').value, branch: $('#sBranch').value, accountNumber: $('#sAccNo').value },
          payhere: { merchantId: $('#sPhId').value, merchantSecret: $('#sPhSecret').value, sandbox: $('#sPhSandbox').classList.contains('on') },
          supportWhatsapp: $('#sSupport').value,
        };
        const np = $('#sNewPass').value;
        if (np) body.newAdminPassword = np;
        await api('/api/admin/settings', { method: 'PUT', body });
        toast('Settings saved');
        if (np) { toast('Password changed — sign in again'); setTimeout(logout, 1200); }
      } catch (e) { toast(e.message, true); }
    };
  }

  /* --------------------------------- boot -------------------------------- */
  if (token) { showShell(true); go('dashboard'); } else showShell(false);
})();

/* ==========================================================
   我的穿搭灵感库
   架构：纯静态网站 + GitHub 仓库当数据库
   - 访客：只读浏览（拉取 data/inspirations.json）
   - 主人：输入 Token 解锁编辑，凭证保存在本设备浏览器，
     之后免输；每次编辑自动 commit 到 GitHub，
     GitHub Pages 约 1 分钟内自动更新网站
   ========================================================== */

'use strict';

/* ---------- 常量 & 状态 ---------- */
const API = 'https://api.github.com';
const DATA_PATH = 'data/inspirations.json';
const LS_KEY = 'outfit_owner_settings';
const MAX_PHOTOS = 6;

const state = {
  cards: [],
  filter: 'all',
  keyword: '',
  owner: false,
};

/* ---------- 小工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const today = () => new Date().toISOString().slice(0, 10);
const genId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', isErr);
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, isErr ? 5000 : 3200);
}

/* ---------- 主人凭证（本设备 localStorage） ---------- */
function getSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function saveSettings(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
function clearSettings() { localStorage.removeItem(LS_KEY); }

function setMode(owner) {
  state.owner = owner;
  const badge = $('#modeBadge');
  badge.textContent = owner ? '编辑模式' : '只读模式';
  badge.className = 'mode-badge ' + (owner ? 'owner' : 'readonly');
  $('#btnAdd').hidden = !owner;
  $('#btnUnlock').hidden = owner;
  $('#btnLock').hidden = !owner;
}

/* ---------- 数据加载 ---------- */
async function loadCards() {
  const grid = $('#grid');
  grid.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const res = await fetch(`${DATA_PATH}?t=${Date.now()}`);
    if (res.ok) {
      const j = await res.json();
      state.cards = Array.isArray(j.cards) ? j.cards : [];
    } else {
      state.cards = []; // 数据文件还不存在 → 空库
    }
  } catch {
    state.cards = [];
  }
  render();
}

/* ---------- 渲染 ---------- */
const NO_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/* 兼容旧数据（单图 image 字符串）与新数据（images 数组） */
function cardImages(c) {
  if (Array.isArray(c.images) && c.images.length) return c.images;
  if (c.image) return [c.image];
  return [];
}

function cardBadge(c) {
  if (c.decision === 'wait') return ['观望中', 'b-wait'];
  if (c.decision === 'skip') return ['决定不买', 'b-skip'];
  if (c.decision === 'buy') {
    if (c.kept === 'kept') return ['已购 · 留下', 'b-kept'];
    if (c.kept === 'returned') return ['已购 · 退掉', 'b-returned'];
    if (c.kept === 'idle') return ['已购 · 闲置', 'b-idle'];
    return ['已购入', 'b-kept'];
  }
  return ['灵感', 'b-idea'];
}

function visibleCards() {
  let list = state.cards;
  if (state.filter === 'wait') list = list.filter(c => c.decision === 'wait');
  if (state.filter === 'bought') list = list.filter(c => c.decision === 'buy');
  if (state.filter === 'skip') list = list.filter(c => c.decision === 'skip');
  const kw = state.keyword.trim().toLowerCase();
  if (kw) {
    list = list.filter(c => {
      const hay = [c.title, c.notes, c.matchWith, c.keptReason, c.similarDesc, c.similarDiff, ...(c.tags || [])]
        .join(' ').toLowerCase();
      return hay.includes(kw);
    });
  }
  return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function render() {
  renderStats();
  const grid = $('#grid');
  const list = visibleCards();
  $('#emptyState').hidden = state.cards.length > 0;
  if (state.cards.length > 0 && list.length === 0) {
    grid.innerHTML = '<div class="loading">没有符合筛选条件的灵感</div>';
    return;
  }
  grid.innerHTML = list.map(c => {
    const [label, cls] = cardBadge(c);
    const tags = (c.tags || []).slice(0, 4).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const imgs = cardImages(c);
    const count = imgs.length > 1 ? `<span class="count-badge">⧉ ${imgs.length}</span>` : '';
    return `
      <div class="card" data-id="${esc(c.id)}">
        <div class="card-thumb">
          <img src="${esc(imgs[0] || NO_IMG)}" alt="${esc(c.title)}" loading="lazy" onerror="this.src='${NO_IMG}';this.style.opacity=.2">
          <span class="badge ${cls}">${label}</span>
          ${count}
        </div>
        <div class="card-body">
          <div class="card-title">${esc(c.title || '未命名灵感')}</div>
          <div class="card-meta">${esc(c.createdAt || '')}</div>
          <div class="card-tags">${tags}</div>
        </div>
      </div>`;
  }).join('');
}

function renderStats() {
  const bar = $('#statsBar');
  const cs = state.cards;
  if (cs.length === 0) { bar.hidden = true; return; }
  bar.hidden = false;
  const bought = cs.filter(c => c.decision === 'buy');
  const spend = bought.reduce((s, c) => s + (+c.price || 0), 0);
  const settled = bought.filter(c => c.kept === 'kept' || c.kept === 'returned' || c.kept === 'idle');
  const kept = bought.filter(c => c.kept === 'kept').length;
  const keepRate = settled.length ? Math.round(kept / settled.length * 100) + '%' : '—';
  bar.innerHTML = `
    <span class="stat">灵感 <b>${cs.length}</b> 条</span>
    <span class="stat">已购 <b>${bought.length}</b> 件 · 共 <b>¥${spend}</b></span>
    <span class="stat">留下率 <b>${keepRate}</b></span>`;
}

/* ---------- 弹窗 ---------- */
function openModal(html) {
  $('#modalBox').innerHTML = html;
  $('#modalMask').hidden = false;
  const closeBtn = $('#modalBox').querySelector('.modal-close');
  if (closeBtn) closeBtn.onclick = closeModal;
}
function closeModal() {
  if (window._formDragCleanup) { window._formDragCleanup(); window._formDragCleanup = null; }
  $('#modalMask').hidden = true;
  $('#modalBox').innerHTML = '';
}
$('#modalMask')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const lb = document.querySelector('.lightbox'); // 大图查看器开着 → 先关大图，不误关表单
  if (lb) lb.remove(); else closeModal();
});

/* ---------- 大图查看器（滚轮缩放 · 双击放大 · 拖动查看） ---------- */
function openLightbox(src, title = '') {
  document.querySelectorAll('.lightbox').forEach(x => x.remove());
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <div class="lb-bar">
      <span class="lb-title">${esc(title)}</span>
      <span class="lb-tip">滚轮缩放 · 双击放大 · 拖动查看</span>
      <button class="lb-close" type="button">×</button>
    </div>
    <img src="${esc(src)}" alt="">`;
  document.body.appendChild(lb);
  const img = lb.querySelector('img');
  let scale = 1, tx = 0, ty = 0;
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  lb.addEventListener('wheel', e => {
    e.preventDefault();
    scale = Math.min(8, Math.max(0.3, scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    apply();
  }, { passive: false });
  img.addEventListener('dblclick', () => { scale = scale > 1.5 ? 1 : 2.5; tx = ty = 0; apply(); });
  let drag = null;
  img.addEventListener('pointerdown', e => {
    drag = { x: e.clientX - tx, y: e.clientY - ty };
    img.setPointerCapture(e.pointerId);
  });
  img.addEventListener('pointermove', e => {
    if (!drag) return;
    tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply();
  });
  img.addEventListener('pointerup', () => { drag = null; });
  lb.querySelector('.lb-close').onclick = () => lb.remove();
  lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
}

/* ---------- 详情弹窗 ---------- */
function openDetail(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const [label, cls] = cardBadge(c);
  const kv = (k, v) => v ? `<div class="kv"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>` : '';
  const similarBlock = c.hasSimilar === 'yes'
    ? kv('衣柜里类似的衣服', c.similarDesc) + kv('和这套的区别', c.similarDiff)
    : '<div class="kv"><div class="v" style="color:var(--ink-3)">衣柜里还没有类似的</div></div>';

  let buyBlock = '';
  if (c.decision === 'buy') {
    buyBlock = `
      <div class="form-section"><h4>购买与复盘</h4>
        <div class="kv"><div class="k">价格</div><div class="v"><span class="price-tag">¥ ${esc(c.price ?? '—')}</span>${c.boughtDate ? ' · ' + esc(c.boughtDate) : ''}</div></div>
        ${c.boughtDiff ? kv('新买的和灵感的差异', c.boughtDiff) : ''}
        ${kv('去留', c.kept === 'kept' ? '留下了' : c.kept === 'returned' ? '退掉了' : c.kept === 'idle' ? '闲置中' : '待定')}
        ${kv('原因 / 复盘', c.keptReason)}
      </div>`;
  } else if (c.decision === 'skip') {
    buyBlock = `<div class="form-section"><h4>为什么决定不买</h4>${kv('原因', c.keptReason) || '<div class="kv"><div class="v" style="color:var(--ink-3)">未填写</div></div>'}</div>`;
  } else if (c.decision === 'wait') {
    buyBlock = `<div class="form-section"><h4>观望笔记</h4>${kv('原因 / 想法', c.keptReason)}</div>`;
  }

  const actions = state.owner ? `
    <div class="detail-actions">
      <button class="btn btn-primary" id="dEdit">编辑</button>
      <button class="btn btn-danger" id="dDel">删除</button>
    </div>` : '';

  const imgs = cardImages(c);
  const thumbs = imgs.length > 1
    ? `<div class="thumb-strip">${imgs.map((p, i) =>
        `<img class="thumb${i === 0 ? ' active' : ''}" data-src="${esc(p)}" src="${esc(p)}" alt="图${i + 1}" loading="lazy">`).join('')}
       <span class="thumb-tip">${imgs.length} 张 · 点击切换</span></div>`
    : '';

  openModal(`
    <div class="modal-head"><h3>${esc(c.title || '未命名灵感')}</h3><button class="modal-close">×</button></div>
    <div class="detail-grid">
      <div class="detail-img">
        <img id="detailMain" src="${esc(imgs[0] || NO_IMG)}" alt="">
        ${thumbs}
      </div>
      <div>
        <div class="detail-status-line"><span class="badge ${cls}" style="position:static">${label}</span>
          ${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>
        <div class="form-section"><h4>灵感笔记</h4>${kv('记录', c.notes) || '<div class="kv"><div class="v" style="color:var(--ink-3)">未填写</div></div>'}</div>
        <div class="form-section"><h4>衣柜对照</h4>${similarBlock}</div>
        ${buyBlock}
        ${c.matchWith ? `<div class="form-section"><h4>可以搭配</h4>${kv('搭配思路', c.matchWith)}</div>` : ''}
        ${actions}
      </div>
    </div>`);

  if (state.owner) {
    $('#dEdit').onclick = () => openForm(c);
    $('#dDel').onclick = () => confirmDelete(c);
  }

  /* 点击大图 → 全屏查看 */
  $('#detailMain').onclick = () => openLightbox($('#detailMain').src, c.title || '未命名灵感');

  /* 多图切换 */
  document.querySelectorAll('#modalBox .thumb').forEach(t => {
    t.onclick = () => {
      $('#detailMain').src = t.dataset.src;
      document.querySelectorAll('#modalBox .thumb').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    };
  });
}

/* ---------- 添加 / 编辑 表单 ---------- */
function openForm(editCard = null) {
  const c = editCard || { tags: [], decision: 'none', hasSimilar: 'no' };
  const isEdit = !!editCard;

  openModal(`
    <div class="modal-head"><h3>${isEdit ? '编辑灵感' : '添加灵感'}</h3><button class="modal-close">×</button></div>
    <form id="cardForm">

      <div class="form-section"><h4>① 照片与基本信息</h4>
        <div class="field">
          <div class="upload-area" id="uploadArea">
            <input type="file" id="photoInput" accept="image/*" multiple>
            <div id="uploadPlaceholder">📷 <b>添加 / 更换照片</b>：点击选择，或把微信里的图片<b>直接拖到本页任意位置</b><br>
              <span style="font-size:.75rem">可一次多选 · 最多 ${MAX_PHOTOS} 张 · 点击下方缩略图可放大查看<br>JPG / PNG / WebP / GIF 均可，iPhone 原图若失败请改用截图</span></div>
          </div>
          <div id="photoStrip" class="photo-strip" hidden></div>
        </div>
        <div class="field"><label>标题 *</label><input type="text" id="fTitle" value="${esc(c.title)}" placeholder="如：秋冬通勤 · 大衣叠穿" required></div>
        <div class="field"><label>标签（用逗号分隔，如：秋冬, 通勤, 日系）</label><input type="text" id="fTags" value="${esc((c.tags || []).join(', '))}"></div>
        <div class="field"><label>灵感笔记（这套吸引你的点）</label><textarea id="fNotes">${esc(c.notes)}</textarea></div>
      </div>

      <div class="form-section"><h4>② 衣柜对照</h4>
        <div class="field radio-pills">
          <input type="radio" name="hasSimilar" id="hsYes" value="yes" ${c.hasSimilar === 'yes' ? 'checked' : ''}><label for="hsYes">我有类似的</label>
          <input type="radio" name="hasSimilar" id="hsNo" value="no" ${c.hasSimilar !== 'yes' ? 'checked' : ''}><label for="hsNo">衣柜里没有</label>
        </div>
        <div id="similarBlock">
          <div class="field"><label>是哪件？</label><input type="text" id="fSimilarDesc" value="${esc(c.similarDesc)}" placeholder="如：米色羊绒大衣"></div>
          <div class="field"><label>和这套的区别</label><textarea id="fSimilarDiff" placeholder="如：我的更短，灵感这件垂感更好">${esc(c.similarDiff)}</textarea></div>
        </div>
      </div>

      <div class="form-section"><h4>③ 购买决策</h4>
        <div class="field radio-pills">
          <input type="radio" name="decision" id="dNone" value="none" ${c.decision === 'none' || !c.decision ? 'checked' : ''}><label for="dNone">纯收藏</label>
          <input type="radio" name="decision" id="dWait" value="wait" ${c.decision === 'wait' ? 'checked' : ''}><label for="dWait">观望中</label>
          <input type="radio" name="decision" id="dBuy" value="buy" ${c.decision === 'buy' ? 'checked' : ''}><label for="dBuy">已购入</label>
          <input type="radio" name="decision" id="dSkip" value="skip" ${c.decision === 'skip' ? 'checked' : ''}><label for="dSkip">决定不买</label>
        </div>
        <div id="buyBlock" hidden>
          <div class="field-row">
            <div class="field"><label>花了多少钱（元）</label><input type="number" id="fPrice" min="0" step="1" value="${c.price ?? ''}"></div>
            <div class="field"><label>购买日期</label><input type="date" id="fBoughtDate" value="${esc(c.boughtDate || today())}"></div>
          </div>
          <div class="field"><label>新买的这件和灵感这套的差异（可选）</label><input type="text" id="fBoughtDiff" value="${esc(c.boughtDiff)}" placeholder="如：颜色更浅，版型基本一致"></div>
          <div class="field"><label>现在留下了吗？</label>
            <div class="radio-pills">
              <input type="radio" name="kept" id="kKept" value="kept" ${c.kept === 'kept' ? 'checked' : ''}><label for="kKept">留下了</label>
              <input type="radio" name="kept" id="kReturned" value="returned" ${c.kept === 'returned' ? 'checked' : ''}><label for="kReturned">退掉了</label>
              <input type="radio" name="kept" id="kIdle" value="idle" ${c.kept === 'idle' ? 'checked' : ''}><label for="kIdle">闲置中</label>
              <input type="radio" name="kept" id="kUndef" value="" ${!c.kept ? 'checked' : ''}><label for="kUndef">待定</label>
            </div>
          </div>
        </div>
        <div class="field" id="reasonField"><label id="reasonLabel">原因 / 复盘（买或不买，都值得写一句）</label>
          <textarea id="fReason" placeholder="如：面料超出预期；或：和现有大衣重复，不买">${esc(c.keptReason)}</textarea></div>
        <div class="field"><label>可以和哪些衣服搭配</label><input type="text" id="fMatchWith" value="${esc(c.matchWith)}" placeholder="如：白色直筒裤、燕麦色高领毛衣"></div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="fCancel">取消</button>
        <button type="submit" class="btn btn-primary" id="fSubmit">${isEdit ? '保存修改' : '添加到灵感库'}</button>
      </div>
    </form>`);

  /* --- 照片管理：保留的旧图 + 新增的图 --- */
  const keptImages = isEdit ? [...cardImages(c)] : []; // 已在仓库里的
  const newPhotos = [];                                 // 本地新压缩的 { base64, dataUrl, size }

  const uploadArea = $('#uploadArea'), photoInput = $('#photoInput');
  uploadArea.onclick = () => photoInput.click();
  uploadArea.ondragover = e => { e.preventDefault(); uploadArea.classList.add('drag'); };
  uploadArea.ondragleave = () => uploadArea.classList.remove('drag');
  uploadArea.ondrop = e => {
    e.preventDefault(); uploadArea.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
    e.stopPropagation(); // 本区域已处理，不再冒泡给窗口级兜底，避免重复添加
  };
  photoInput.onchange = () => { handleFiles(photoInput.files); photoInput.value = ''; };

  /* 整页拖拽兜底：从微信等任意窗口把图拖到页面任何位置都能进表单（表单关闭时自动失效） */
  const onWinDragOver = e => { e.preventDefault(); uploadArea.classList.add('drag'); };
  const onWinDrop = e => {
    e.preventDefault(); uploadArea.classList.remove('drag');
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };
  window.addEventListener('dragover', onWinDragOver);
  window.addEventListener('drop', onWinDrop);
  window._formDragCleanup = () => {
    window.removeEventListener('dragover', onWinDragOver);
    window.removeEventListener('drop', onWinDrop);
  };

  function renderStrip() {
    const strip = $('#photoStrip');
    strip.hidden = keptImages.length + newPhotos.length === 0;
    const item = (src, del, badge) => `
      <div class="photo-item">
        <img src="${src}" alt="">
        ${badge ? '<span class="photo-new">新</span>' : ''}
        <button type="button" class="photo-del" data-del="${del}">×</button>
      </div>`;
    strip.innerHTML =
      keptImages.map((p, i) => item(esc(p), 'keep:' + i, false)).join('') +
      newPhotos.map((p, i) => item(p.dataUrl, 'new:' + i, true)).join('');
    strip.querySelectorAll('.photo-del').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const [kind, idx] = btn.dataset.del.split(':');
        if (kind === 'keep') keptImages.splice(+idx, 1); else newPhotos.splice(+idx, 1);
        renderStrip();
      };
    });
    /* 点击缩略图 → 全屏查看大图（查看不等于更换，更换/继续添加走上方上传区或拖拽） */
    strip.querySelectorAll('.photo-item').forEach((item, i) => {
      item.onclick = () => {
        const src = i < keptImages.length ? keptImages[i] : newPhotos[i - keptImages.length].dataUrl;
        openLightbox(src, '查看大图');
      };
    });
    $('#uploadPlaceholder').innerHTML = keptImages.length + newPhotos.length >= MAX_PHOTOS
      ? `已满 ${MAX_PHOTOS} 张 📷 如需更换，先在下方缩略图里删掉不要的`
      : `📷 继续添加 / 更换（当前 ${keptImages.length + newPhotos.length}/${MAX_PHOTOS}）· 也可把图片直接拖到本页任意位置<br><span style="font-size:.75rem">点击缩略图可放大查看</span>`;
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter(f => /^image\//.test(f.type));
    if (!files.length) return toast('请选择图片文件', true);
    const room = MAX_PHOTOS - keptImages.length - newPhotos.length;
    if (room <= 0) return toast(`一条灵感最多 ${MAX_PHOTOS} 张照片`, true);
    if (files.length > room) toast(`一次最多还能加 ${room} 张，多出的已忽略`, true);
    for (const f of files.slice(0, room)) {
      try {
        const p = await compressImage(f);
        newPhotos.push(p);
        renderStrip();
      } catch (err) {
        toast('照片处理失败：' + err.message + '（iPhone 用户请试试截图上传）', true);
      }
    }
  }
  renderStrip();

  const syncSections = () => {
    const hs = document.querySelector('input[name=hasSimilar]:checked').value;
    $('#similarBlock').style.display = hs === 'yes' ? '' : 'none';
    const d = document.querySelector('input[name=decision]:checked').value;
    $('#buyBlock').hidden = d !== 'buy';
    const labels = { buy: '留下的原因 / 复盘', skip: '为什么决定不买（防止再心动）', wait: '观望的理由 / 顾虑' };
    $('#reasonLabel').textContent = labels[d] || '原因 / 复盘（买或不买，都值得写一句）';
  };
  document.querySelectorAll('input[name=hasSimilar], input[name=decision]').forEach(r => r.onchange = syncSections);
  syncSections();

  $('#fCancel').onclick = closeModal;

  $('#cardForm').onsubmit = async (e) => {
    e.preventDefault();
    if (keptImages.length + newPhotos.length === 0) return toast('请至少保留一张穿搭照片', true);
    const btn = $('#fSubmit');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      await saveCard(isEdit, c, keptImages, newPhotos);
      closeModal();
      toast('已保存 ✓ 网站 1 分钟内自动更新（GitHub 重新部署中）');
    } catch (err) {
      toast(err.message || '保存失败，请重试', true);
      btn.disabled = false; btn.textContent = isEdit ? '保存修改' : '添加到灵感库';
    }
  };
}

/* ---------- 图片压缩 ---------- */
function compressImage(file, maxEdge = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';              // PNG 透明底垫白，避免转 JPEG 后变黑
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('无法压缩图片'));
          const fr = new FileReader();
          fr.onload = () => resolve({ base64: fr.result.split(',')[1], dataUrl: fr.result, size: blob.size });
          fr.onerror = () => reject(new Error('读取图片失败'));
          fr.readAsDataURL(blob);
        }, 'image/jpeg', quality);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法识别该图片格式')); };
    img.src = url;
  });
}

/* ---------- GitHub API ---------- */
async function ghFetch(method, path, body) {
  const s = getSettings();
  if (!s) throw new Error('尚未解锁编辑权限');
  const res = await fetch(API + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + s.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { clearSettings(); setMode(false); throw new Error('密钥已失效，请点「解锁编辑」重新输入'); }
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json()).message || ''; } catch {}
    throw new Error(`GitHub ${res.status}：${detail || '请求失败'}`);
  }
  return res.json().catch(() => null);
}

async function ghGetFile(path) {
  const s = getSettings();
  return ghFetch('GET', `/repos/${s.username}/${s.repo}/contents/${path}?ref=main&t=${Date.now()}`);
}

/* 文件内容 <-> Base64（UTF-8 安全，中文不会乱码） */
function encodeB64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function decodeB64Utf8(b64str) {
  const bin = atob(b64str.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* 把变更写入 inspirations.json（带冲突重试，多设备同时编辑也不怕） */
async function commitData(mutate, message) {
  const s = getSettings();
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await ghGetFile(DATA_PATH);
    const cards = cur ? (JSON.parse(decodeB64Utf8(cur.content)).cards || []) : [];
    mutate(cards); // 在最新数据上应用本次变更
    const content = encodeB64Utf8(JSON.stringify({ cards }, null, 2));
    try {
      await ghFetch('PUT', `/repos/${s.username}/${s.repo}/contents/${DATA_PATH}`, {
        message, content, branch: 'main', ...(cur ? { sha: cur.sha } : {}),
      });
      state.cards = cards;
      render();
      return;
    } catch (e) {
      if (attempt < 2 && /409|422/.test(e.message)) continue; // 有冲突 → 拉最新重试
      throw e;
    }
  }
}

/* ---------- 保存 / 删除 ---------- */
async function saveCard(isEdit, oldCard, keptImages, newPhotos) {
  const g = (id) => $(id).value.trim();
  const decision = document.querySelector('input[name=decision]:checked').value;
  const id = isEdit ? oldCard.id : genId();
  const stamp = Date.now().toString(36);
  const newPaths = newPhotos.map((_, i) => `images/${id}_${stamp}_${i}.jpg`);
  const images = [...keptImages, ...newPaths];
  const card = {
    id,
    createdAt: isEdit ? (oldCard.createdAt || today()) : today(),
    updatedAt: today(),
    title: g('#fTitle'),
    tags: g('#fTags').split(/[,，、\s]+/).filter(Boolean).slice(0, 8),
    notes: g('#fNotes'),
    hasSimilar: document.querySelector('input[name=hasSimilar]:checked').value,
    similarDesc: g('#fSimilarDesc'),
    similarDiff: g('#fSimilarDiff'),
    decision,
    price: decision === 'buy' && g('#fPrice') !== '' ? +g('#fPrice') : null,
    boughtDate: decision === 'buy' ? g('#fBoughtDate') : '',
    boughtDiff: decision === 'buy' ? g('#fBoughtDiff') : '',
    kept: decision === 'buy' ? (document.querySelector('input[name=kept]:checked')?.value || '') : '',
    keptReason: g('#fReason'),
    matchWith: g('#fMatchWith'),
    image: images[0] || '',
    images,
  };

  /* 1. 上传新增照片（可多张） */
  if (newPhotos.length) {
    const s = getSettings();
    for (let i = 0; i < newPhotos.length; i++) {
      await ghFetch('PUT', `/repos/${s.username}/${s.repo}/contents/${newPaths[i]}`, {
        message: `上传照片：${card.title || id}（${i + 1}/${newPhotos.length}）`,
        content: newPhotos[i].base64,
        branch: 'main',
      });
    }
  }

  /* 2. 写入数据 */
  await commitData(cards => {
    const i = cards.findIndex(x => x.id === card.id);
    if (i >= 0) cards[i] = card; else cards.unshift(card);
  }, `${isEdit ? '更新' : '添加'}灵感：${card.title || card.id}`);

  /* 3. 编辑时删掉被移除的旧照片（尽力删，失败不影响） */
  if (isEdit) {
    const removed = cardImages(oldCard).filter(p => !keptImages.includes(p));
    for (const p of removed) {
      try { await deleteRepoFile(p, '清理旧照片'); } catch {}
    }
  }
}

async function deleteRepoFile(path, message) {
  const s = getSettings();
  const f = await ghGetFile(path);
  if (!f) return;
  await ghFetch('DELETE', `/repos/${s.username}/${s.repo}/contents/${path}`, {
    message, sha: f.sha, branch: 'main',
  });
}

function confirmDelete(c) {
  openModal(`
    <div class="modal-head"><h3>删除这条灵感？</h3><button class="modal-close">×</button></div>
    <p style="margin-bottom:6px">「${esc(c.title || '未命名')}」将被删除，${cardImages(c).length > 1 ? `共 ${cardImages(c).length} 张照片` : '照片'}也会一并移除。</p>
    <p style="font-size:.82rem;color:var(--ink-3);margin-bottom:20px">别担心：GitHub 上仍保留历史存档，需要时可找回。</p>
    <div class="form-actions">
      <button class="btn btn-ghost" id="delCancel">算了</button>
      <button class="btn btn-danger" id="delOk">确认删除</button>
    </div>`);
  $('#delCancel').onclick = closeModal;
  $('#delOk').onclick = async () => {
    $('#delOk').disabled = true;
    try {
      await commitData(cards => {
        const i = cards.findIndex(x => x.id === c.id);
        if (i >= 0) cards.splice(i, 1);
      }, `删除灵感：${c.title || c.id}`);
      try { for (const p of cardImages(c)) await deleteRepoFile(p, '删除照片'); } catch {}
      closeModal();
      toast('已删除 ✓');
    } catch (e) {
      toast(e.message || '删除失败', true);
      $('#delOk').disabled = false;
    }
  };
}

/* ---------- 解锁编辑（首次输密钥，之后本设备免输） ---------- */
function openUnlock() {
  const old = getSettings() || {};
  openModal(`
    <div class="modal-head"><h3>解锁编辑权限</h3><button class="modal-close">×</button></div>
    <div class="unlock-tip">
      🔑 只需在本设备输入一次，之后这台设备会一直记住。<br>
      密钥（Token）的获取方法见<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub 令牌页</a>：
      生成时选择<strong>仅本仓库</strong>、权限勾选 <strong>Contents: Read and write</strong> 即可。
    </div>
    <form id="unlockForm">
      <div class="field"><label>GitHub 用户名</label><input type="text" id="uName" value="${esc(old.username || '')}" required placeholder="你的 GitHub 用户名"></div>
      <div class="field"><label>仓库名</label><input type="text" id="uRepo" value="${esc(old.repo || 'outfit-inspiration')}" required></div>
      <div class="field"><label>密钥（Token）</label><input type="password" id="uToken" required placeholder="github_pat_ 开头的一长串字符">
        <div class="hint">只存在这台设备的浏览器里，不会发给任何服务器（除 GitHub 官方接口）</div></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="uCancel">取消</button>
        <button type="submit" class="btn btn-primary" id="uSubmit">验证并解锁</button>
      </div>
    </form>`);
  $('#uCancel').onclick = closeModal;
  $('#unlockForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('#uName').value.trim(), repo = $('#uRepo').value.trim(), token = $('#uToken').value.trim();
    const btn = $('#uSubmit');
    btn.disabled = true; btn.textContent = '验证中…';
    try {
      saveSettings({ username, repo, token });
      const info = await ghFetch('GET', `/repos/${username}/${repo}`);
      if (!info || info.full_name !== `${username}/${repo}`) throw new Error('仓库不存在，请核对用户名和仓库名');
      setMode(true);
      closeModal();
      toast('解锁成功 ✓ 本设备已记住，之后无需再输');
      render();
    } catch (err) {
      clearSettings();
      toast('验证失败：' + (err.message || '请检查三项信息'), true);
      btn.disabled = false; btn.textContent = '验证并解锁';
    }
  };
}

/* ---------- 事件绑定 & 启动 ---------- */
$('#btnUnlock').onclick = openUnlock;
$('#btnLock').onclick = () => { clearSettings(); setMode(false); toast('已锁定，本设备回到只读模式'); };
$('#btnAdd').onclick = () => openForm();
$('#grid').addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (card) openDetail(card.dataset.id);
});
$('#filterChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.filter = chip.dataset.filter;
  render();
});
$('#searchBox').addEventListener('input', e => { state.keyword = e.target.value; render(); });

setMode(!!getSettings());
loadCards();

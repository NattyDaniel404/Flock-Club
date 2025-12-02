// Connect to Socket.IO
const socket = io();

// Grab UI elements
const roomEl        = document.getElementById('room');
const feed          = document.getElementById('feed');
const chatForm      = document.getElementById('chatForm');
const chatInput     = document.getElementById('chatInput');
const centerBtn     = document.getElementById('centerBtn');
const profileModal  = document.getElementById('profileModal');
const pTitle        = document.getElementById('pTitle');
const pBody         = document.getElementById('pBody');
const tttModal      = document.getElementById('tttModal');
const tttBoard      = document.getElementById('tttBoard');

// Character creator + toggle + preview
const creatorSection   = document.getElementById('creatorSection');
const toggleCreatorBtn = document.getElementById('toggleCreatorBtn');
const creatorNameInput = document.getElementById('creatorName');
const creatorPreview   = document.getElementById('creatorPreview');

// Customizer rows
const colorRow = document.getElementById('colorRow');
const eyesRow  = document.getElementById('eyesRow');
const beakRow  = document.getElementById('beakRow');
const torsoRow = document.getElementById('torsoRow');
const hairRow  = document.getElementById('hairRow');
const pantsRow = document.getElementById('pantsRow');

// Avatar / Look State

const COLOR_BASES = {
  '#f9fafb': 'White',
  '#34d399': 'Green',
  '#60a5fa': 'Blue',
  '#f87171': 'Red'
};

const COLORS = Object.keys(COLOR_BASES);

// These now correspond to actual numbered files:
// Eyes_1.png .. Eyes_4.png, Beak_1.png .. Beak_3.png, Hair_1.png .. Hair_4.png
const EYES   = ['1', '2', '3', '4'];
const BEAKS  = ['1', '2', '3'];
const TORSOS = ['default']; // still not using torso variants yet
const HAIRS  = ['1', '2', '3', '4'];
const PANTS  = ['Shorts', 'Skirt'];

const you = {
  id: null,
  name: null,
  x: Math.random() * 600 + 200,
  y: Math.random() * 260 + 260,
  look: {
    color: '#60a5fa',
    eyes:  '1',       // matches Eyes_1.png
    beak:  '1',       // matches Beak_1.png
    torso: 'default',
    hair:  '1',       // matches Hair_1.png
    pantsStyle: 'Shorts'
  },
  stats: { wins: 0, games: 0 }
};

// Small helpers

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);

  if (attrs.dataset) {
    for (const [k, v] of Object.entries(attrs.dataset)) {
      e.dataset[k] = v;
    }
    delete attrs.dataset;
  }

  Object.assign(e, attrs);

  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  });

  return e;
}

function esc(s) {
  return (s + "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[m]));
}

function addLine(html) {
  const d = el('div',{className:'msg', innerHTML:html});
  feed.append(d);
  feed.scrollTop = feed.scrollHeight;
}

// PNG-based avatar

function getBaseNameFromColor(hex) {
  if (!hex) return 'Blue';
  const h = hex.toLowerCase();
  return COLOR_BASES[h] || 'Blue';
}

function avatarSVG(look) {
  const baseName   = getBaseNameFromColor(look.color);
  const pantsStyle = look.pantsStyle === 'Skirt' ? 'Skirt' : 'Shorts';

  const eyesIdx = look.eyes || '1';
  const beakIdx = look.beak || '1';
  const hairIdx = look.hair || '1';

  const basePath   = `img/Base_${baseName}.png`;
  const pantsPath  = `img/${pantsStyle}_${baseName}.png`;
  const shoesPath  = `img/Shoes.png`;           // single shoes sprite
  const beakPath   = `img/Beak_${beakIdx}.png`;
  const eyesPath   = `img/Eyes_${eyesIdx}.png`;
  const hairPath   = `img/Hair_${hairIdx}.png`;

  const layerStyle = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';

  return `
    <div class="avatar-sprite">
      <img src="${basePath}"  alt="body"  style="${layerStyle}">
      <img src="${pantsPath}" alt="pants" style="${layerStyle}">
      <img src="${shoesPath}" alt="shoes" style="${layerStyle}">
      <img src="${beakPath}"  alt="beak"  style="${layerStyle}">
      <img src="${eyesPath}"  alt="eyes"  style="${layerStyle}">
      <img src="${hairPath}"  alt="hair"  style="${layerStyle}">
    </div>
  `;
}

function renderPreview() {
  if (!creatorPreview) return;
  creatorPreview.innerHTML = avatarSVG(you.look);
}

// Customizer UI

function addOption(parent,label,fn) {
  const b = el('button',{className:'option', type:'button', innerText:label});
  b.onclick = () => {
    fn();
    markActive(parent,b);
    renderAvatar(you);
    renderPreview();
    pushLook();
  };
  parent.append(b);
}

function markActive(parent,btn) {
  [...parent.children].forEach(ch => ch.classList.remove('active'));
  btn.classList.add('active');
}

// Color swatches
COLORS.forEach(c => {
  const sw = el('div',{className:'color-swatch', style:`background:${c}`});
  sw.onclick = () => {
    you.look.color = c;
    markActive(colorRow, sw);
    renderAvatar(you);
    renderPreview();
    pushLook();
  };
  colorRow.append(sw);
});

// Eyes 1–4
EYES.forEach(v =>
  addOption(eyesRow, `Eyes ${v}`, () => { you.look.eyes = v; })
);

// Beaks 1–3
BEAKS.forEach(v =>
  addOption(beakRow, `Beak ${v}`, () => { you.look.beak = v; })
);

// Torso placeholder
TORSOS.forEach(v =>
  addOption(torsoRow, 'Torso', () => { you.look.torso = v; })
);

// Hair 1–4
HAIRS.forEach(v =>
  addOption(hairRow, `Hair ${v}`, () => { you.look.hair = v; })
);

// Pants style (Shorts / Skirt)
PANTS.forEach(style => {
  addOption(pantsRow, style, () => {
    you.look.pantsStyle = style;
  });
});

// Avatar DOM lifecycle

const avatars = new Map();

function ensureAvatar(u) {
  let rec = avatars.get(u.id);
  if (!rec) {
    const a = el('div',{className:'avatar', dataset:{id:u.id}});
    a.innerHTML = avatarSVG(u.look) +
      `<div class="name">${esc(u.name)}${u.id===you.id?'<span class="youBadge">you</span>':''}</div>`;

    const card = el('div',{className:'hover-card'});
    card.append(
      btn('PM',          () => pmStart(u.id)),
      btn('Tic-Tac-Toe', () => tttInvite(u.id)),
      btn('Profile',     () => openProfile(u.id))
    );
    a.append(card);

    roomEl.append(a);
    a.addEventListener('click', e => e.stopPropagation());

    rec = { el:a, data:u };
    avatars.set(u.id, rec);
  }
  rec.data = u;
  positionAvatar(rec);
  rec.el.querySelector('.name').innerHTML =
    `${esc(u.name)}${u.id===you.id?'<span class="youBadge">you</span>':''}`;
  rec.el.children[0].outerHTML = avatarSVG(u.look);
  return rec;
}

function positionAvatar(rec) {
  rec.el.style.left = rec.data.x + 'px';
  rec.el.style.top  = rec.data.y + 'px';
}

function renderAvatar(u) {
  const rec = ensureAvatar(u);
  positionAvatar(rec);
}

function updateYourNameLabel() {
  const rec = avatars.get(you.id);
  if (!rec) return;
  rec.el.querySelector('.name').innerHTML =
    `${esc(you.name)}<span class="youBadge">you</span>`;
}

function btn(label, fn) {
  const b = el('button',{className:'btn', innerText:label});
  b.onclick = (e) => { e.stopPropagation(); fn(); };
  return b;
}

// Movement

roomEl.addEventListener('click', e => {
  const rect = roomEl.getBoundingClientRect();
  you.x = e.clientX - rect.left;
  you.y = e.clientY - rect.top;
  renderAvatar(you);
  socket.emit('move', {x:you.x, y:you.y});
});

centerBtn.onclick = () => {
  you.x = roomEl.clientWidth  / 2;
  you.y = roomEl.clientHeight * 0.75;
  renderAvatar(you);
  socket.emit('move', {x:you.x, y:you.y});
};

// Chat

chatForm.addEventListener('submit', e => {
  e.preventDefault();
  const t = chatInput.value.trim();
  if (!t) return;
  chatInput.value = '';

  const pmMatch = t.match(/^\/w\s+@([^\s]+)\s+([\s\S]+)/i);
  if (pmMatch) {
    socket.emit('pm',{toName:pmMatch[1], text:pmMatch[2]});
  } else {
    socket.emit('chat', {text:t});
  }
});

function pmStart(otherId) { socket.emit('pmStart',{to:otherId}); }
function openProfile(id)  { socket.emit('profile:get',{id}); }

// Tic-Tac-Toe (client stub)

let ttt = { active:false, me:'X', vs:null, board:Array(9).fill(null), turn:'X', room:null };

if (tttBoard && !tttBoard.hasChildNodes()) {
  for (let i=0; i<9; i++) {
    const b = el('button',{innerText:''});
    b.onclick = () => {
      if (!ttt.active || ttt.turn !== ttt.me || ttt.board[i]) return;
      ttt.board[i] = ttt.me;
      b.innerText = ttt.me;
      socket.emit('ttt:move',{room:ttt.room, idx:i});
      ttt.turn = (ttt.turn === 'X' ? 'O' : 'X');
      updateTttStatus();
    };
    tttBoard.append(b);
  }
}

function tttInvite(otherId) { socket.emit('ttt:invite',{to:otherId}); }

function updateTttStatus(msg) {
  const el = document.getElementById('tttStatus');
  if (!el) return;
  if (msg) { el.textContent = msg; return; }
  el.textContent = `You are ${ttt.me}. ${ttt.turn===ttt.me?'Your move.':'Waiting…'}`;
}

function endTtt() {
  socket.emit('ttt:end',{room:ttt.room});
  tttModal.close();
  ttt.active = false;
  ttt.room   = null;
  ttt.board  = Array(9).fill(null);
  [...tttBoard.children].forEach(b => b.innerText='');
}

function checkWin(b) {
  const L = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,c,d] of L) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return b.every(Boolean) ? 'draw' : null;
}

// Socket events

socket.on('connect', () => {
  you.id = socket.id;

  if (!you.name) {
    you.name = `Bird${(Math.random()*9999|0).toString().padStart(4,'0')}`;
  }

  const youNameEl = document.getElementById('youName');
  if (youNameEl) {
    youNameEl.textContent = you.name + ' (online)';
  }

  if (creatorNameInput) {
    creatorNameInput.value = you.name;
  }

  if (colorRow && colorRow.children.length) markActive(colorRow, colorRow.children[0]);
  [eyesRow, beakRow, torsoRow, hairRow, pantsRow].forEach(r => {
    if (r && r.children.length) markActive(r, r.children[0]);
  });

  socket.emit('join', {name:you.name, x:you.x, y:you.y, look:you.look});
  renderAvatar(you);
  renderPreview();
});

socket.on('presence', list => {
  for (const [id, rec] of avatars) {
    if (!list.find(u => u.id === id)) {
      rec.el.remove();
      avatars.delete(id);
    }
  }
  list.forEach(u => ensureAvatar(u));
});

socket.on('joined', u => {
  ensureAvatar(u);
  addLine(`<span class="u">${esc(u.name)}</span> joined the room.`);
});

socket.on('moved', u => {
  const rec = ensureAvatar(u);
  rec.el.style.left = u.x + 'px';
  rec.el.style.top  = u.y + 'px';
});

socket.on('look', u => ensureAvatar(u));

socket.on('left', u => {
  const rec = avatars.get(u.id);
  if (rec) {
    rec.el.remove();
    avatars.delete(u.id);
    addLine(`<span class="u">${esc(u.name)}</span> left.`);
  }
});

socket.on('chat', msg => {
  addLine(`<span class="u">${esc(msg.from)}</span>: ${esc(msg.text)}`);
  showBubble(msg.fromId, msg.text);
});

socket.on('pm', msg => {
  addLine(
    `<span class="msg pm"><span class="u">PM ${esc(msg.from)} → ${esc(msg.to)}</span>: ${esc(msg.text)}</span>`
  );
  showBubble(msg.fromId, '(PM) ' + msg.text);
});

socket.on('pm:error', e => {
  addLine(`<span class="msg pm" style="color:#ef4444">PM error: ${esc(e)}</span>`);
});

socket.on('ttt:start', data => {
  ttt.active = true;
  ttt.room   = data.room;
  ttt.me     = data.me;
  ttt.vs     = data.vs;
  ttt.turn   = 'X';
  ttt.board  = Array(9).fill(null);
  [...tttBoard.children].forEach(b => b.innerText='');
  updateTttStatus(`Playing vs ${data.vsName}. You are ${data.me}.`);
  tttModal.showModal();
});

socket.on('ttt:move', data => {
  ttt.board[data.idx] = data.mark;
  tttBoard.children[data.idx].innerText = data.mark;

  const w = checkWin(ttt.board);
  if (w) {
    updateTttStatus(w === 'draw' ? 'Draw!' : `${w} wins!`);
  } else {
    ttt.turn = (data.mark === 'X' ? 'O' : 'X');
    updateTttStatus();
  }
});

socket.on('ttt:end', (data) => {
  const result = data?.result;
  if (result === 'draw') updateTttStatus('Draw!');
  else if (result === 'abandon') updateTttStatus('Game ended.');
  else if (result === 'X' || result === 'O') updateTttStatus(`${result} wins!`);
  setTimeout(() => endTtt(), 800);
});

// Shared helpers

function showBubble(id, text) {
  const rec = avatars.get(id); if (!rec) return;
  let b = rec.el.querySelector('.bubble');
  if (!b) {
    b = el('div',{className:'bubble'});
    rec.el.append(b);
  }
  b.textContent = text;
  clearTimeout(b._t);
  b._t = setTimeout(() => b.remove(), 2500);
}

function pushLook() {
  socket.emit('look', you.look);
}

// Character creator show/hide toggle
if (creatorSection && toggleCreatorBtn) {
  let creatorVisible = true;

  toggleCreatorBtn.addEventListener('click', () => {
    creatorVisible = !creatorVisible;

    if (creatorVisible) {
      creatorSection.classList.remove('hidden');
      toggleCreatorBtn.textContent = 'Hide Character Creator';
    } else {
      creatorSection.classList.add('hidden');
      toggleCreatorBtn.textContent = 'Show Character Creator';
    }
  });
}

// Name input live update
if (creatorNameInput) {
  creatorNameInput.addEventListener('input', () => {
    const newName = creatorNameInput.value.trim();

    if (newName) {
      you.name = newName;
    }

    const youNameEl = document.getElementById('youName');
    if (youNameEl) {
      youNameEl.textContent = you.name + ' (online)';
    }

    updateYourNameLabel();
  });
}

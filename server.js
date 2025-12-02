const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const users = new Map();   // id -> {id,name,x,y,look}
const tttGames = new Map(); // roomId -> { X, O, board }

function safeName(n){
  return String(n||'User').replace(/[^\w-]/g,'').slice(0,20) || 'User';
}

function sendPresence() {
  io.emit('presence', [...users.values()]);
}

function tttCheckWin(b) {
  const L = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,c,d] of L) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

io.on('connection', (socket)=>{
  console.log('Client connected', socket.id);

  // Initial roster to new client
  socket.emit('presence', [...users.values()]);

  // join with avatar data
  socket.on('join', (u)=>{
    const user = {
      id: socket.id,
      name: safeName(u.name),
      x: u.x || 400,
      y: u.y || 320,
      look: u.look || {}
    };
    users.set(socket.id, user);
    socket.data.name = user.name;
    io.emit('joined', user);
    sendPresence();
  });

  // movement
  socket.on('move', ({x,y})=>{
    const u = users.get(socket.id); 
    if(!u) return;
    u.x = x; 
    u.y = y;
    io.emit('moved', u);
  });

  // look updates
  socket.on('look', (look)=>{
    const u = users.get(socket.id); 
    if(!u) return;
    u.look = look;
    io.emit('look', u);
  });

  // global chat
  socket.on('chat', ({text})=>{
    const u = users.get(socket.id); 
    if(!u || !text) return;
    io.emit('chat', {
      from: u.name,
      fromId: u.id,
      text: String(text).slice(0,400)
    });
  });

  // PM (/w @name)
  socket.on('pm', ({toName, text}) => {
    const fromUser = users.get(socket.id);
    if (!fromUser || !text || !toName) return;

    const target = [...users.values()].find(
      u => u.name.toLowerCase() === String(toName).toLowerCase()
    );
    if (!target) {
      socket.emit('pm:error', `User "@${toName}" not found.`);
      return;
    }

    const payload = {
      from: fromUser.name,
      to: target.name,
      fromId: fromUser.id,
      toId: target.id,
      text: String(text).slice(0,400)
    };

    socket.emit('pm', payload);
    io.to(target.id).emit('pm', payload);
  });

  socket.on('pmStart', ()=> {
    // your client calls this but doesn’t need a response yet
  });

  // Tic-Tac-Toe: invite
  socket.on('ttt:invite', ({ to }) => {
    const other = io.sockets.sockets.get(to);
    if (!other) return;

    const room = `ttt-${socket.id}-${other.id}-${Date.now()}`;
    socket.join(room);
    other.join(room);

    tttGames.set(room, {
      X: socket.id,
      O: other.id,
      board: Array(9).fill(null)
    });

    const inviterName = socket.data.name || 'Player';
    const otherName   = other.data.name  || 'Player';

    socket.emit('ttt:start', {
      room,
      me: 'X',
      vs: other.id,
      vsName: otherName
    });

    other.emit('ttt:start', {
      room,
      me: 'O',
      vs: socket.id,
      vsName: inviterName
    });
  });

  // Tic-Tac-Toe: move
  socket.on('ttt:move', ({ room, idx }) => {
    const game = tttGames.get(room);
    if (!game) return;
    if (idx < 0 || idx > 8) return;
    if (game.board[idx]) return;

    const mark = (socket.id === game.X) ? 'X'
               : (socket.id === game.O) ? 'O'
               : null;
    if (!mark) return;

    game.board[idx] = mark;
    io.to(room).emit('ttt:move', { idx, mark });

    const winner = tttCheckWin(game.board);
    if (winner) {
      io.to(room).emit('ttt:end', { result: winner });
      tttGames.delete(room);
    } else if (game.board.every(Boolean)) {
      io.to(room).emit('ttt:end', { result: 'draw' });
      tttGames.delete(room);
    }
  });

  // Tic-Tac-Toe: end
  socket.on('ttt:end', ({ room }) => {
    if (!tttGames.has(room)) return;
    io.to(room).emit('ttt:end', { result: 'abandon' });
    tttGames.delete(room);
  });

  // cleanup
  socket.on('disconnect', ()=>{
    const u = users.get(socket.id);
    if(u){
      users.delete(socket.id);
      io.emit('left', u);
      sendPresence();
    }

    // end any games this socket was in
    for (const [room, game] of tttGames) {
      if (game.X === socket.id || game.O === socket.id) {
        io.to(room).emit('ttt:end', { result: 'abandon' });
        tttGames.delete(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on http://localhost:'+PORT));

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function genCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('متصل:', socket.id);

  socket.on('createRoom', (name) => {
    let code = genCode();
    while (rooms[code]) code = genCode();
    rooms[code] = {
      players: [{ id: socket.id, name: name || 'لاعب 1', y: 0.5, v: 0, ready: false, dead: false, score: 0 }],
      pipes: [],
      started: false,
      pipeTimer: 0,
      frame: 0
    };
    socket.join(code);
    socket.emit('roomCreated', { code, myId: socket.id });
    console.log('غرفة جديدة:', code);
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms[code];
    if (!room) return socket.emit('errorMsg', 'الغرفة غير موجودة');
    if (room.players.length >= 2) return socket.emit('errorMsg', 'الغرفة ممتلئة');
    room.players.push({ id: socket.id, name: name || 'لاعب 2', y: 0.5, v: 0, ready: false, dead: false, score: 0 });
    socket.join(code);
    socket.emit('roomJoined', { code, myId: socket.id });
    io.to(code).emit('playerList', room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready })));
  });

  socket.on('ready', (code) => {
    const room = rooms[code];
    if (!room) return;
    const p = room.players.find(p => p.id === socket.id);
    if (!p) return;
    p.ready = true;
    io.to(code).emit('playerList', room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready })));
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      room.started = true;
      room.pipes = [];
      room.pipeTimer = 0;
      room.frame = 0;
      room.players.forEach(p => { p.y = 0.5; p.v = 0; p.dead = false; p.score = 0; });
      io.to(code).emit('gameStart');
    }
  });

  socket.on('jump', (code) => {
    const room = rooms[code];
    if (!room || !room.started) return;
    const p = room.players.find(p => p.id === socket.id);
    if (p && !p.dead) p.v = -0.012;
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) delete rooms[code];
        else io.to(code).emit('playerLeft');
      }
    });
  });
});

setInterval(() => {
  Object.keys(rooms).forEach(code => {
    const room = rooms[code];
    if (!room.started) return;
    room.frame++;
    room.pipeTimer++;
    if (room.pipeTimer % 95 === 0) {
      const gap = 0.24;
      const minTop = 0.1;
      const maxTop = 1 - gap - 0.1;
      const top = Math.random() * (maxTop - minTop) + minTop;
      room.pipes.push({ x: 1.05, top, gap, scored: false });
    }
    room.pipes.forEach(p => p.x -= 0.0075);
    room.pipes = room.pipes.filter(p => p.x > -0.2);
    room.players.forEach(p => {
      if (p.dead) return;
      p.v += 0.00075;
      p.y += p.v;
      if (p.y < 0.03 || p.y > 0.92) p.dead = true;
      room.pipes.forEach(pipe => {
        if (p.x > pipe.x && p.x < pipe.x + 0.17) {
          if (p.y < pipe.top + 0.03 || p.y > pipe.top + pipe.gap - 0.03) {
            p.dead = true;
          }
        }
      });
      room.pipes.forEach(pipe => {
        if (!pipe.scored && pipe.x + 0.17 < p.x) {
          pipe.scored = true;
          p.score++;
        }
      });
    });
    io.to(code).emit('state', {
      players: room.players.map(p => ({ id: p.id, y: p.y, v: p.v, dead: p.dead, score: p.score })),
      pipes: room.pipes.map(p => ({ x: p.x, top: p.top, gap: p.gap }))
    });
  });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('السيرفر يعمل على المنفذ', PORT));
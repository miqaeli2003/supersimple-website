const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));

let waitingUser = null;
const pairs = new Map();

function emitOnlineCount() {
  io.emit('onlineCount', 30 + io.engine.clientsCount);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.userName = null;
  socket.isReadyForPartner = false;

  emitOnlineCount();

  socket.on('setName', (name) => {
    socket.userName = name;
    socket.isReadyForPartner = true;
    console.log(`User ${socket.id} set name: ${name}`);
  });

  socket.on('findPartner', () => {
    if (!socket.userName || !socket.isReadyForPartner) {
      socket.emit('waitingForPartner');
      return;
    }

    if (waitingUser && waitingUser.id === socket.id) {
      socket.emit('waitingForPartner');
      return;
    }

    if (waitingUser && waitingUser !== socket) {
      pairs.set(socket.id, waitingUser);
      pairs.set(waitingUser.id, socket);

      socket.emit('partnerFound', { id: waitingUser.id, name: waitingUser.userName });
      waitingUser.emit('partnerFound', { id: socket.id, name: socket.userName });

      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit('waitingForPartner');
    }
  });

  socket.on('message', (msg) => {
    const partner = pairs.get(socket.id);
    if (partner) {
      partner.emit('message', { from: socket.userName, text: msg });
    }
  });

  function cleanup() {
    const partner = pairs.get(socket.id);
    if (partner) {
      pairs.delete(partner.id);
      partner.emit('partnerDisconnected');
    }
    pairs.delete(socket.id);

    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }

    socket.isReadyForPartner = false;
  }

  socket.on('next', () => {
    cleanup();
    socket.emit('clearedPartner');
    socket.emit('readyForNewPartner');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    cleanup();
    emitOnlineCount();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

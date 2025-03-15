import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Store lobbies and players
const lobbies = new Map(); // Key: lobbyId, Value: { players: [socketId1, socketId2], word: string }
let lastLobbyId = null
// Generate a unique lobby ID
function generateLobbyId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  socket.on('join', (word, id) => {
    // const lastLobbyId = Array.from(lobbies.keys()).pop();
    let lastId = id || lastLobbyId
    if (lastId && lobbies.get(lastId)?.players.length == 1) {
      lobbies.get(lastId).players.push(socket.id);
      socket.join(lastId);
      io.to(socket.id).emit('joined', lastId, false, lobbies.get(lastId).word);
      io.to(lobbies.get(lastId).players[0]).emit('lobbyJoined');

      console.log('joiner');
    } else {
      let ids = id || generateLobbyId();
      lobbies.set(ids, { players: [socket.id], word: word });
      socket.join(ids);
      lastLobbyId = ids;
      io.to(socket.id).emit('joined', lastLobbyId, true);
      console.log('host');
    }
    console.log('Player joined game room');
  })
  socket.on('line', (lobbyId, socketId, word, row) => {
    lobbies.get(lobbyId).players.forEach(player => {
      console.log(player, socketId, word);
      if (player != socketId) {
        io.to(player).emit('moveMade', word, row);
      }
    })
  })
  socket.on('gaveup', (lobbyId,socketId) => {
    console.log('gaveup')
    lobbies.get(lobbyId).players.forEach(player => {
      if (player != socketId) {
        io.to(player).emit('opponentGaveUp');
        lobbies.delete(lobbyId);
      }
    })
  })
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    // Clean up lobbies when a player disconnects
    for (const [lobbyId, lobby] of lobbies.entries()) {
      if (lobby.players.includes(socket.id)) {
        const otherPlayer = lobby.players.find((player) => player !== socket.id);
        if (otherPlayer) {
          io.to(otherPlayer).emit('opponentDisconnected');
        }
        lobbies.delete(lobbyId);
        console.log(`Lobby deleted: ${lobbyId}`);
        break;
      }
    }
  });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store lobbies and players
const lobbies = new Map(); // Key: lobbyId, Value: { players: [socketId1, socketId2], word: string }
let lastLobbyId = null;

// Generate a unique lobby ID
function generateLobbyId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/', (req, res) => {
  let data = JSON.stringify([...lobbies.entries()].reduce((obj, [key, value]) => (obj[key] = value, obj), {}))
  console.log(data);
  res.send(data);
})

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (word, id) => {
    try {
      let lastId = id || lastLobbyId;
      if (lastId && lobbies.get(lastId)?.players.length === 1) {
        lobbies.get(lastId).players.push(socket.id);
        socket.join(lastId);
        io.to(socket.id).emit('joined', lastId, false, lobbies.get(lastId).word);
        io.to(lobbies.get(lastId).players[0]).emit('lobbyJoined');
        console.log('joiner');
      } else if(lobbies.get(lastId) == null) {
        let ids = id || generateLobbyId();
        lobbies.set(ids, { players: [socket.id], word: word });
        socket.join(ids);
        if (!id) lastLobbyId = ids;
        io.to(socket.id).emit('joined', lastLobbyId, true);
        console.log('host');
      }else{
        io.to(socket.id).emit('error', 'Lobby is full');
      }
    } catch (error) {
      console.error('Error joining lobby:', error);
      io.to(socket.id).emit('error', 'Error joining lobby');
    }
  });

  socket.on('line', (lobbyId, socketId, word, row) => {
    try {
      if (!lobbies.get(lobbyId)) {
        throw new Error('Lobby not found');
      }
      lobbies.get(lobbyId).players.forEach(player => {
        if (player !== socketId) {
          io.to(player).emit('moveMade', word, row);
        }
      });
    } catch (error) {
      console.error('Error sending move:', error,lobbyId, socketId, word, row);
      io.to(socket.id).emit('error', 'Error sending move');
    }
  });

  socket.on('gameend', (lobbyId) => {
    try {
      if (!lobbies.get(lobbyId)) {
        throw new Error('Lobby not found');
      }
      lobbies.delete(lobbyId);
    } catch (error) {
      console.error('Error ending game:', error);
      io.to(socket.id).emit('error', 'Error ending game');
    }
  });

  socket.on('gaveup', (lobbyId, socketId) => {
    try {
      if (!lobbies.get(lobbyId)) {
        throw new Error('Lobby not found');
      }
      lobbies.get(lobbyId).players.forEach(player => {
        if (player !== socketId) {
          io.to(player).emit('opponentGaveUp');
          lobbies.delete(lobbyId);
        }
      });
    } catch (error) {
      console.error('Error giving up:', error);
      io.to(socket.id).emit('error', 'Error giving up: ' + error);
    }
  });

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


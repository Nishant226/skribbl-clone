const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const defaultWords = [
  'apple', 'elephant', 'guitar', 'house', 'laptop', 
  'monkey', 'pencil', 'rainbow', 'tiger', 'umbrella', 
  'castle', 'rocket', 'pizza', 'sun', 'flower'
];

class Player {
  constructor(id, name, avatar = '🦁', isHost = false, isSpectator = false) {
    this.id = id;
    this.name = name;
    this.avatar = avatar;
    this.score = 0;
    this.roundScore = 0;
    this.isHost = isHost;
    this.isReady = isHost;
    this.isSpectator = isSpectator;
  }
}

class Game {
  constructor(room) {
    this.room = room;
  }

  startNewRound() {
    if (this.room.timer) clearTimeout(this.room.timer);
    if (this.room.hintTimer) clearTimeout(this.room.hintTimer);
    if (this.room.selectionTimer) clearTimeout(this.room.selectionTimer);

    this.room.guessedPlayers.clear();
    this.room.currentRoundStrokes = [];
    this.room.guessOrder = [];

    this.room.players.forEach(p => p.roundScore = 0);

    const activePlayers = this.room.players.filter(p => !p.isSpectator);
    if (activePlayers.length === 0) return;

    if (this.room.currentDrawerIndex >= activePlayers.length) {
      this.room.currentDrawerIndex = 0;
      this.room.currentRound++;
    }

    if (this.room.currentRound > this.room.maxRounds) {
      this.endGame();
      return;
    }

    const currentDrawer = activePlayers[this.room.currentDrawerIndex];
    this.room.currentWord = '';
    this.room.currentHint = '';
    
    io.to(this.room.roomId).emit('canvas_clear', {});

    this.room.wordOptions = this.room.getRandomWords(this.room.settings.wordCount || 3);
    const drawTimeSec = this.room.settings.drawTime || 60;

    io.to(this.room.roomId).emit('game_state', {
      phase: 'selecting',
      round: this.room.currentRound,
      drawerId: currentDrawer.id,
      word: '',
      hints: this.room.currentHint
    });

    io.to(this.room.roomId).emit('round_start', {
      drawerId: currentDrawer.id,
      wordOptions: this.room.wordOptions,
      drawTime: drawTimeSec
    });

    io.to(currentDrawer.id).emit('select_word', { words: this.room.wordOptions });

    this.room.selectionTimer = setTimeout(() => {
      if (!this.room.currentWord && this.room.wordOptions.length > 0) {
        const randomWord = this.room.wordOptions[Math.floor(Math.random() * this.room.wordOptions.length)];
        this.room.handleWordChosen(randomWord);
      }
    }, 15000);
  }

  endGame() {
    let winner = this.room.players.reduce((prev, curr) => (curr.score > prev.score) ? curr : prev, this.room.players[0]);
    io.to(this.room.roomId).emit('game_over', {
      winner: winner ? winner.name : 'None',
      leaderboard: this.room.players
    });
    this.room.gameState = 'game_over';
  }
}

class MessageHandler {
  static processMessage(room, socket, text) {
    const player = room.getPlayer(socket.id);
    if (player && player.isSpectator) {
      return { status: 'spectator_chat', text };
    }

    const activePlayers = room.players.filter(p => !p.isSpectator);
    const currentDrawer = activePlayers[room.currentDrawerIndex];

    if (socket.id === currentDrawer?.id || room.guessedPlayers.has(socket.id)) {
      return { status: 'blocked' };
    }

    if (room.gameState === 'playing' && room.currentWord) {
      const isCorrect = text.trim().toLowerCase() === room.currentWord.toLowerCase();
      if (isCorrect) {
        room.guessedPlayers.add(socket.id);
        room.guessOrder.push(socket.id);

        if (player) {
          const totalDrawTime = room.settings.drawTime || 60;
          const timeLeft = room.remainingTimeSeconds || totalDrawTime;
          
          const speedMultiplier = timeLeft / totalDrawTime;
          const earnedPoints = Math.round(100 + (speedMultiplier * 400));

          player.score += earnedPoints;
          player.roundScore = earnedPoints;

          if (currentDrawer) {
            const drawerBonus = Math.round(earnedPoints * 0.3);
            currentDrawer.score += drawerBonus;
            currentDrawer.roundScore += drawerBonus;
          }

          return { 
            status: 'correct', 
            correct: true,
            playerId: player.id,
            playerName: player.name, 
            word: room.currentWord,
            points: earnedPoints 
          };
        }
      }
    }
    return { status: 'chat', correct: false, text };
  }
}

class Room {
  constructor(roomId, hostSocketId, hostName, hostAvatar, settings) {
    this.roomId = roomId;
    this.hostId = hostSocketId;
    
    this.settings = settings || { 
      rounds: 3, 
      drawTime: 60, 
      wordCount: 3, 
      hintCount: 1, 
      roomType: 'public', 
      maxPlayers: 8,
      customWords: [] 
    };

    this.players = [new Player(hostSocketId, hostName, hostAvatar || '🦁', true, false)];
    this.bannedSockets = new Set();
    this.voteKicks = new Map();
    this.gameState = 'lobby';
    this.currentRound = 0;
    this.maxRounds = this.settings.rounds;
    this.currentDrawerIndex = 0;
    this.currentWord = '';
    this.currentHint = '';
    this.timer = null;
    this.hintTimer = null;
    this.selectionTimer = null;
    this.guessedPlayers = new Set();
    this.guessOrder = [];
    this.currentRoundStrokes = [];
    this.remainingTimeSeconds = 60;
    this.countdownInterval = null;
    this.game = new Game(this);
  }

  getPlayer(socketId) {
    return this.players.find(p => p.id === socketId);
  }

  getRandomWords(count) {
    let pool = defaultWords;
    if (this.settings.customWords && this.settings.customWords.length > 0) {
      pool = [...defaultWords, ...this.settings.customWords];
    }
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  addPlayer(id, name, avatar, forceSpectator = false) {
    if (this.bannedSockets.has(id)) {
      return { success: false, message: 'You have been banned from this room and cannot join again!' };
    }
    
    const activePlayers = this.players.filter(p => !p.isSpectator);
    const isRoomFull = this.settings.maxPlayers && activePlayers.length >= this.settings.maxPlayers;

    let isSpectator = forceSpectator;
    
    // If the room is full or the game has already started, make the user an automatic spectator
    if (isRoomFull || this.gameState !== 'lobby') {
      isSpectator = true;
    }

    const newPlayer = new Player(id, name, avatar || '🐼', false, isSpectator);
    this.players.push(newPlayer);
    return { success: true, isSpectator };
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    if (this.hostId === id && this.players.length > 0) {
      const nextLeader = this.players[0];
      this.hostId = nextLeader.id;
      nextLeader.isHost = true;
      nextLeader.isReady = true;
    }
  }

  handleWordChosen(word) {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
      this.selectionTimer = null;
    }

    this.currentWord = word;
    const hintArr = Array(word.length).fill('_');
    this.currentHint = hintArr.join(' ');

    const activePlayers = this.players.filter(p => !p.isSpectator);
    const drawTimeSec = this.settings.drawTime || 60;
    this.remainingTimeSeconds = drawTimeSec;

    io.to(this.roomId).emit('game_state', {
      phase: 'playing',
      round: this.currentRound,
      drawerId: activePlayers[this.currentDrawerIndex]?.id,
      word: this.currentWord,
      hints: this.currentHint
    });

    io.to(this.roomId).emit('word_chosen', { word: this.currentWord });

    if (this.timer) clearTimeout(this.timer);
    if (this.hintTimer) clearTimeout(this.hintTimer);
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    this.countdownInterval = setInterval(() => {
      if (this.remainingTimeSeconds > 0) {
        this.remainingTimeSeconds--;
      }
    }, 1000);

    const hintCountSetting = Number(this.settings.hintCount ?? 1);
    if (hintCountSetting > 0) {
      const intervalTime = (drawTimeSec * 1000) / (hintCountSetting + 1);
      let hintsRevealed = 0;
      this.hintTimer = setInterval(() => {
        hintsRevealed++;
        if (hintsRevealed <= hintCountSetting) {
          let unrevealed = [];
          hintArr.forEach((val, idx) => { if (val === '_') unrevealed.push(idx); });
          
          if (unrevealed.length > 0) {
            let randIdx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
            hintArr[randIdx] = word[randIdx];
            this.currentHint = hintArr.join(' ');

            io.to(this.roomId).emit('update_hint', { hint: this.currentHint });
            io.to(this.roomId).emit('chat_message', { playerId: 'system', playerName: 'System', text: `💡 Hint: A new letter has been revealed!` });
          }
        } else {
          clearInterval(this.hintTimer);
        }
      }, intervalTime);
    }

    this.timer = setTimeout(() => {
      this.endRound();
    }, drawTimeSec * 1000);
  }

  endRound() {
    if (this.timer) clearTimeout(this.timer);
    if (this.hintTimer) clearTimeout(this.hintTimer);
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const roundSummary = this.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      roundScore: p.roundScore || 0,
      totalScore: p.score,
      guessedCorrectly: this.guessedPlayers.has(p.id)
    }));

    const activePlayers = this.players.filter(p => !p.isSpectator);
    const nextDrawerObj = activePlayers[this.currentDrawerIndex + 1] || activePlayers[0];

    io.to(this.roomId).emit('round_end', {
      word: this.currentWord,
      scores: roundSummary,
      nextDrawer: nextDrawerObj ? nextDrawerObj.name : 'Next Player'
    });

    this.currentDrawerIndex++;
    setTimeout(() => {
      this.game.startNewRound();
    }, 5000);
  }
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('create_room', ({ hostName, avatar, settings }) => {
    const roomId = Math.random().toString(36).substring(2, 7);
    const room = new Room(roomId, socket.id, hostName, avatar, settings);
    rooms.set(roomId, room);

    socket.join(roomId);
    socket.emit('room_created', { roomId, settings: room.settings });
  });

  socket.on('get_public_rooms', () => {
    const publicRooms = [];
    for (let [roomId, room] of rooms.entries()) {
      // Public rooms that are either in the lobby or running (playing)
      if (room.settings.roomType === 'public' && room.gameState !== 'game_over') {
        const activeCount = room.players.filter(p => !p.isSpectator).length;
        publicRooms.push({
          roomId: room.roomId,
          hostName: room.getPlayer(room.hostId)?.name || 'Host',
          playerCount: activeCount,
          maxPlayers: room.settings.maxPlayers || 8,
          gameState: room.gameState
        });
      }
    }
    socket.emit('public_rooms_list', { rooms: publicRooms });
  });

  socket.on('quick_play', ({ playerName, avatar }) => {
    let availableRoom = null;
    for (let [roomId, room] of rooms.entries()) {
      if (room.settings && room.settings.roomType === 'public' && room.gameState !== 'game_over') {
        const activeCount = room.players.filter(p => !p.isSpectator).length;
        // First check lobby rooms that have space available
        if (room.gameState === 'lobby' && activeCount < (room.settings.maxPlayers || 8)) {
          availableRoom = room;
          break;
        } else if (!availableRoom) {
          availableRoom = room;
        }
      }
    }

    if (availableRoom) {
      const res = availableRoom.addPlayer(socket.id, playerName, avatar, false);
      if (!res.success) return socket.emit('error_message', { message: res.message });

      socket.join(availableRoom.roomId);
      io.to(availableRoom.roomId).emit('player_joined', { player: availableRoom.getPlayer(socket.id), players: availableRoom.players });
      socket.emit('room_joined_success', { roomId: availableRoom.roomId, settings: availableRoom.settings, isSpectator: res.isSpectator });
    } else {
      const roomId = Math.random().toString(36).substring(2, 7);
      const room = new Room(roomId, socket.id, playerName, avatar, { rounds: 3, drawTime: 60, wordCount: 3, roomType: 'public' });
      rooms.set(roomId, room);

      socket.join(roomId);
      socket.emit('room_created', { roomId, settings: room.settings });
    }
  });

  socket.on('join_room', ({ roomId, playerName, avatar, spectator }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error_message', { message: 'Room not found!' });

    const res = room.addPlayer(socket.id, playerName, avatar, spectator);
    if (!res.success) return socket.emit('error_message', { message: res.message });

    socket.join(roomId);
    io.to(roomId).emit('player_joined', { player: room.getPlayer(socket.id), players: room.players });
    socket.emit('room_joined_success', { roomId, settings: room.settings, isSpectator: res.isSpectator });
  });

  socket.on('toggle_spectator', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.getPlayer(socket.id);
    if (!player) return;

    if (player.isSpectator) {
      const activeCount = room.players.filter(p => !p.isSpectator).length;
      if (room.settings.maxPlayers && activeCount >= room.settings.maxPlayers) {
        return socket.emit('error_message', { message: 'Room is currently full!' });
      }
      player.isSpectator = false;
    } else {
      player.isSpectator = true;
      player.isReady = false;
    }

    io.to(roomId).emit('player_joined', { player, players: room.players });
  });

  socket.on('kick_player', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.emit('kicked_out', { message: 'The host has kicked you out of the room!' });
    }
    room.removePlayer(targetSocketId);
    
    io.to(roomId).emit('player_left', { playerId: targetSocketId, players: room.players });
    io.to(roomId).emit('player_joined', { player: null, players: room.players });
  });

  socket.on('ban_player', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.bannedSockets.add(targetSocketId);
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.emit('kicked_out', { message: 'You have been permanently banned from this room!' });
    }
    room.removePlayer(targetSocketId);
    
    io.to(roomId).emit('player_left', { playerId: targetSocketId, players: room.players });
    io.to(roomId).emit('player_joined', { player: null, players: room.players });
  });

  socket.on('vote_kick', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room || room.gameState !== 'playing') return;

    if (socket.id === targetSocketId) return;

    if (!room.voteKicks.has(targetSocketId)) {
      room.voteKicks.set(targetSocketId, new Set());
    }
    const votesSet = room.voteKicks.get(targetSocketId);
    votesSet.add(socket.id);

    const activePlayers = room.players.filter(p => !p.isSpectator);
    const activeCount = activePlayers.length;
    
    const requiredVotes = Math.max(2, Math.ceil((activeCount - 1) / 2) + 1);

    if (votesSet.size >= requiredVotes) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.emit('kicked_out', { message: 'You have been vote-kicked from the room!' });
      }
      room.removePlayer(targetSocketId);
      room.voteKicks.delete(targetSocketId);
      
      io.to(roomId).emit('player_left', { playerId: targetSocketId, players: room.players });
      io.to(roomId).emit('player_joined', { player: null, players: room.players });
      io.to(roomId).emit('chat_message', { 
        playerId: 'system', 
        playerName: 'System', 
        text: `👢 The player has been successfully vote-kicked!` 
      });
    } else {
      io.to(roomId).emit('chat_message', { 
        playerId: 'system', 
        playerName: 'System', 
        text: `👢 Vote kick progress: ${votesSet.size}/${requiredVotes} votes` 
      });
    }
  });

  socket.on('toggle_ready', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.getPlayer(socket.id);
    if (player && !player.isHost && !player.isSpectator) {
      player.isReady = !player.isReady;
      io.to(roomId).emit('player_joined', { player, players: room.players });
    }
  });

  socket.on('start_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    const activePlayers = room.players.filter(p => !p.isSpectator);
    if (activePlayers.length < 2) {
      return socket.emit('error_message', { message: 'At least 2 active players are required to start the game!' });
    }

    // Check if all non-host active players are ready
    const nonHostPlayers = activePlayers.filter(p => !p.isHost);
    const unreadyPlayers = nonHostPlayers.filter(p => !p.isReady);
    if (unreadyPlayers.length > 0) {
      const unreadyNames = unreadyPlayers.map(p => p.name).join(', ');
      return socket.emit('error_message', { message: `Cannot start game! Some players are not ready: ${unreadyNames}` });
    }

    room.gameState = 'playing';
    room.currentRound = 1;
    room.currentDrawerIndex = 0;
    room.game.startNewRound();
  });

  socket.on('word_chosen', ({ roomId, word }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const activePlayers = room.players.filter(p => !p.isSpectator);
    if (socket.id !== activePlayers[room.currentDrawerIndex]?.id) return;

    room.handleWordChosen(word);
  });

  socket.on('guess', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.getPlayer(socket.id);
    const result = MessageHandler.processMessage(room, socket, text);
    if (result.status === 'blocked') return;

    if (result.status === 'spectator_chat') {
      io.to(roomId).emit('chat_message', { playerId: socket.id, playerName: `[Spectator] ${player?.name || 'Spec'}`, text });
      return;
    }

    io.to(roomId).emit('guess_result', {
      correct: result.correct,
      playerId: socket.id,
      playerName: player?.name,
      points: result.points || 0
    });

    if (result.status === 'correct') {
      io.to(roomId).emit('chat_message', { 
        playerId: 'system',
        playerName: 'System', 
        text: `🎉 ${result.playerName} guessed the word!` 
      });
      io.to(roomId).emit('score_update', { players: room.players });
      return;
    }

    io.to(roomId).emit('chat_message', { playerId: socket.id, playerName: player?.name, text });
  });

  socket.on('chat', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.getPlayer(socket.id);
    const result = MessageHandler.processMessage(room, socket, text);
    if (result.status === 'blocked') return;

    io.to(roomId).emit('chat_message', { playerId: socket.id, playerName: player?.name, text });
  });

  socket.on('draw_start', ({ roomId, x, y, color, size }) => {
    const room = rooms.get(roomId);
    const strokeData = { type: 'start', x, y, color, size };
    if (room) room.currentRoundStrokes.push(strokeData);
    socket.to(roomId).emit('draw_start', { x, y, color, size });
    socket.to(roomId).emit('draw_data', strokeData);
  });

  socket.on('draw_move', ({ roomId, x, y }) => {
    const room = rooms.get(roomId);
    const strokeData = { type: 'move', x, y };
    if (room) room.currentRoundStrokes.push(strokeData);
    socket.to(roomId).emit('draw_move', { x, y });
    socket.to(roomId).emit('draw_data', strokeData);
  });

  socket.on('draw_end', ({ roomId }) => {
    const room = rooms.get(roomId);
    const strokeData = { type: 'end' };
    if (room) room.currentRoundStrokes.push(strokeData);
    socket.to(roomId).emit('draw_end');
    socket.to(roomId).emit('draw_data', strokeData);
  });

  socket.on('canvas_clear', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) room.currentRoundStrokes.push({ type: 'clear' });
    socket.to(roomId).emit('canvas_clear', {});
  });

  socket.on('draw_undo', ({ roomId, imageData }) => {
    socket.to(roomId).emit('draw_undo', { imageData });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (let [roomId, room] of rooms.entries()) {
      const player = room.getPlayer(socket.id);
      if (player) {
        room.removePlayer(socket.id);
        io.to(roomId).emit('player_left', { playerId: socket.id, players: room.players });
        io.to(roomId).emit('player_joined', { player: null, players: room.players });
        
        if (room.players.length === 0) {
          rooms.delete(roomId);
        }
        break;
      }
    }
  });
});

// --- REACT FRONTEND STATIC SERVING FOR PRODUCTION ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
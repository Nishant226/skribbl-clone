import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import Canvas from './Canvas';

function App() {
  const [playerName, setPlayerName] = useState('');
  const [avatar, setAvatar] = useState('🦁');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);

  // Host Configurations
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [rounds, setRounds] = useState(3);
  const [drawTime, setDrawTime] = useState(60);
  const [wordCount, setWordCount] = useState(3);
  const [hintCount, setHintCount] = useState(1);
  const [roomType, setRoomType] = useState('public');
  const [customWordsInput, setCustomWordsInput] = useState('');

  // Public Rooms Browser State
  const [publicRooms, setPublicRooms] = useState([]);
  const [showBrowser, setShowBrowser] = useState(false);

  // Game States
  const [gameState, setGameState] = useState('lobby'); 
  const [wordOptions, setWordOptions] = useState([]);
  const [currentHint, setCurrentHint] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [isDrawer, setIsDrawer] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [winner, setWinner] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);

  // Turn End Modal State
  const [roundSummaryData, setRoundSummaryData] = useState(null);
  const [roundEndedWord, setRoundEndedWord] = useState('');

  // Chat States
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  const avatarsList = ['🦁', '🐼', '🦊', '🐯', '🐰', '🐨', '🐱', '🐶'];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('room');
    if (codeFromUrl) {
      setRoomIdInput(codeFromUrl);
    }

    socket.on('room_created', ({ roomId, settings }) => {
      setRoomId(roomId);
      if (settings) {
        if (settings.roomType) setRoomType(settings.roomType);
        if (settings.rounds) setMaxRounds(settings.rounds);
        if (settings.hintCount !== undefined) setHintCount(settings.hintCount);
      }
      setInRoom(true);
      setIsHost(true);
      setIsSpectator(false);
    });

    socket.on('room_joined_success', ({ roomId, settings, isSpectator }) => {
      setRoomId(roomId);
      if (settings) {
        if (settings.roomType) setRoomType(settings.roomType);
        if (settings.rounds) setMaxRounds(settings.rounds);
        if (settings.hintCount !== undefined) setHintCount(settings.hintCount);
      }
      setInRoom(true);
      setIsHost(false);
      setIsSpectator(!!isSpectator);
    });

    socket.on('room_full_prompt', ({ roomId, playerName, avatar, message }) => {
      const confirmSpectator = window.confirm(`${message}`);
      if (confirmSpectator) {
        socket.emit('join_room', { roomId, playerName, avatar, spectator: true });
      }
    });

    socket.on('player_joined', ({ players }) => {
      setPlayers(players);
      const me = players.find(p => p.id === socket.id);
      if (me) {
        setIsHost(me.isHost);
        setIsSpectator(me.isSpectator);
      }
    });

    socket.on('player_left', ({ players }) => {
      setPlayers(players);
      const me = players.find(p => p.id === socket.id);
      if (me) {
        setIsHost(me.isHost);
      }
    });

    socket.on('kicked_out', ({ message }) => {
      alert(message);
      setInRoom(false);
      setRoomId('');
      setGameState('lobby');
      setPlayers([]);
      setIsHost(false);
      setIsSpectator(false);
    });

    socket.on('error_message', ({ message }) => {
      alert(message);
    });

    socket.on('public_rooms_list', ({ rooms }) => {
      setPublicRooms(rooms);
      setShowBrowser(true);
    });

    socket.on('game_state', ({ phase, round, drawerId, hints }) => {
      if (phase === 'selecting') setGameState('selecting');
      if (phase === 'playing') setGameState('playing');
      if (round) setCurrentRound(round);
      if (hints) setCurrentHint(hints);
      setIsDrawer(socket.id === drawerId && !isSpectator);
    });

    socket.on('round_start', ({ wordOptions, drawTime }) => {
      setGameState('selecting');
      setWordOptions(wordOptions || []);
      if (drawTime) setTimeLeft(drawTime);
      setRoundSummaryData(null);
    });

    socket.on('select_word', ({ words }) => {
      setWordOptions(words);
    });

    socket.on('word_chosen', ({ word }) => {
      setGameState('playing');
      setWordOptions([]);
    });

    socket.on('update_hint', ({ hint }) => {
      setCurrentHint(hint);
    });

    socket.on('score_update', ({ players }) => {
      setPlayers(players);
    });

    socket.on('guess_result', (data) => {
      console.log('Guess result:', data);
    });

    socket.on('chat_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('round_end', ({ word, scores }) => {
      setRoundEndedWord(word);
      setRoundSummaryData(scores);
    });

    socket.on('game_over', ({ winner, leaderboard }) => {
      setGameState('game_over');
      setWinner(winner);
      setPlayers(leaderboard);
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined_success');
      socket.off('room_full_prompt');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('kicked_out');
      socket.off('error_message');
      socket.off('public_rooms_list');
      socket.off('game_state');
      socket.off('round_start');
      socket.off('select_word');
      socket.off('word_chosen');
      socket.off('update_hint');
      socket.off('score_update');
      socket.off('guess_result');
      socket.off('chat_message');
      socket.off('round_end');
      socket.off('game_over');
    };
  }, []);

  useEffect(() => {
    let timer;
    if (gameState === 'playing' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) return alert('Please enter your name!');
    const customWords = customWordsInput ? customWordsInput.split(',').map(w => w.trim()).filter(Boolean) : [];
    socket.emit('create_room', { 
      hostName: playerName, 
      avatar,
      settings: { maxPlayers, rounds, drawTime, wordCount, hintCount, roomType, customWords } 
    });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomIdInput.trim()) return alert('Both name and room code are required!');
    socket.emit('join_room', { roomId: roomIdInput.trim().toLowerCase(), playerName, avatar, spectator: joinAsSpectator });
  };

  const handleJoinPublicRoomDirectly = (targetRoomId) => {
    if (!playerName.trim()) return alert('Please enter your name first!');
    socket.emit('join_room', { roomId: targetRoomId, playerName, avatar, spectator: joinAsSpectator });
  };

  const handleQuickPlay = () => {
    if (!playerName.trim()) return alert('Please enter your name for Quick Play!');
    socket.emit('quick_play', { playerName, avatar });
  };

  const handleFetchPublicRooms = () => {
    socket.emit('get_public_rooms');
  };

  const handleToggleReady = () => {
    socket.emit('toggle_ready', { roomId });
  };

  const handleStartGame = () => {
    socket.emit('start_game', { roomId });
  };

  const handleSelectWord = (word) => {
    socket.emit('word_chosen', { roomId, word });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('guess', { roomId, text: chatInput });
    setChatInput('');
  };

  const handleKick = (targetId) => {
    socket.emit('kick_player', { roomId, targetSocketId: targetId });
  };

  const handleBan = (targetId) => {
    socket.emit('ban_player', { roomId, targetSocketId: targetId });
  };

  const handleVoteKick = (targetId) => {
    socket.emit('vote_kick', { roomId, targetSocketId: targetId });
  };

  const handleToggleSpectatorMode = () => {
    socket.emit('toggle_spectator', { roomId });
  };

  if (!inRoom) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans selection:bg-purple-500 selection:text-white">
        <div className="flex items-center gap-3 mb-6 animate-fade-in">
          <span className="text-4xl filter drop-shadow-md">🎨</span>
          <h1 className="text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-amber-400">
            Skribbl.io Clone
          </h1>
        </div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 backdrop-blur-xl">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Player Name</label>
            <input
              type="text"
              placeholder="Enter Your Name..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 text-white px-4 py-3 rounded-xl font-medium outline-none transition"
            />
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block text-center mb-2.5">Choose Avatar</span>
            <div className="flex justify-center gap-2 flex-wrap">
              {avatarsList.map((av) => (
                <button
                  key={av}
                  onClick={() => setAvatar(av)}
                  className={`text-2xl p-2 rounded-xl transition transform hover:scale-110 active:scale-95 ${
                    avatar === av ? 'bg-purple-600 shadow-lg shadow-purple-600/40 ring-2 ring-purple-400' : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2.5 bg-slate-950/40 py-2.5 rounded-xl border border-slate-800/50">
            <input type="checkbox" id="spectatorCheck" checked={joinAsSpectator} onChange={(e) => setJoinAsSpectator(e.target.checked)} className="w-4 h-4 accent-purple-500 rounded cursor-pointer" />
            <label htmlFor="spectatorCheck" className="text-sm text-slate-300 font-medium cursor-pointer select-none">Join as Spectator 👁️</label>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleQuickPlay} className="py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold rounded-xl shadow-lg transition active:scale-95 text-sm">⚡ Quick Play</button>
            <button onClick={handleFetchPublicRooms} className="py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-white font-bold rounded-xl shadow-lg transition active:scale-95 text-sm">🌐 Public Rooms</button>
          </div>

          {showBrowser && (
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 max-h-44 overflow-y-auto space-y-2">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Active Public Rooms:</h4>
              {publicRooms.length === 0 ? (
                <p className="text-xs text-slate-500">No public rooms available.</p>
              ) : (
                publicRooms.map((r) => (
                  <div key={r.roomId} className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-xs font-medium text-slate-300">{r.hostName}'s Room ({r.playerCount}/{r.maxPlayers})</span>
                    <button onClick={() => handleJoinPublicRoomDirectly(r.roomId)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-md text-xs font-bold transition shadow">Join</button>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Room Settings (Host)</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400">Max Players:</span>
                <input type="number" min="2" max="20" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} className="w-12 bg-slate-950 text-center border border-slate-800 rounded text-white py-0.5 outline-none font-bold" />
              </div>
              <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400">Rounds:</span>
                <input type="number" min="2" max="10" value={rounds} onChange={(e) => setRounds(e.target.value)} className="w-12 bg-slate-950 text-center border border-slate-800 rounded text-white py-0.5 outline-none font-bold" />
              </div>
              <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400">Draw Sec:</span>
                <input type="number" min="15" max="240" value={drawTime} onChange={(e) => setDrawTime(e.target.value)} className="w-12 bg-slate-950 text-center border border-slate-800 rounded text-white py-0.5 outline-none font-bold" />
              </div>
              <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400">Words:</span>
                <input type="number" min="1" max="5" value={wordCount} onChange={(e) => setWordCount(e.target.value)} className="w-12 bg-slate-950 text-center border border-slate-800 rounded text-white py-0.5 outline-none font-bold" />
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400">Hint Count (0-5):</span>
              <input type="number" min="0" max="5" value={hintCount} onChange={(e) => setHintCount(e.target.value)} className="w-12 bg-slate-950 text-center border border-slate-800 rounded text-white py-0.5 outline-none font-bold" />
            </div>

            <div>
              <span className="text-xs text-slate-400 block mb-1">Custom Words (Comma separated):</span>
              <input type="text" placeholder="e.g. superhero, galaxy, code" value={customWordsInput} onChange={(e) => setCustomWordsInput(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" />
            </div>

            <div className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 font-bold">Room Type:</span>
              <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className="bg-slate-950 text-white border border-slate-800 rounded-lg px-2.5 py-1 outline-none font-semibold">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <button onClick={handleCreateRoom} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-black text-base rounded-xl shadow-lg transition active:scale-95 uppercase tracking-wider">Create Room</button>
          
          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-3 text-slate-500 font-bold">Or Join Existing</span></div>
          </div>

          <div className="flex gap-2">
            <input type="text" placeholder="Enter Room Code..." value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 text-white px-4 py-3 rounded-xl text-sm font-medium outline-none" />
            <button onClick={handleJoinRoom} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition active:scale-95 text-sm">Join</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'lobby') {
    const inviteLink = `${window.location.origin}?room=${roomId}`;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-6">
          {roomType === 'private' ? (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h2 className="text-xl font-black">Private Room Code: <span className="text-red-400">{roomId}</span></h2>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Invite Link:</span>
                <input type="text" readOnly value={inviteLink} onClick={(e) => e.target.select()} className="bg-slate-900 text-emerald-400 text-xs px-3 py-1.5 rounded-lg border border-slate-800 w-52 text-center cursor-pointer outline-none font-mono" />
              </div>
            </div>
          ) : (
            <h2 className="text-2xl font-black text-emerald-400">🌐 Public Lobby</h2>
          )}

          <div className="flex items-center justify-between bg-slate-950 px-4 py-3 rounded-xl border border-slate-800">
            <span className="text-sm font-medium text-slate-400">Mode: <strong className="text-white">{isSpectator ? 'Spectator 👁️' : 'Player 🎮'}</strong></span>
            <button onClick={handleToggleSpectatorMode} className={`px-4 py-2 text-xs font-bold rounded-lg transition shadow ${isSpectator ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>
              {isSpectator ? 'Join Game / Become Player' : 'Switch to Spectator'}
            </button>
          </div>
          
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-left">Participants ({players.length}):</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {players.map((p, index) => (
                <div key={index} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="font-semibold text-sm flex items-center gap-2.5">
                    <span className="text-xl">{p.avatar}</span>
                    <span>{p.name} {p.id === socket.id ? '(you)' : ''}</span>
                    {p.isHost && <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-bold">Host</span>}
                    {p.isSpectator && <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-bold">Spec</span>}
                  </span>
                  
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold">{p.isHost ? '🟢 Active' : (p.isReady ? '✅ Ready' : '⏳ Waiting')}</span>
                    {isHost && p.id !== socket.id && (
                      <div className="flex gap-1.5 ml-2">
                        <button onClick={() => handleKick(p.id)} className="bg-red-600/80 hover:bg-red-600 text-white text-xs px-2.5 py-1 rounded-md font-bold transition">Kick</button>
                        <button onClick={() => handleBan(p.id)} className="bg-slate-900 border border-red-500/50 text-red-400 hover:bg-red-950 text-xs px-2.5 py-1 rounded-md font-bold transition">Ban</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!isHost && !isSpectator && (
            <button onClick={handleToggleReady} className={`w-full py-3.5 font-black text-base rounded-xl shadow-lg transition active:scale-95 uppercase tracking-wider ${players.find(p => p.id === socket.id)?.isReady ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
              {players.find(p => p.id === socket.id)?.isReady ? 'Cancel Ready' : 'Ready Up! 🚀'}
            </button>
          )}

          {isHost && (
            <button onClick={handleStartGame} className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-white font-black text-lg rounded-xl shadow-xl transition active:scale-95 uppercase tracking-wider">Start Game 🎮</button>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'game_over') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <h1 className="text-3xl font-black text-amber-400 animate-pulse">🏆 Game Over! 🏆</h1>
          <h2 className="text-xl font-bold text-emerald-400">Winner: {winner} 🎉</h2>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-left">Final Leaderboard</h3>
            <div className="space-y-2">
              {players.sort((a, b) => b.score - a.score).map((p, index) => (
                <div key={index} className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <span>{p.avatar}</span>
                    <span>{index + 1}. {p.name}</span>
                  </span>
                  <span className="font-black text-amber-400">{p.score} pts</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition active:scale-95">Play Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans flex flex-col items-center">
      
      {/* Skribbl.io Style Turn End Modal Popup */}
      {roundSummaryData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-lg w-full text-center space-y-5 shadow-2xl">
            <h2 className="text-2xl font-black text-purple-400">🎬 Time's Up!</h2>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <p className="text-sm text-slate-400 uppercase tracking-wider font-bold">Correct Word was:</p>
              <p className="text-2xl font-black text-emerald-400 tracking-widest mt-1">{roundEndedWord}</p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {roundSummaryData.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.avatar}</span>
                    <span className="font-bold text-sm text-slate-200">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${item.roundScore > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {item.roundScore > 0 ? `+${item.roundScore} pts` : '0 pts'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 italic">New turn starting soon...</p>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="w-full max-w-7xl flex justify-between items-center bg-slate-900 px-6 py-3.5 rounded-2xl border border-slate-800 mb-6 shadow-xl">
        <div className="text-xs font-bold bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-slate-300">
          Round: <span className="text-purple-400 font-black">{currentRound} / {maxRounds}</span>
        </div>
        
        <div className="text-base font-black tracking-wide">
          {roomType === 'private' ? (
            <>Room Code: <span className="text-red-400">{roomId}</span></>
          ) : (
            <span className="text-emerald-400">🌐 Public Room</span>
          )} {isSpectator && <span className="text-xs text-slate-400 font-normal">(Spectator)</span>}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleToggleSpectatorMode} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg transition border border-slate-700">
            {isSpectator ? 'Join Game 🎮' : 'Spec 👁️'}
          </button>
          <div className={`text-xs font-black px-3.5 py-2 rounded-xl border ${timeLeft <= 10 ? 'bg-red-950/80 border-red-500 text-red-400 animate-pulse' : 'bg-slate-950 border-slate-800 text-emerald-400'}`}>
            ⏳ {timeLeft}s
          </div>
        </div>
      </div>

      {/* Word Hint Banner (Colorful & Unique Glowing Gradient Styling) */}
      <div className="mb-6 text-center">
        {gameState === 'selecting' ? (
          <div className="bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-pink-500/20 p-[1px] rounded-2xl shadow-xl">
            <p className="text-base font-black text-amber-300 bg-slate-900/95 px-8 py-3 rounded-2xl border border-amber-500/30 shadow-inner flex items-center justify-center gap-2">
              <span className="animate-bounce">🎯</span> {isDrawer ? 'Choose a word to draw and amaze everyone!' : `${drawerName} is picking a secret word...`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-purple-500/30 p-[2px] rounded-2xl shadow-2xl inline-block">
              <p className="text-3xl font-black tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-slate-900 px-10 py-3 rounded-2xl border border-emerald-500/40 shadow-inner">
                {currentHint}
              </p>
            </div>
            <p className="text-xs font-bold text-slate-300 tracking-wide flex items-center justify-center gap-1.5">
              <span className="text-amber-400">✏️ Artist:</span> <span className="text-pink-400 font-extrabold uppercase">{drawerName}</span>
            </p>
          </div>
        )}
      </div>

      {/* Word Selection Overlay */}
      {gameState === 'selecting' && isDrawer && wordOptions.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl text-center mb-6 max-w-md w-full">
          <h3 className="text-base font-bold mb-4 text-slate-200">Select a Word to Draw:</h3>
          <div className="flex justify-center gap-3 flex-wrap">
            {wordOptions.map((word, idx) => (
              <button key={idx} onClick={() => handleSelectWord(word)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition active:scale-95 text-sm">
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Balanced Grid Section */}
      <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        
        {/* Left: Players List */}
        <div className="md:col-span-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col h-[510px]">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Players ({players.length})</h4>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {players.map((p, index) => (
              <div key={index} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                <span className="font-semibold flex items-center gap-2 truncate max-w-[110px]">
                  <span>{p.avatar}</span>
                  <span className="truncate">{p.name} {p.id === socket.id ? '(you)' : ''}</span>
                </span>
                
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-amber-400 text-[11px]">{p.score || 0} pts</span>
                  
                  {/* Controls logic for other players */}
                  {p.id !== socket.id && (
                    <>
                      {/* Host controls: Kick & Ban */}
                      {isHost ? (
                        <div className="flex gap-1 ml-1">
                          <button 
                            onClick={() => handleKick(p.id)} 
                            title="Kick Player" 
                            className="bg-red-600 hover:bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold transition"
                          >
                            Kick
                          </button>
                          <button 
                            onClick={() => handleBan(p.id)} 
                            title="Ban Player" 
                            className="bg-slate-900 border border-red-500/60 text-red-400 hover:bg-red-950 px-1.5 py-0.5 rounded text-[10px] font-bold transition"
                          >
                            Ban
                          </button>
                        </div>
                      ) : (
                        /* Non-host controls: Vote Kick */
                        !isSpectator && (
                          <button 
                            onClick={() => handleVoteKick(p.id)} 
                            title="Vote Kick" 
                            className="bg-pink-600/80 hover:bg-pink-600 text-white p-1 rounded text-[10px] transition ml-1"
                          >
                            👢
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Canvas Area */}
        <div className="md:col-span-6 flex justify-center">
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-2xl flex flex-col justify-center items-center w-full">
            <Canvas roomId={roomId} isDrawer={isDrawer && gameState === 'playing' && !isSpectator} />
          </div>
        </div>

        {/* Right: Colorful & Vibrant Chat & Guesses Box */}
        <div className="md:col-span-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col justify-between h-[510px]">
          <h4 className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 uppercase tracking-wider mb-2">💬 Chat & Guesses</h4>
          <div className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-y-auto space-y-2 text-xs mb-3 font-medium">
            {messages.map((msg, idx) => {
              // Unique styling based on message types
              const isCorrectGuess = msg.text && msg.text.includes('guessed the word');
              const isHintMsg = msg.text && msg.text.includes('Hint:');
              const isSpectatorMsg = msg.playerName && msg.playerName.startsWith('[Spectator]');

              return (
                <div 
                  key={idx} 
                  className={`p-1.5 rounded-lg transition-all ${
                    isCorrectGuess 
                      ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold shadow-sm' 
                      : isHintMsg 
                      ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-bold shadow-sm' 
                      : isSpectatorMsg
                      ? 'bg-purple-950/40 text-purple-300 italic'
                      : 'text-slate-200'
                  }`}
                >
                  {msg.isSystem ? (
                    <span className="flex items-center gap-1.5">
                      {isCorrectGuess ? '🎉' : isHintMsg ? '💡' : '📢'} {msg.text}
                    </span>
                  ) : (
                    <>
                      <b className={`${isSpectatorMsg ? 'text-purple-400' : 'text-pink-400'} font-black`}>
                        {msg.playerName}: 
                      </b>
                      <span className="text-slate-100 ml-1">{msg.text}</span>
                    </>
                  )}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              placeholder={isSpectator ? "Spectating chat..." : "Type your guess..."}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 focus:border-purple-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-medium outline-none shadow-inner"
            />
            <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition active:scale-95">Send</button>
          </form>
        </div>

      </div>
    </div>
  );
}

export default App;
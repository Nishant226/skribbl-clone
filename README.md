# Skribbl.io Clone (Full-Stack Real-Time Drawing & Guessing Game)

A feature-rich, real-time multiplayer drawing and guessing (pictionary) game inspired by Skribbl.io, built using Node.js, Express, Socket.io, and React.

## Live Demo
- **Live URL:** https://skribbl-clone-s5vr.onrender.com

## ✨ Features
- **Real-Time Multiplayer Rooms:** Create or join private/public rooms with player lists and host controls.
- **Interactive Canvas Drawing:** Smooth real-time drawing synchronization using HTML5 Canvas with custom tools (brush, colors, brush size, eraser, undo, clear).
- **Word Selection & Hints:** Drawer picks from a list of words; letter hints reveal periodically over time.
- **Scoring & Leaderboard:** Speed-based point system for correct guesses and final winner declaration.
- **Live Chat & Guessing:** Real-time chat for guesses and system notifications.

## 🏗️ Architecture & Real-Time Sync Overview
- **WebSockets (Socket.IO):** Handles real-time event-driven communication between clients and the server (room creation, joins, chat broadcasts, and state sync).
- **Canvas Synchronization:** Mouse and touch events on the HTML5 Canvas capture coordinates (`x`, `y`, color, size) and broadcast them via WebSockets so all connected clients render strokes simultaneously.
- **Game State Management:** Server-authoritative logic controls round rotation, drawer assignment, word selection timers, and score tallying.

## 🛠️ Tech Stack
- **Frontend:** React, Vite, HTML5 Canvas API
- **Backend:** Node.js, Express, Socket.IO
- **Deployment:** Render (Monorepo setup)

## ⚙️ Local Setup & Installation

1. Clone the repository:
   ```bash
  git clone [https://github.com/Nishant226/skribbl-clone.git](https://github.com/Nishant226/skribbl-clone.git)
   cd skribbl-clone

2. Install dependencies for backend and frontend:
   ```bash
 # Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

 # Run the application locally:
 node backend/server.js

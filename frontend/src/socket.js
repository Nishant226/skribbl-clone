import { io } from 'socket.io-client';

// Local development ke liye localhost, aur live production ke liye automatic current domain
const URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;

export const socket = io(URL);
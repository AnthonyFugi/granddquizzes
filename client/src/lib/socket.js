import { io } from 'socket.io-client';
import { API_BASE } from './api.js';

export const connectSocket = () => io(API_BASE || undefined, { transports: ['websocket', 'polling'] });

const KEY = (code) => `gq:player:${String(code).toUpperCase()}`;
export const readPlayer = (code) => {
  try {
    return JSON.parse(localStorage.getItem(KEY(code)));
  } catch {
    return null;
  }
};
export const savePlayer = (code, data) => localStorage.setItem(KEY(code), JSON.stringify(data));
export const clearPlayer = (code) => localStorage.removeItem(KEY(code));

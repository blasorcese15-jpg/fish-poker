import { io } from 'socket.io-client';

// Mismo origen: en dev Vite proxya /socket.io al server (puerto 3001),
// en producción el server sirve el build y el socket directamente.
export const socket = io();

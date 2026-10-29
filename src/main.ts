import { startGame } from './game';

startGame().catch((err) => console.error('Game failed to start', err));

import { installSoundUnlock } from './audio/sound';
import { startGame } from './game';

installSoundUnlock();

startGame().catch((err) => console.error('Game failed to start', err));

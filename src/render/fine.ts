/**
 * Fine pixels per art pixel. The simulation stays on the WORLD_W x WORLD_H art grid; everything that is drawn
 * (terrain, props, prey, queen, ants) lives on a grid FINE times finer, so one fine pixel is half an art pixel
 * (2 screen pixels at the default zoom 4, the same size as one worker-ant pixel).
 */
export const FINE = 2;

// The homepage film opens on frame 134 of 960 (30 fps): the Code panel highlights STR R0, [R1]
// while Pac-Man takes the step. The poster is that frame, and playback starts inside it, so the
// first frame drawn is the poster. Kept out of PromoVideo ("use client") so the server page can
// preload the poster.
export const POSTER = "/video/pacasm-poster.webp";
export const START = 4.48;

export function playbackBufferReady(playlist, startSeconds = 0, initialSeconds = 4, resumeAhead = 12) {
  const durations = [...playlist.matchAll(/#EXTINF:([\d.]+)/g)].map(match => Number(match[1]));
  const availableSeconds = durations.reduce((total, seconds) => total + seconds, 0);
  if (!durations.length) return false;
  if (playlist.includes('#EXT-X-ENDLIST')) return true;
  const start = Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0;
  return availableSeconds >= (start ? start + resumeAhead : initialSeconds);
}

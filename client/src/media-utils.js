export function cleanTitle(title = '') {
  const source = String(title);
  // Keep the name and episode number; remove release/codec suffixes for display only.
  return source
    .replace(/^www\.[\w.-]+\s*-\s*/i, '')
    .replace(/\.(mp4|mkv|avi|webm|mov|m4v)$/i, '')
    .replace(/(S\d{1,2})[._ ](?:720|1080|2160)$/i, '$1')
    .replace(/[._]/g, ' ')
    .replace(/\s*[\[(](?:\d{3,4}p|4k|1080p|720p|BluRay|WEBRip|WEB-DL|x26[45]|HEVC).*$/i, '')
    .replace(/\s+\b(?:\d{3,4}p|WEB[- ]?DL|WEBRip|Blu[- ]?Ray|DVD|UPSCALED|COMPLETE|HMAX|AMZN|x26[45]|HEVC|h\s?26[45]|AAC|DDP|10bit)\b.*$/i, '')
    .replace(/[- ](?:1080p|720p|2160p|H264|H265|WEBRip|AAC|AC[ -]?3)\b.*$/i, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ').trim() || source;
}

export function continueWatching(video, progress) {
  const item = progress[video.id];
  if (!item || item.completed || !Number.isFinite(item.currentTime) || item.currentTime <= 5) return false;
  const duration = video.durationMs ? video.durationMs / 1000 : item.duration;
  return !duration || item.currentTime < duration - Math.min(15, duration * 0.05);
}

export function playbackQueue(video, candidates) {
  const related = candidates.filter((item) => item.collection === video.collection);
  const sorted = related.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  return sorted.some((item) => item.id === video.id) ? sorted : [video];
}

export function isShortVideo(video) {
  return Number.isFinite(video.durationMs) && video.durationMs > 0 && video.durationMs <= 180000;
}

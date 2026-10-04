export const HD_PROFILES = Object.freeze(Object.assign(Object.create(null), {
  '720p': { width: 1280, height: 720, crf: '22', maxrate: '3500k', bufsize: '7000k' },
  '1080p': { width: 1920, height: 1080, crf: '21', maxrate: '6000k', bufsize: '12000k' }
}));

export function hlsSelection(query, video, hdEnabled) {
  const quality = query.quality;
  if (quality !== undefined && (typeof quality !== 'string' || (quality !== 'auto' && !HD_PROFILES[quality]))) {
    throw Object.assign(new Error('Unknown playback quality.'), { status: 400 });
  }
  if (!HD_PROFILES[quality]) return { variant: query.vcopy === '1' ? 'vcopy' : 'auto', from: 0 };
  if (!hdEnabled) throw Object.assign(new Error('HD conversion is not enabled on this server.'), { status: 400 });
  const requested = Number(query.from || 0);
  const lastSecond = Math.max(0, Math.floor(Number(video.durationMs || 0) / 1000) - 1);
  const from = Number.isFinite(requested) ? Math.min(lastSecond, Math.max(0, Math.floor(requested))) : 0;
  return { variant: quality, from };
}

export function hlsVariantSuffix(variant, from = 0) {
  if (HD_PROFILES[variant]) return `-hdv1-${variant}-from${from}`;
  return variant === 'vcopy' ? '-vcopy' : '';
}

export function hlsVariantQuery(variant, from = 0) {
  if (HD_PROFILES[variant]) return `&quality=${variant}&from=${from}`;
  return variant === 'vcopy' ? '&vcopy=1' : '';
}

export function hdVideoArgs(quality) {
  const profile = HD_PROFILES[quality];
  if (!profile) throw new Error('Unknown HD profile.');
  return [
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-crf', profile.crf, '-maxrate', profile.maxrate, '-bufsize', profile.bufsize,
    '-profile:v', 'main', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-threads', '6',
    // Preserve aspect ratio and source detail without upscaling smaller videos.
    '-vf', `scale=w='min(${profile.width},iw)':h='min(${profile.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30`,
    '-force_key_frames', 'expr:gte(t,n_forced*2)'
  ];
}

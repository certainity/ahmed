import test from 'node:test';
import assert from 'node:assert/strict';
import { hlsSelection, hlsVariantSuffix, hlsVariantQuery } from '../server/playback-profiles.js';
import { playbackBufferReady } from '../server/hls-buffer.js';

test('HD requests require the local server capability and an allowlisted quality', () => {
  const movie = { durationMs: 4869905 };
  assert.throws(() => hlsSelection({ quality: '1080p' }, movie, false), { status: 400 });
  assert.throws(() => hlsSelection({ quality: '../../outside' }, movie, true), { status: 400 });
  assert.throws(() => hlsSelection({ quality: 'constructor' }, movie, true), { status: 400 });
  assert.throws(() => hlsSelection({ quality: ['1080p'] }, movie, true), { status: 400 });
  assert.deepEqual(hlsSelection({ vcopy: '1', from: 999 }, movie, false), { variant: 'vcopy', from: 0 });
  assert.deepEqual(hlsSelection({}, movie, false), { variant: 'auto', from: 0 });
});

test('resume conversion stays inside the actual movie and uses its own cache and segment URLs', () => {
  const movie = { durationMs: 4869905 };
  assert.deepEqual(hlsSelection({ quality: '1080p', from: '769.9' }, movie, true), { variant: '1080p', from: 769 });
  assert.equal(hlsSelection({ quality: '1080p', from: Infinity }, movie, true).from, 0);
  assert.equal(hlsSelection({ quality: '1080p', from: -2 }, movie, true).from, 0);
  assert.equal(hlsSelection({ quality: '1080p', from: 99999 }, movie, true).from, 4868);
  const profiles = ['auto', 'vcopy', '720p', '1080p'].map(variant => hlsVariantSuffix(variant, 769));
  assert.equal(new Set(profiles).size, 4);
  assert.notEqual(hlsVariantSuffix('1080p', 769), hlsVariantSuffix('1080p', 0));
  assert.equal(hlsVariantQuery('1080p', 769), '&quality=1080p&from=769');
  assert.equal(hlsVariantQuery('vcopy'), '&vcopy=1');
  assert.equal(hlsVariantQuery('auto'), '');
  // A partial stream starting at 769 needs 16 seconds to resume at scene 773.
  const playlist = '#EXTM3U\n' + Array(8).fill('#EXTINF:2,\nsegment.ts\n').join('');
  assert.equal(playbackBufferReady(playlist, 773 - 769), true);
  assert.equal(playbackBufferReady(playlist, 773), false);
});

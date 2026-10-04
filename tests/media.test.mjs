import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanTitle, continueWatching, playbackQueue, isShortVideo } from '../client/src/media-utils.js';
import { readLibrarySnapshot, writeLibrarySnapshot } from '../server/library-cache.js';
import { playbackBufferReady } from '../server/hls-buffer.js';

test('display titles preserve episode identities and remove release suffixes', () => {
  assert.equal(cleanTitle('Alphablocks.S01E02.Bee.720p.iP.WEBRip.AAC2.0.H.264-BTW'), 'Alphablocks S01E02 Bee');
  assert.equal(cleanTitle('Masha.and.the.Bear.S01E01.How.They.Met_Don\'t.Wake.Till.Spring.1080p.WEB-DL.H.264-Tooncore'), "Masha and the Bear S01E01 How They Met Don't Wake Till Spring");
  assert.equal(cleanTitle("A Bug's Life (1998) [1080p]"), "A Bug's Life (1998)");
  assert.equal(cleanTitle('01 Al-Fatiha'), '01 Al-Fatiha');
  assert.equal(cleanTitle('Alphablocks.S01.720'), 'Alphablocks S01');
});

test('finished episodes do not appear in Continue; unfinished ones remain', () => {
  const video = { id: 'episode', durationMs: 180000 };
  assert.equal(continueWatching(video, { episode: { currentTime: 60 } }), true);
  assert.equal(continueWatching(video, { episode: { currentTime: 178 } }), false);
  assert.equal(continueWatching(video, { episode: { currentTime: 60, completed: true } }), false);
});

test('playback queue stays within the selected collection in natural episode order', () => {
  const video = { id: '2', collection: 'Show A', title: 'Episode 2' };
  const candidates = [video, { id: '10', collection: 'Show A', title: 'Episode 10' },
    { id: '1', collection: 'Show A', title: 'Episode 1' }, { id: 'other', collection: 'Show B', title: 'Episode 3' }];
  assert.deepEqual(playbackQueue(video, candidates).map(v => v.id), ['1', '2', '10']);
  assert.deepEqual(playbackQueue(video, []), [video]);
});

test('catalogue survives restart and rejects another approved-tree scope or corrupt data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-cache-test-'));
  const file = path.join(dir, 'kids.json');
  const cache = { fetchedAt: 1000, videos: [{ id: 'one', title: 'Episode 1' }], warnings: [], folderCount: 2 };
  try {
    assert.equal(readLibrarySnapshot(file, 'folder-a'), null);
    writeLibrarySnapshot(file, 'folder-a', cache);
    assert.deepEqual(readLibrarySnapshot(file, 'folder-a'), cache);
    assert.equal(readLibrarySnapshot(file, 'folder-b'), null);
    fs.writeFileSync(file, '{invalid');
    assert.equal(readLibrarySnapshot(file, 'folder-a'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Shorts uses finite known durations up to three minutes', () => {
  assert.equal(isShortVideo({ durationMs: 180000 }), true);
  assert.equal(isShortVideo({ durationMs: 180001 }), false);
  assert.equal(isShortVideo({ durationMs: 0 }), false);
  assert.equal(isShortVideo({ durationMs: Infinity }), false);
});

test('HLS resume readiness uses elapsed playlist time rather than a guessed segment count', () => {
  const playlist = seconds => '#EXTM3U\n' + seconds.map(value => `#EXTINF:${value},\nsegment.ts\n`).join('');
  assert.equal(playbackBufferReady(playlist([2])), false);
  assert.equal(playbackBufferReady(playlist([4])), true);
  assert.equal(playbackBufferReady(playlist([10, 10, 10]), 20), false);
  assert.equal(playbackBufferReady(playlist([10, 10, 10, 4]), 20), true);
  assert.equal(playbackBufferReady(playlist([3]) + '#EXT-X-ENDLIST'), true);
  assert.equal(playbackBufferReady('#EXTM3U\n#EXT-X-ENDLIST'), false);
});

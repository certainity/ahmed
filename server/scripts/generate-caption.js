import dotenv from 'dotenv';
import { google } from 'googleapis';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverDir, '.env') });

const captionDir = path.join(serverDir, 'cache-captions');
const tempDir = path.join(os.tmpdir(), 'kids-drive-captions');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function createAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: SCOPES
    });
  }

  const configuredKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const keyFilename = configuredKeyFile && path.isAbsolute(configuredKeyFile)
    ? configuredKeyFile
    : configuredKeyFile ? path.join(serverDir, configuredKeyFile) : undefined;

  return new google.auth.GoogleAuth({
    keyFilename,
    scopes: SCOPES
  });
}

function sanitize(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function headersToFfmpeg(headers) {
  const entries = typeof headers.entries === 'function'
    ? [...headers.entries()]
    : Object.entries(headers);
  return entries.map(([key, value]) => `${key}: ${value}`).join('\r\n');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited with ${code}\n${stderr || stdout}`.trim());
      error.code = code;
      reject(error);
    });
  });
}

async function findCommand(explicitCommand) {
  if (explicitCommand) return explicitCommand;
  if (process.env.WHISPER_COMMAND) return process.env.WHISPER_COMMAND;

  for (const candidate of ['whisper', 'whisper-cli']) {
    try {
      await run(process.platform === 'win32' ? 'where.exe' : 'which', [candidate]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videoId = sanitize(args.id);
  const library = sanitize(args.library || 'kids') || 'kids';
  const language = args.language || process.env.WHISPER_LANGUAGE || 'English';
  const model = args.model || process.env.WHISPER_MODEL || 'tiny.en';

  if (!videoId) {
    throw new Error('Usage: npm run captions:one -- --id <google-drive-file-id> [--library kids] [--command whisper|whisper-cli] [--model tiny.en]');
  }

  fs.mkdirSync(captionDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const captionPath = path.join(captionDir, `${library}-${videoId}.vtt`);
  const audioPath = path.join(tempDir, `${library}-${videoId}.wav`);
  const whisperOutBase = path.join(tempDir, `${library}-${videoId}`);

  const command = await findCommand(args.command);
  if (!command) {
    throw new Error('No free local Whisper command found. Install whisper.cpp and set WHISPER_COMMAND=whisper-cli, or install Python whisper so the `whisper` command is available.');
  }

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(videoId)}?alt=media`;
  const auth = createAuth();
  const headers = await auth.getRequestHeaders(driveUrl);

  console.log(`Extracting audio for ${videoId}...`);
  await run(FFMPEG_PATH, [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-headers', headersToFfmpeg(headers),
    '-i', driveUrl,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    audioPath
  ]);

  const commandName = path.basename(command).toLowerCase();
  console.log(`Generating captions with ${commandName}...`);

  if (commandName.includes('whisper-cli')) {
    const whisperModel = args.model || process.env.WHISPER_CPP_MODEL;
    if (!whisperModel) {
      throw new Error('whisper-cli requires --model <path-to-ggml-model.bin> or WHISPER_CPP_MODEL.');
    }
    await run(command, [
      '-m', whisperModel,
      '-f', audioPath,
      '-l', args.languageCode || process.env.WHISPER_LANGUAGE_CODE || 'en',
      '-ovtt',
      '-of', whisperOutBase
    ]);
  } else {
    await run(command, [
      audioPath,
      '--model', model,
      '--language', language,
      '--output_format', 'vtt',
      '--output_dir', tempDir
    ]);
  }

  const possibleOutputs = [
    `${whisperOutBase}.vtt`,
    path.join(tempDir, `${path.basename(audioPath, path.extname(audioPath))}.vtt`)
  ];
  const generated = possibleOutputs.find((item) => fs.existsSync(item));
  if (!generated) {
    throw new Error(`Whisper finished, but no VTT file was found in ${tempDir}.`);
  }

  fs.copyFileSync(generated, captionPath);
  console.log(`Caption ready: ${captionPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

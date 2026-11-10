#!/usr/bin/env node
// Builds public/media from data/catalog.json.
// Every source is NASA footage from images.nasa.gov (public domain, US Government work).
// Requires ffmpeg on PATH. Usage: node scripts/build-media.mjs [--force]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'media');
const force = process.argv.includes('--force');
const catalog = JSON.parse(readFileSync(join(root, 'data', 'catalog.json'), 'utf8'));
for (const d of ['v', 't', 'img']) mkdirSync(join(out, d), { recursive: true });

const url = (u) => encodeURI(decodeURI(u)).replace(/’/g, '%E2%80%99');
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

for (const item of catalog) {
  const video = join(out, 'v', `${item.id}.mp4`);
  const thumb = join(out, 't', `${item.id}.jpg`);
  const vertical = item.type === 'short';
  if (force || !existsSync(video)) {
    console.log(`encode ${item.id}`);
    ff([
      '-ss', String(item.start), '-i', url(item.source), '-t', String(item.duration),
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', vertical ? 'crop=ih*9/16:ih,scale=-2:720' : 'scale=-2:360',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', vertical ? '28' : '27', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '80k', '-ac', '2', '-movflags', '+faststart', video,
    ]);
  }
  if (force || !existsSync(thumb)) {
    ff(['-ss', String(item.thumbAt), '-i', video, '-frames:v', '1', '-q:v', '4',
      '-vf', vertical ? 'scale=405:-2' : 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360', thumb]);
  }
}

// Channel art, post images and story frames, cut from the encoded clips.
const stills = [
  ['av-loworbit', 'helene', 70, 'crop=ih:ih,scale=176:176'],
  ['av-solarcycle', 'sdo7', 30, 'crop=ih:ih,scale=176:176'],
  ['av-pad39', 'rollout', 20, 'crop=ih:ih,scale=176:176'],
  ['av-farlight', 'landing', 60, 'crop=ih:ih,scale=176:176'],
  ['bn-loworbit', 'idalia', 30, 'scale=1280:-2'],
  ['bn-solarcycle', 'arching', 50, 'scale=1280:-2'],
  ['bn-pad39', 'rollout', 115, 'scale=1280:-2'],
  ['bn-farlight', 'landing', 75, 'scale=1280:-2'],
  ['post-pad39', 'rollout', 55, 'scale=640:-2'],
  ['post-solarcycle', 'sunspot', 60, 'scale=640:-2'],
  ['post-loworbit', 'erin', 70, 'scale=640:-2'],
  ['st-pad39-1', 's-sunset', 10, 'scale=405:-2'],
  ['st-pad39-2', 's-booster', 6, 'scale=405:-2'],
  ['st-loworbit-1', 's-eye', 12, 'scale=405:-2'],
  ['st-solarcycle-1', 's-sunspot', 14, 'scale=405:-2'],
];
for (const [name, id, at, vf] of stills) {
  const dest = join(out, 'img', `${name}.jpg`);
  if (force || !existsSync(dest)) ff(['-ss', String(at), '-i', join(out, 'v', `${id}.mp4`), '-frames:v', '1', '-q:v', '3', '-vf', vf, dest]);
}

// Write measured durations so the UI never shows a length that doesn't match the file.
const durations = Object.fromEntries(catalog.map((c) => {
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(out, 'v', `${c.id}.mp4`)]).toString();
  return [c.id, Math.round(parseFloat(s))];
}));
writeFileSync(join(root, 'data', 'durations.json'), JSON.stringify(durations, null, 1) + '\n');
console.log('done');

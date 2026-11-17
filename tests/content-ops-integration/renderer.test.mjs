import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerHooks } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJob, getJob, updateJob, failJob } from '../../services/video-renderer/src/jobs.mjs';
import { writeDataUrl, concatVideos } from '../../services/video-renderer/src/media.mjs';
import { splitScriptForAvatar, distributeSubtitles } from '../../services/video-renderer/src/script.mjs';

const exec = promisify(execFile);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=';

test('renderer jobs expose running, progress, successful result, and actionable failure', () => {
  const job = createJob('local');
  assert.equal(getJob(job.id).state, 'running');
  updateJob(job.id, { step: 1, totalSteps: 2, stage: 'Fixture processing' });
  assert.equal(getJob(job.id).stage, 'Fixture processing');
  updateJob(job.id, { state: 'done', result: { fileName: 'fixture.mp4', durationSec: 1 } });
  assert.equal(getJob(job.id).result.fileName, 'fixture.mp4');
  const failed = createJob('product');
  failJob(failed.id, new Error('Fixture provider unavailable'), { fixture: true });
  assert.equal(getJob(failed.id).state, 'error');
  assert.equal(getJob(failed.id).error, 'Fixture provider unavailable');
  assert.equal(getJob('missing-fixture'), null);
});

test('renderer segmentation preserves content and subtitle duration boundaries', () => {
  const script = '第一句话说明问题。第二句话给出方法。第三句话提醒检查。';
  assert.equal(splitScriptForAvatar(script, 3).join(''), script);
  const subtitles = distributeSubtitles(script, 9);
  assert.equal(subtitles.map((item) => item.text).join(''), script);
  assert.ok(subtitles.every((item) => item.durationSec > 0));
  assert.ok(Math.abs(subtitles.reduce((sum, item) => sum + item.durationSec, 0) - 9) < 0.001);
});

test('all four pipelines persist fixture media with mock TTS/providers/rendering and real disk/ffmpeg', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'content-ops-renderer-'));
  const dirs = { audioDir: path.join(temp, 'audio'), assetDir: path.join(temp, 'assets'), outDir: path.join(temp, 'out') };
  await Promise.all(Object.values(dirs).map((dir) => mkdir(dir)));
  const fixtureVideo = path.join(temp, 'fixture.mp4');
  const fixtureAudio = path.join(temp, 'fixture.mp3');
  await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x240:r=10', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', fixtureVideo]);
  await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '1', '-c:a', 'libmp3lame', fixtureAudio]);
  globalThis.__fixtureAudio = fixtureAudio;
  const hook = registerHooks({
    load(url, context, nextLoad) {
      if (url.endsWith('/services/video-renderer/src/tts.mjs')) return {
        format: 'module', shortCircuit: true,
        source: `import { copyFile } from 'node:fs/promises'; export { probeDurationSec } from './tts.mjs?fixture-probe'; export async function synthesizeToFile({outPath}) { await copyFile(globalThis.__fixtureAudio, outPath); return {durationSec: 1}; }`,
      };
      if (url.endsWith('/services/video-renderer/src/providers/bailian.mjs')) return {
        format: 'module', shortCircuit: true,
        source: `export const S2V_MAX_AUDIO_SEC=19; export const S2V_MODEL='fixture'; export function assertConfigured() {} export async function uploadToTemporaryStorage() { return 'fixture://upload'; } export async function createAvatarTask() { return 'fixture-task'; } export async function createImageToVideoTask() { return 'fixture-task'; } export async function waitForTask({onTick}) { onTick?.('RUNNING'); return {videoUrl:'fixture://video'}; }`,
      };
      return nextLoad(url, context);
    },
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'fixture://video');
    return new Response(await readFile(fixtureVideo));
  });
  try {
    const { runLocalPipeline } = await import('../../services/video-renderer/src/localPipeline.mjs');
    const { runAvatarPipeline } = await import('../../services/video-renderer/src/avatarPipeline.mjs');
    const { runHybridPipeline } = await import('../../services/video-renderer/src/hybridPipeline.mjs');
    const { runProductPipeline } = await import('../../services/video-renderer/src/productPipeline.mjs');
    const renderProps = [];
    const renderClipReel = async ({ outPath, props }) => {
      renderProps.push(props);
      await copyFile(fixtureVideo, outPath);
    };
    const shared = { ...dirs, publicUrl: 'http://127.0.0.1:3199', script: '先讲问题。再讲办法。', image: png, images: [png], renderClipReel };
    const outputs = [];
    for (const [kind, pipeline, extra] of [
      ['local', runLocalPipeline, {}], ['avatar', runAvatarPipeline, {}],
      ['hybrid', runHybridPipeline, { openingSec: 5, sceneImages: [png] }], ['product', runProductPipeline, { provider: 'bailian' }],
    ]) {
      const job = createJob(kind);
      const result = await pipeline({ ...shared, ...extra, job });
      assert.equal(result.segments >= 1, true);
      const file = path.join(dirs.outDir, result.fileName);
      const info = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file])).stdout);
      assert.ok(info.streams.some((stream) => stream.codec_type === 'video'));
      assert.ok(Number(info.format.duration) >= 1);
      outputs.push({ kind, fileName: result.fileName, bytes: (await readFile(file)).length, probe: info });
    }
    assert.equal(renderProps.length, 3);
    assert.equal(renderProps[0].slides[0].type, 'image');
    assert.equal(renderProps[1].slides[0].type, 'video');
    assert.ok(renderProps[1].slides[0].durationSec > 0);
    const media = await writeDataUrl(png, dirs.assetDir, 'fixture-check');
    assert.deepEqual((await readFile(media.filePath)).subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
    const concatenated = path.join(dirs.outDir, 'concatenated.mp4');
    await concatVideos([fixtureVideo, fixtureVideo], concatenated, dirs.outDir);
    const duration = Number((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', concatenated])).stdout.trim());
    assert.ok(duration >= 2 && duration < 2.5);
    await mkdir('artifacts/content-ops-integration', { recursive: true });
    await writeFile('artifacts/content-ops-integration/renderer-fixture-results.json', JSON.stringify({ boundary: 'TTS/providers/Remotion mocked; real local disk and ffmpeg', outputs, concatenatedDurationSec: duration }, null, 2));
    await copyFile(concatenated, 'artifacts/content-ops-integration/renderer-fixture.mp4');
  } finally {
    hook.deregister();
    delete globalThis.__fixtureAudio;
    await rm(temp, { recursive: true, force: true });
  }
});

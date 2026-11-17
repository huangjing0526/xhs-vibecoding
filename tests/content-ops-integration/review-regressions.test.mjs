import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { GET as queryJob } from '@/app/api/video/jobs/[id]/route';
import { POST as generateVideo } from '@/app/api/video/generate/route';
import { POST as collectProfile } from '@/app/api/blogger/profile/route';
import { POST as saveBlogger } from '@/app/api/blogger/save/route';
import { GET as listBloggers } from '@/app/api/bloggers/route';
import { startVideoJobPolling } from '@/lib/videoJobPolling';
import { rendererRequestAuth } from '../../services/video-renderer/src/requestAuth.mjs';
import { splitScriptForHybrid, estimateDurationSec, splitScriptForAvatar } from '../../services/video-renderer/src/script.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const requireRenderer = createRequire(path.join(root, 'services/video-renderer/package.json'));
const exec = promisify(execFile);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const jsonRequest = (url, body) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });
const unwrap = async (response) => { const payload = await response.json(); assert.equal(payload.code, 0, payload.message); return payload.data; };

// Execute actual component callbacks to verify completion and state contracts.
function sourceNode(file, select) {
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = (node) => { if (!found && select(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(source);
  assert.ok(found, `Runtime closure not found in ${file}`);
  return found;
}
function execute(node, scope) {
  const code = ts.transpileModule(`const closure = ${node.getText()};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(scope), `${code}; return closure;`)(...Object.values(scope));
}
function callback(file, name, scope) {
  const node = sourceNode(file, (n) => ts.isVariableDeclaration(n) && n.name.getText() === name);
  const expression = node.initializer;
  return execute(ts.isCallExpression(expression) ? expression.arguments[0] : expression, scope);
}
async function poll({ query, onJob, onPause }) {
  return startVideoJobPolling({ jobId: 'tracked-job', query, onJob, onPause, intervalMs: 5000 });
}

test('review: polling pauses on query failure without inventing a generation failure', async () => {
  const updates = [], pauses = [];
  const stop = await poll({ query: async () => { throw new Error('temporary offline'); }, onJob: (job) => updates.push(job), onPause: (error) => pauses.push(error) });
  await flush();
  stop();
  assert.deepEqual(updates, [], 'A failed query must not mutate the generation job');
  assert.equal(pauses[0]?.message, 'temporary offline');
});

test('review: polling never overlaps and cleanup aborts its pending query', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const pending = deferred();
  let calls = 0, signal;
  const updates = [];
  const stop = await poll({ query: async (_id, s) => { calls++; signal = s; return pending.promise; }, onJob: (job) => updates.push(job), onPause: assert.fail });
  t.mock.timers.tick(20000);
  assert.equal(calls, 1);
  stop();
  pending.resolve({ id: 'tracked-job', state: 'done' });
  await flush();
  assert.equal(signal?.aborted, true, 'Cleanup must abort the network request');
  assert.deepEqual(updates, []);
  t.mock.timers.tick(20000);
  assert.equal(calls, 1);
});

test('review: query resume uses the same job and stops after a terminal result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const ids = [], pauses = [], updates = [];
  let stop = await poll({ query: async (id) => { ids.push(id); throw new Error('offline'); }, onJob: (job) => updates.push(job), onPause: (error) => pauses.push(error) });
  await flush();
  stop();
  stop = await poll({ query: async (id) => { ids.push(id); return { id, state: 'done' }; }, onJob: (job) => updates.push(job), onPause: assert.fail });
  await flush();
  t.mock.timers.tick(20000);
  await flush();
  stop();
  assert.deepEqual(ids, ['tracked-job', 'tracked-job']);
  assert.equal(updates[0].state, 'done');
});

test('review: cleanup triggered by a job update cannot schedule another query', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const pending = deferred();
  let calls = 0, stop;
  stop = await poll({ query: async () => { calls++; return pending.promise; }, onJob: () => stop(), onPause: assert.fail });
  pending.resolve({ id: 'tracked-job', state: 'running' });
  await flush();
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(calls, 1);
});

test('review: selecting the current mode is a no-op and an active task survives mode changes', () => {
  for (const running of [false, true]) {
    const changes = [];
    const switchMode = callback('components/workflow/VideoGenerationStudio.tsx', 'switchMode', {
      running, mode: 'local', setMode: (value) => changes.push(['mode', value]),
      setJob: (value) => changes.push(['job', value]), setJobId: (value) => changes.push(['id', value]),
    });
    switchMode('local');
    assert.deepEqual(changes, []);
    if (running) { switchMode('avatar'); assert.deepEqual(changes, []); }
  }
});

test('review: users can explicitly stop tracking a lost task without resubmitting it', () => {
  const changes = [], notices = [];
  const stopTracking = callback('components/workflow/VideoGenerationStudio.tsx', 'stopTracking', {
    setJobId: (value) => changes.push(['id', value]),
    setJob: (value) => changes.push(['job', value]),
    setPollingError: (value) => changes.push(['error', value]),
    toast: { info: (message) => notices.push(message) },
  });
  stopTracking();
  assert.deepEqual(changes, [['id', null], ['job', null], ['error', null]]);
  assert.match(notices[0], /不会取消后台任务/);
});

test('review: a matching attacker Host and Origin cannot authorize generation', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ jobId: 'unexpected' }); });
  const response = await generateVideo(new NextRequest('http://127.0.0.1:5397/api/video/generate', {
    method: 'POST', headers: { Origin: 'http://attacker.invalid:5397', Host: 'attacker.invalid:5397' },
    body: JSON.stringify({ mode: 'avatar', script: 'Fixture', image: 'data:image/png;base64,AA==' }),
  }));
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test('review: completed job media is mapped to a local app URL, never the renderer or arbitrary origin', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'fixture', state: 'done', result: { fileName: 'fixture.mp4', videoUrl: 'https://untrusted.invalid/out/other.mp4' } }));
  const data = await unwrap(await queryJob(new NextRequest('http://localhost/api/video/jobs/fixture'), { params: Promise.resolve({ id: 'fixture' }) }));
  assert.equal(data.result.videoUrl, '/api/video/media/fixture.mp4');
});

test('review: generation proxy rejects cross-site callers before using its service credential', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ jobId: 'unexpected' }); });
  const response = await generateVideo(new NextRequest('http://localhost/api/video/generate', {
    method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'text/plain' },
    body: JSON.stringify({ mode: 'avatar', script: 'Fixture', image: 'data:image/png;base64,AA==' }),
  }));
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test('review: generation accepts explicitly trusted browser origins when Next uses an internal bind URL', async (t) => {
  const previous = process.env.VIDEO_WORKBENCH_ALLOWED_ORIGINS;
  process.env.VIDEO_WORKBENCH_ALLOWED_ORIGINS = 'http://192.0.2.20:5397,https://workbench.example.invalid';
  t.after(() => { if (previous === undefined) delete process.env.VIDEO_WORKBENCH_ALLOWED_ORIGINS; else process.env.VIDEO_WORKBENCH_ALLOWED_ORIGINS = previous; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ jobId: 'fixture' }); });
  for (const [origin, host, forwardedProto] of [
    ['http://127.0.0.1:5397', '127.0.0.1:5397', 'http'],
    ['http://localhost:5397', 'localhost:5397', 'http'],
    ['http://192.0.2.20:5397', '192.0.2.20:5397', 'http'],
    ['https://workbench.example.invalid', 'workbench.example.invalid', 'https'],
  ]) {
    const response = await generateVideo(new NextRequest('http://127.0.0.1:5397/api/video/generate', {
      method: 'POST', headers: { Origin: origin, Host: host, 'X-Forwarded-Proto': forwardedProto },
      body: JSON.stringify({ mode: 'local', script: 'Fixture', images: ['data:image/png;base64,AA=='] }),
    }));
    assert.equal(response.status, 200, origin);
  }
  assert.equal(calls, 4);
});

test('review: generation and query app proxies send the configured service credential', async (t) => {
  const previous = process.env.VIDEO_RENDERER_SERVICE_TOKEN;
  process.env.VIDEO_RENDERER_SERVICE_TOKEN = 'fixture-review-token';
  t.after(() => { if (previous === undefined) delete process.env.VIDEO_RENDERER_SERVICE_TOKEN; else process.env.VIDEO_RENDERER_SERVICE_TOKEN = previous; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls.push(new Headers(options.headers).get('Authorization'));
    return calls.length === 1 ? Response.json({ jobId: 'fixture' }) : Response.json({ id: 'fixture', state: 'error', error: 'fixture provider error', result: null });
  });
  await unwrap(await generateVideo(jsonRequest('/api/video/generate', { mode: 'avatar', script: 'Fixture', image: 'data:image/png;base64,AA==' })));
  const job = await unwrap(await queryJob(new NextRequest('http://localhost/api/video/jobs/fixture'), { params: Promise.resolve({ id: 'fixture' }) }));
  assert.equal(job.state, 'error');
  assert.equal(job.error, 'fixture provider error');
  assert.deepEqual(calls, ['Bearer fixture-review-token', 'Bearer fixture-review-token']);
});

test('review: media proxy rejects traversal and forwards upstream range/status/type/body', async (t) => {
  const { GET } = await import('@/app/api/video/media/[filename]/route');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 1-3/9', 'Accept-Ranges': 'bytes', 'Content-Length': '3' } });
  });
  for (const filename of ['../secret.mp4', '..\\secret.mp4', '%2e%2e%2fsecret.mp4', '/tmp/file.mp4', 'https://evil.invalid/a.mp4', 'a.mp4?x=1', 'a\0.mp4']) {
    const result = await GET(new NextRequest('http://localhost/api/video/media/x'), { params: Promise.resolve({ filename }) });
    assert.equal(result.status, 400, filename);
  }
  assert.equal(calls.length, 0);
  const result = await GET(new NextRequest('http://localhost/api/video/media/fixture.mp4', { headers: { Range: 'bytes=1-3' } }), { params: Promise.resolve({ filename: 'fixture.mp4' }) });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('Content-Type'), 'video/mp4');
  assert.equal(result.headers.get('Content-Range'), 'bytes 1-3/9');
  assert.equal(result.headers.get('Content-Length'), '3');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3]);
  assert.match(calls[0].url, /^http:\/\/localhost:8787\/out\/fixture.mp4$/);
  assert.equal(new Headers(calls[0].options.headers).get('Range'), 'bytes=1-3');
  assert.equal(calls[0].options.redirect, 'error');
  for (const status of [404, 416]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status, headers: { 'Content-Range': 'bytes */9' } }));
    const failure = await GET(new NextRequest('http://localhost/api/video/media/fixture.mp4'), { params: Promise.resolve({ filename: 'fixture.mp4' }) });
    assert.equal(failure.status, status);
    if (status === 416) assert.equal(failure.headers.get('Content-Range'), 'bytes */9');
  }
  const fixture = readFileSync(path.join(root, 'artifacts/content-ops-integration/renderer-fixture.mp4'));
  t.mock.method(globalThis, 'fetch', async () => new Response(fixture, { headers: { 'Content-Type': 'video/mp4' } }));
  const complete = await GET(new NextRequest('http://localhost/api/video/media/fixture.mp4'), { params: Promise.resolve({ filename: 'fixture.mp4' }) });
  const output = Buffer.from(await complete.arrayBuffer());
  assert.deepEqual(output, fixture);
  const saved = path.resolve('artifacts/content-ops-integration/review-proxied-fixture.mp4');
  writeFileSync(saved, output);
  const info = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', saved])).stdout);
  assert.ok(info.streams.some((stream) => stream.codec_type === 'video'));
  assert.ok(Number(info.format.duration) >= 2);
});

test('review: renderer middleware authenticates paid calls and rejects browser cross-origin costly requests', async () => {
  const express = requireRenderer('express'), cors = requireRenderer('cors');
  const authFactory = () => rendererRequestAuth({ token: 'fixture-service-token' });
  const source = ts.createSourceFile('server.mjs', readFileSync(path.join(root, 'services/video-renderer/src/server.mjs'), 'utf8'), ts.ScriptTarget.Latest, true);
  const setup = source.statements.filter((n) => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText() === 'app.use');
  const stack = [];
  new Function('app', 'express', 'cors', 'rendererRequestAuth', 'OUT_DIR', 'AUDIO_DIR', 'ASSET_DIR', setup.map((n) => n.getText()).join('\n'))({ use(fn) { if (typeof fn === 'function') stack.push(fn); } }, express, cors, authFactory, '/unused', '/unused', '/unused');
  const request = (route, headers = {}) => {
    const req = { path: route, method: 'POST', headers, get(name) { return this.headers[name.toLowerCase()]; } };
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json() {}, setHeader() {}, getHeader() {} };
    let index = 0;
    const next = () => { if (index < stack.length) stack[index++](req, res, next); };
    next();
    return res.statusCode;
  };
  for (const route of ['/avatar', '/product']) {
    assert.equal(request(route), 401);
    assert.equal(request(route, { authorization: 'Bearer invalid' }), 401);
    assert.equal(request(route, { authorization: 'Bearer fixture-service-token' }), 200);
  }
  for (const route of ['/avatar', '/product', '/local', '/tts', '/render', '/extract']) {
    assert.equal(request(route, { origin: 'https://untrusted.invalid', authorization: 'Bearer fixture-service-token' }), 403);
  }
  assert.equal(request('/tts'), 200);
  assert.equal(request('/render'), 200);
  assert.equal(request('/Avatar/'), 401);
  assert.equal(request('/tts', { 'sec-fetch-site': 'cross-site' }), 403);
  assert.equal(request('/local', { origin: 'http://127.0.0.1:8787', host: '127.0.0.1:8787' }), 200);
});

test('review: renderer paid endpoints fail closed without configured authentication', () => {
  const middleware = rendererRequestAuth({ token: '' });
  for (const path of ['/avatar', '/product']) {
    let status;
    middleware({ path, method: 'POST', headers: {}, get: () => undefined }, { status: (s) => { status = s; return { json() {} }; } }, () => assert.fail('Paid route allowed without configuration'));
    assert.equal(status, 503);
  }
});

test('review: a long first sentence respects the selected opening budget without losing content', () => {
  const script = '开场这句话很长'.repeat(14) + '。再讲具体办法。';
  for (const seconds of [5, 10, 15]) {
    const { opening, rest } = splitScriptForHybrid(script, seconds);
    assert.equal(opening + rest, script);
    assert.ok(estimateDurationSec(opening) <= seconds, `${seconds}s opening estimated at ${estimateDurationSec(opening)}s`);
    assert.ok(Array.from(opening).length <= Math.floor(seconds * 4.5));
  }
  assert.equal(splitScriptForAvatar(script, 19).join(''), script, 'Full-speaking segmentation is unchanged');
});

test('review: actual opening file duration is checked even if TTS metadata underestimates it', async () => {
  const script = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { mkdtemp, mkdir, rm } from 'node:fs/promises';
    import {execFile} from 'node:child_process'; import {promisify} from 'node:util';
    import os from 'node:os'; import path from 'node:path';
    globalThis.paidCalls = 0;
    registerHooks({ load(url, context, nextLoad) {
      if (url.endsWith('/tts.mjs')) return {format:'module',shortCircuit:true,source:\`import {copyFile} from 'node:fs/promises'; export {probeDurationSec} from './tts.mjs?actual-probe'; export async function synthesizeToFile({outPath}) { await copyFile(globalThis.fixtureAudio,outPath); return {durationSec:1}; }\`};
      if (url.endsWith('/providers/bailian.mjs')) return {format:'module',shortCircuit:true,source:\`export const S2V_MAX_AUDIO_SEC=19; export const S2V_MODEL='fixture'; export function assertConfigured(){} export async function uploadToTemporaryStorage(){globalThis.paidCalls++; throw new Error('PAID_PROVIDER_CALLED');} export async function createAvatarTask(){globalThis.paidCalls++;} export async function waitForTask(){}\`};
      return nextLoad(url, context);
    }});
    const {runHybridPipeline} = await import('./services/video-renderer/src/hybridPipeline.mjs');
    const {createJob} = await import('./services/video-renderer/src/jobs.mjs');
    const temp = await mkdtemp(path.join(os.tmpdir(),'review-opening-'));
    try {
      const dirs={audioDir:path.join(temp,'audio'),assetDir:path.join(temp,'assets'),outDir:path.join(temp,'out')};
      await Promise.all(Object.values(dirs).map(dir=>mkdir(dir)));
      globalThis.fixtureAudio=path.join(temp,'six-seconds.mp3');
      await promisify(execFile)('ffmpeg',['-y','-f','lavfi','-i','anullsrc=r=24000:cl=mono','-t','6','-c:a','libmp3lame',globalThis.fixtureAudio]);
      await assert.rejects(runHybridPipeline({...dirs,job:createJob('avatar'),script:'开场。其余内容。',openingSec:5,image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII='}), /开场.*6\\..*5/);
      assert.equal(globalThis.paidCalls,0);
      process.env.FFPROBE_BIN=path.join(temp,'missing-ffprobe');
      await assert.rejects(runHybridPipeline({...dirs,job:createJob('avatar'),script:'开场。',openingSec:5}), /无法测量.*尚未提交付费/);
      assert.equal(globalThis.paidCalls,0);
    } finally {await rm(temp,{recursive:true,force:true});}
  `;
  await exec(process.execPath, ['--input-type=module', '-e', script], { cwd: root });
});

test('review: integration runner bootstraps evidence when the artifact directory is absent', { skip: Boolean(process.env.CONTENT_OPS_REVIEW_RUNNER_CHILD) }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'review-runner-'));
  try {
    for (const name of ['app', 'components', 'lib', 'services', 'tests', 'scripts', 'node_modules']) await symlink(path.join(root, name), path.join(temp, name));
    await exec(process.execPath, [path.join(root, 'scripts/test-content-ops-integration.mjs')], { cwd: temp, env: { ...process.env, CONTENT_OPS_REVIEW_RUNNER_CHILD: '1' }, maxBuffer: 4 * 1024 * 1024 });
    assert.ok(existsSync(path.join(temp, 'artifacts/content-ops-integration/persisted-fixture.json')));
    assert.ok(existsSync(path.join(temp, 'artifacts/content-ops-integration/renderer-fixture.mp4')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('review: unknown nickname survives collect-save-list and malformed empty records stay hidden', async (t) => {
  const keys = { FEISHU_APP_ID: 'fixture', FEISHU_APP_SECRET: 'fixture', FEISHU_BASE_APP_TOKEN: 'fixture', FEISHU_BLOGGER_TABLE_ID: 'review-bloggers', FEISHU_BLOGGER_NOTE_TABLE_ID: 'review-notes' };
  const previous = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  Object.assign(process.env, keys);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const records = [{ record_id: 'empty-record', fields: {} }, { record_id: 'null-fields', fields: null }];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/profile') return Response.json({ profile: { creatorId: 'unknown-nickname', name: '', homeUrl: 'https://www.tiktok.com/@unknown-nickname' } });
    if (parsed.pathname.includes('tenant_access_token')) return Response.json({ code: 0, tenant_access_token: 'fixture', expire: 7200 });
    if (parsed.pathname.endsWith('/search')) return Response.json({ code: 0, data: { items: parsed.pathname.includes('review-bloggers') ? records : [], has_more: false } });
    if (parsed.pathname.endsWith('/batch_create')) { records.push(...JSON.parse(options.body).records.map((record) => ({ record_id: 'saved-fixture', ...record }))); return Response.json({ code: 0, data: { records: [] } }); }
    assert.fail(`Unexpected fixture endpoint: ${parsed.pathname}`);
  });
  const { profile } = await unwrap(await collectProfile(jsonRequest('/api/blogger/profile', { platform: 'tiktok', homeUrl: 'https://www.tiktok.com/@unknown-nickname' })));
  assert.equal(profile.name, '');
  await unwrap(await saveBlogger(jsonRequest('/api/blogger/save', { profile })));
  const listed = await unwrap(await listBloggers());
  assert.equal(listed.profiles.length, 1);
  assert.equal(listed.profiles[0].id, profile.id);
  assert.equal(listed.profiles[0].name, '', 'Display fallbacks must not become stored nicknames');
  const display = execute(sourceNode('components/workflow/BloggerResearch.tsx', (n) => ts.isFunctionDeclaration(n) && n.name?.text === 'bloggerDisplayName'), {});
  assert.equal(display(listed.profiles[0]), profile.id);
  assert.equal(display({ name: '', id: '', homepageUrl: 'https://example.invalid/account' }), 'https://example.invalid/account');
});

test('review: shared adoption callback awaits persistence and exposes failure to callers', async () => {
  for (const fails of [false, true]) {
    const pending = deferred(), notices = [], templates = [];
    const adopt = callback('components/workflow/WorkflowDashboard.tsx', 'adoptDistillation', {
      setBloggerDistillation() {}, saveDaokuTemplate: () => pending.promise,
      setDaokuTemplates: (update) => templates.push(update([])), setNotice: (notice) => notices.push(notice), setArea() {},
    });
    const saved = adopt({ id: 'fixture-dao', sourceLabel: 'Fixture' });
    assert.equal(typeof saved?.then, 'function', 'Callers need the real persistence Promise');
    let completed = false;
    const result = Promise.resolve(saved).then(() => { completed = true; });
    await flush();
    assert.equal(completed, false);
    assert.equal(notices.length, 0);
    if (fails) {
      pending.reject(new Error('fixture disk failure'));
      await assert.rejects(result, /fixture disk failure/);
      assert.equal(templates.length, 0);
      assert.equal(notices.some((notice) => notice.type === 'success'), false);
    } else {
      pending.resolve();
      await result;
      assert.equal(templates[0][0].id, 'fixture-dao');
      assert.equal(notices[0].type, 'success');
    }
  }
});

test('review: blogger adoption caller handles persistence rejection and keeps the result in session', async () => {
  const errors = [], busy = [], notices = [];
  const distillation = { id: 'fixture-dao', sourceLabel: 'Fixture' };
  const handleDistill = callback('components/workflow/BloggerResearch.tsx', 'handleDistill', {
    selectedProfile: { id: 'fixture' }, visibleSamples: [], distilling: false,
    setDistilling: (value) => busy.push(value),
    distillBlogger: async () => ({ distillation, usedFallback: true }),
    onDistillationChange: async () => { throw new Error('save failed'); },
    onNotice: (notice) => notices.push(notice), onError: (action, error) => errors.push({ action, message: error.message }),
  });
  await handleDistill();
  assert.deepEqual(busy, [true, false]);
  assert.deepEqual(errors, [{ action: 'daoku.distill', message: 'save failed' }]);
  assert.deepEqual(notices, []);
});

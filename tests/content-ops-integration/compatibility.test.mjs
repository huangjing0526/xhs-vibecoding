import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBloggerSample, mapBloggerSampleToFeishuFields } from '@/lib/bloggerFeishu';

// A collected sample must not lose engagement data when saved through the desktop store.
test('collected sample roundtrip preserves unknown views and explicit zero engagement', () => {
  const sample = {
    id: 'fixture-note', bloggerId: 'fixture-blogger', title: 'Fixture', content: 'Body', tags: ['#test'],
    metrics: { likes: 0, saves: 12, comments: 3, shares: 0 },
  };
  const fields = mapBloggerSampleToFeishuFields(sample);
  const restored = normalizeBloggerSample({ record_id: 'rec-fixture', fields });
  assert.equal(restored.metrics.views, undefined);
  assert.equal(restored.metrics.likes, 0);
  assert.equal(restored.metrics.saves, 12);
  assert.equal(restored.metrics.shares, 0);
  assert.equal(restored.id, sample.id);
});

import { apiError } from '@/app/api/feishu/_utils';
import { UserFacingError } from '@/lib/errors';
import { detectVideoPlatform } from '@/lib/videoExtract';

test('template input errors preserve a recoverable API contract', async () => {
  const response = apiError(new UserFacingError('请选择模板'), 'fixture.template', 'Failure');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 400, data: null, message: '请选择模板' });
});

test('collector and extractor recognize the same TikTok platform', () => {
  assert.equal(detectVideoPlatform('https://www.tiktok.com/@fixture/video/123'), 'tiktok');
});

import { mapBloggerProfileToFeishuFields } from '@/lib/blogger';
import { POST as generateVideo } from '@/app/api/video/generate/route';
import { GET as queryJob } from '@/app/api/video/jobs/[id]/route';
import { NextRequest } from 'next/server';

const videoRequest = () => new NextRequest('http://localhost/api/video/generate', {
  method: 'POST', body: JSON.stringify({ mode: 'local', script: 'Fixture narration', images: ['data:image/png;base64,AA=='] }),
});

test('collection never clears positioning or unknown profile fields', () => {
  const fields = mapBloggerProfileToFeishuFields({
    id: 'fixture', name: '', platform: '小红书', positioning: '', bio: '', status: '待采集',
  });
  assert.equal(Object.hasOwn(fields, '定位'), false);
  assert.equal(Object.hasOwn(fields, '昵称'), false);
  assert.equal(Object.hasOwn(fields, '简介'), false);
});

test('HTTP 200 HTML from the renderer is a generation failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>gateway</html>'));
  const response = await generateVideo(videoRequest());
  const payload = await response.json();
  assert.notEqual(payload.code, 0);
  assert.match(payload.message, /JSON|响应/);
});

test('HTTP 200 HTML from the renderer is a polling failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>gateway</html>'));
  const response = await queryJob(new NextRequest('http://localhost/api/video/jobs/fixture'), { params: Promise.resolve({ id: 'fixture' }) });
  assert.notEqual((await response.json()).code, 0);
});

test('unavailable renderer gives a setup instruction instead of bare fetch failed', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  const response = await generateVideo(videoRequest());
  const payload = await response.json();
  assert.notEqual(payload.code, 0);
  assert.match(payload.message, /services\/video-renderer/);
});

import { upsertFeishuRecords } from '@/lib/feishu';

test('one collection batch upserts repeated note identities once with the latest value', async (t) => {
  const keys = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_BASE_APP_TOKEN', 'FEISHU_BLOGGER_NOTE_TABLE_ID'];
  for (const key of keys) process.env[key] = 'fixture';
  t.after(() => { for (const key of keys) delete process.env[key]; });
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('tenant_access_token')) return Response.json({ code: 0, tenant_access_token: 'fixture', expire: 7200 });
    if (new URL(String(url)).pathname.endsWith('/search')) return Response.json({ code: 0, data: { items: [], has_more: false } });
    writes.push(JSON.parse(options.body));
    return Response.json({ code: 0, data: { records: [] } });
  });
  const result = await upsertFeishuRecords('bloggerNote', '笔记ID', [
    { key: 'same', fields: { '笔记ID': 'same', '标题': 'first' } },
    { key: 'same', fields: { '笔记ID': 'same', '标题': 'last' } },
  ]);
  assert.deepEqual(result, { created: 1, updated: 0 });
  assert.deepEqual(writes, [{ records: [{ fields: { '笔记ID': 'same', '标题': 'last' } }] }]);
});

import { mapVideoExtractToFeishuFields, normalizeVideoExtractRecord } from '@/lib/videoExtractHistory';
import { toVideoExtractRecord } from '@/lib/videoExtract';

const fixtureExtract = {
  video: { platform: 'tiktok', sourceUrl: 'https://www.tiktok.com/@fixture/video/123?share=1', title: 'Fixture video', desc: 'Description', author: 'Fixture', durationSec: 5,
    videoUrl: 'http://localhost:8787/out/temporary.mp4', coverUrl: '', transcript: 'First line\nSecond line', transcriptNote: '' },
  analysis: { hook: 'Hook', structure: [{ stage: 'Opening', purpose: 'Explain', text: 'First line\nSecond line｜with separator' }], style: 'Plain', reusableTemplate: 'Own example', painPoint: 'Pain' },
  viral: { viralityScore: 0, reason: 'No metrics' }, usedFallback: true, provider: 'mock',
};

test('extract history preserves multiline structure and stores source identity without temporary media', () => {
  const record = toVideoExtractRecord(fixtureExtract, '2026-11-17 12:00');
  const fields = mapVideoExtractToFeishuFields(record);
  const restored = normalizeVideoExtractRecord({ record_id: 'fixture-history', fields });
  assert.equal(restored.extractId, 'tiktok-123');
  assert.equal(JSON.stringify(fields).includes('temporary.mp4'), false);
  assert.deepEqual(restored.analysis, fixtureExtract.analysis);
});

test('existing readable history rows stay compatible', () => {
  const record = normalizeVideoExtractRecord({ record_id: 'legacy', fields: {
    '平台': '抖音', '分段结构': '开场｜吸引｜第一句｜补充\n人工编辑的句子',
  } });
  assert.equal(record.platform, 'douyin');
  assert.deepEqual(record.analysis.structure, [
    { stage: '开场', purpose: '吸引', text: '第一句｜补充' },
    { stage: '', purpose: '', text: '人工编辑的句子' },
  ]);
});

test('upsert preserves existing record identity and chunks large collections without imposing a collection limit', async (t) => {
  const keys = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_BASE_APP_TOKEN', 'FEISHU_BLOGGER_NOTE_TABLE_ID'];
  for (const key of keys) process.env[key] = 'fixture';
  t.after(() => { for (const key of keys) delete process.env[key]; });
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('tenant_access_token')) return Response.json({ code: 0, tenant_access_token: 'fixture', expire: 7200 });
    if (new URL(String(url)).pathname.endsWith('/search')) return Response.json({ code: 0, data: { items: [{ record_id: 'rec-existing', fields: { '笔记ID': 'existing' } }], has_more: false } });
    writes.push({ url: String(url), records: JSON.parse(options.body).records });
    return Response.json({ code: 0, data: {} });
  });
  const result = await upsertFeishuRecords('bloggerNote', '笔记ID', [
    { key: 'existing', fields: { '笔记ID': 'existing', '标题': 'updated' } },
    ...Array.from({ length: 1001 }, (_, i) => ({ key: `new-${i}`, fields: { '笔记ID': `new-${i}` } })),
  ]);
  assert.deepEqual(result, { created: 1001, updated: 1 });
  const update = writes.find((call) => call.url.endsWith('/batch_update'));
  assert.equal(update.records[0].record_id, 'rec-existing');
  assert.deepEqual(writes.filter((call) => call.url.endsWith('/batch_create')).map((call) => call.records.length), [1000, 1]);
});

test('renderer success without a job identity is not reported as submitted', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(null));
  const response = await generateVideo(videoRequest());
  assert.notEqual((await response.json()).code, 0);
});

test('renderer polling payload without a state is an actionable failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'fixture' }));
  const response = await queryJob(new NextRequest('http://localhost/api/video/jobs/fixture'), { params: Promise.resolve({ id: 'fixture' }) });
  assert.notEqual((await response.json()).code, 0);
});

test('a failed generation job remains a successful status query with its original business error', async (t) => {
  const job = { id: 'fixture', kind: 'product', state: 'error', stage: '失败', step: 1, totalSteps: 2, result: null, error: 'Fixture provider unavailable' };
  t.mock.method(globalThis, 'fetch', async () => Response.json(job));
  const response = await queryJob(new NextRequest('http://localhost/api/video/jobs/fixture'), { params: Promise.resolve({ id: 'fixture' }) });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.code, 0);
  assert.deepEqual(payload.data, job);
});

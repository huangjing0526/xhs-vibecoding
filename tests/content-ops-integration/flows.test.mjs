import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { TEMPLATE_PACKS } from '@/lib/templates/registry';
import * as desktopTemplates from '@/lib/templates';
import { AREAS, TOOL_AREAS, RAIL_AREAS } from '@/lib/capabilities';
import { DEMO_BLOGGER_DISTILLATIONS, DAOKU_BASE_SLOTS } from '@/lib/bloggerWorkflow';
import { toDesktopDistillation } from '@/lib/integration/blogger';
import { POST as generateTemplate } from '@/app/api/templates/generate/route';
import { GET as listTemplates } from '@/app/api/templates/route';
import { collectNotes } from '@/lib/collector';
import { mapBloggerNoteToFeishuFields, normalizeBloggerNote } from '@/lib/blogger';
import { getNoteAssets, saveNoteAssets } from '@/lib/workflowClient';
import { POST as createVideo } from '@/app/api/video/generate/route';
import { GET as queryJob } from '@/app/api/video/jobs/[id]/route';
import { mergeServerOwned } from '@/lib/videoFactory/ownership';
import { buildPublishPack, createPublishPackZip } from '@/lib/publishPack';
import { DEMO_SNAPSHOT } from '@/lib/demoWorkflow';
import { planNoteStatsUpsert } from '@/lib/noteStats.mjs';

const jsonRequest = (url, data, method = 'POST') => new NextRequest(`http://localhost${url}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
const unwrap = async (response) => {
  const payload = await response.json();
  assert.equal(payload.code, 0, payload.message);
  return payload.data;
};

test('studio recipes and desktop image/rhythm/daoku templates coexist through distinct tool IDs', async () => {
  const studio = await unwrap(await listTemplates());
  assert.ok(studio.packs[0].templates.length > 0);
  const dao = desktopTemplates.toDaokuTemplateCard(DEMO_BLOGGER_DISTILLATIONS[0]);
  assert.equal(desktopTemplates.templateTarget(dao), 'projects');
  assert.deepEqual(dao.slots, DEMO_BLOGGER_DISTILLATIONS[0].slots.map((slot) => slot.label));
  assert.ok(TOOL_AREAS.includes('templateStudio'));
  assert.ok(TOOL_AREAS.includes('videoGenerate'));
  assert.ok(RAIL_AREAS.includes('templates'));
  assert.equal(AREAS.templates.category, undefined);
  assert.ok(TOOL_AREAS.includes('images') && TOOL_AREAS.includes('videoFactory'));
});

test('all migrated canvas recipes generate meaningful plans with the shared mock engine', async () => {
  for (const template of TEMPLATE_PACKS.flatMap((pack) => pack.templates)) {
    const data = await unwrap(await generateTemplate(jsonRequest('/api/templates/generate', {
      templateId: template.id, values: { title: '集成测试工作流', content: '整理素材\n填写选题\n检查成稿', coreViewpoint: '按步骤完成交付' },
    })));
    assert.equal(data.templateId, template.id);
    assert.equal(data.usedFallback, true);
    assert.equal(data.provider, 'mock');
    assert.equal(data.output.kind, 'canvas-plan');
    assert.equal(data.output.plan.templateType, template.engineConfig.templateType);
    assert.ok(JSON.stringify(data.output.plan).includes('集成测试工作流'));
  }
  const invalid = await generateTemplate(jsonRequest('/api/templates/generate', { templateId: 'unknown', values: {} }));
  assert.equal(invalid.status, 400);
  const missing = await generateTemplate(jsonRequest('/api/templates/generate', { templateId: TEMPLATE_PACKS[0].templates[0].id, values: {} }));
  assert.equal(missing.status, 400);
});

test('collector payload survives shared desktop storage mapping without inventing unavailable metrics', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(String(url)).pathname, '/notes');
    assert.deepEqual(JSON.parse(options.body), { platform: 'tiktok', homeUrl: 'https://www.tiktok.com/@fixture', limit: 2 });
    return Response.json({ profile: { creatorId: 'fixture', name: 'Fixture', followers: 0 }, notes: [
      { noteId: 'fixture-1', title: 'Collected title', content: 'Collected content', url: 'https://example.invalid/fixture', metrics: { likes: 0, saves: 4, views: null } },
    ] });
  });
  const { profile, notes } = await collectNotes('tiktok', 'https://www.tiktok.com/@fixture', 2);
  assert.equal(profile.platform, 'TikTok');
  assert.equal(profile.followers, 0);
  assert.equal(notes[0].bloggerId, profile.id);
  const fields = mapBloggerNoteToFeishuFields(notes[0]);
  const restored = normalizeBloggerNote({ record_id: 'fixture-record', fields });
  assert.equal(restored.id, 'fixture-1');
  assert.equal(restored.metrics.likes, 0);
  assert.equal(restored.metrics.views, undefined);
  assert.equal(restored.metrics.saves, 4);
  assert.equal(Object.hasOwn(fields, '核心道'), false);
});

test('generation and polling preserve upstream job identity and meaningful failures', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([String(url), options?.body && JSON.parse(options.body)]);
    return calls.length === 1
      ? Response.json({ jobId: 'local-fixture', kind: 'local', state: 'running' })
      : Response.json({ id: 'local-fixture', kind: 'local', state: 'done', result: { fileName: 'fixture.mp4', videoUrl: 'http://localhost/out/fixture.mp4' } });
  });
  const body = { mode: 'local', script: 'Fixture script', images: ['data:image/png;base64,AA=='] };
  const created = await unwrap(await createVideo(jsonRequest('/api/video/generate', body)));
  assert.equal(created.jobId, 'local-fixture');
  assert.deepEqual(calls[0][1], body);
  assert.ok(calls[0][0].endsWith('/local'));
  const completed = await unwrap(await queryJob(new NextRequest('http://localhost/api/video/jobs/local-fixture'), { params: Promise.resolve({ id: created.jobId }) }));
  assert.equal(completed.state, 'done');
  assert.equal(completed.result.fileName, 'fixture.mp4');
  assert.ok(calls[1][0].endsWith('/jobs/local-fixture'));
});

test('mainline media ownership, publication bundle, and stats updates remain intact', async () => {
  const existing = { clips: [{ shotOrder: 1, fileName: 'saved.mp4' }], voiceovers: [{ order: 1 }], finalCut: { durationSec: 12 }, approvedFrameHashes: ['hash'], castBinding: { model: { name: 'Saved model' } }, storyboard: { shots: [{ order: 1, material: { id: 'saved-image' } }] } };
  const merged = mergeServerOwned({ clips: [], finalCut: null, storyboard: { shots: [{ order: 1 }] } }, existing, {});
  assert.deepEqual(merged.clips, existing.clips);
  assert.deepEqual(merged.finalCut, existing.finalCut);
  assert.deepEqual(merged.storyboard.shots[0].material, existing.storyboard.shots[0].material);
  const reset = mergeServerOwned({}, existing, { reset: true });
  assert.deepEqual(reset.clips, []);
  assert.deepEqual(reset.approvedFrameHashes, []);
  const draft = DEMO_SNAPSHOT.drafts[0];
  const pack = buildPublishPack(draft, DEMO_SNAPSHOT.topics.find((topic) => topic.topicId === draft.topicId), { coverDataUrl: '', contentImageDataUrl: '' });
  assert.ok(pack.fullText.includes(draft.title));
  const zip = new Uint8Array(await createPublishPackZip(pack).arrayBuffer());
  assert.deepEqual([...zip.slice(0, 4)], [80, 75, 3, 4]);
  const plan = planNoteStatsUpsert([{ recordId: 'rec-existing', noteId: 'same', title: 'Fixture' }], [{ noteId: 'same', title: 'Fixture', fields: { '阅读量': 22 } }]);
  assert.equal(plan.creates.length, 0);
  assert.deepEqual(plan.updates[0], { recordId: 'rec-existing', item: { noteId: 'same', title: 'Fixture', fields: { '阅读量': 22 } }, fields: { '阅读量': 22 } });
});

test('mobile shared API roundtrip persists both plans, and legacy daoku retains desktop slots', async (t) => {
  const originalCwd = process.cwd();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'content-ops-integration-'));
  process.chdir(temp);
  try {
    const assetsRoute = await import('@/app/api/notes/assets/route');
    const daokuRoute = await import('@/app/api/daoku/route');
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      const request = new NextRequest(new URL(String(url), 'http://localhost'), options);
      return options.method === 'PUT' ? assetsRoute.PUT(request) : assetsRoute.GET(request);
    });
    await saveNoteAssets('fixture-note', { contentImagePlan: { title: 'Fixture image', templateType: 'checklist' } });
    await saveNoteAssets('fixture-note', { videoPlan: { title: 'Fixture video', voiceover: 'Narration' } });
    const assets = await getNoteAssets('fixture-note');
    assert.equal(assets.contentImagePlan.title, 'Fixture image');
    assert.equal(assets.videoPlan.voiceover, 'Narration');
    const stored = JSON.parse(await readFile(path.join(temp, '.local/notes/fixture-note.json'), 'utf8'));
    assert.deepEqual(stored, assets);
    const legacy = { ...DEMO_BLOGGER_DISTILLATIONS[0] };
    delete legacy.slots; delete legacy.sourceLabel; delete legacy.createdAt;
    const distillation = toDesktopDistillation(legacy, { id: legacy.bloggerId, name: 'Fixture blogger' });
    await unwrap(await daokuRoute.POST(jsonRequest('/api/daoku', distillation)));
    const list = await unwrap(await daokuRoute.GET());
    assert.deepEqual(list.distillations[0].slots, DAOKU_BASE_SLOTS);
    assert.equal(list.distillations[0].sourceLabel, 'Fixture blogger');
    const custom = toDesktopDistillation(DEMO_BLOGGER_DISTILLATIONS[0], { id: legacy.bloggerId, name: 'Fixture blogger' });
    assert.deepEqual(custom.slots, DEMO_BLOGGER_DISTILLATIONS[0].slots);
    const evidenceDir = path.join(originalCwd, 'artifacts/content-ops-integration');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'persisted-fixture.json'), JSON.stringify({ assets: stored, distillation: list.distillations[0] }, null, 2));
  } finally {
    process.chdir(originalCwd);
    await rm(temp, { recursive: true, force: true });
  }
});

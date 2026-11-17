import { registerHooks } from 'node:module';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Never inherit live provider or source credentials into fixture tests.
for (const key of Object.keys(process.env)) {
  if (/^(FEISHU_|GEMINI_|OPENAI_|ANTHROPIC_|CUSTOM_|SHARED_|SILICONFLOW_|DASHSCOPE_|WORKFLOW_AI_PROVIDER|VIDEO_RENDERER_|VIDEO_EXTRACTOR_URL|BLOGGER_COLLECTOR_URL)/.test(key)) delete process.env[key];
}
const root = process.cwd();
mkdirSync(path.join(root, 'artifacts/content-ops-integration'), { recursive: true });
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate;
    if (specifier.startsWith('@/')) candidate = path.join(root, specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate) {
      const resolved = [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}/index.ts`]
        .find((name) => existsSync(name) && statSync(name).isFile());
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    if (specifier === 'next/server') specifier = 'next/server.js';
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
        fileName: fileURLToPath(url),
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

await import('../tests/content-ops-integration/compatibility.test.mjs');
await import('../tests/content-ops-integration/flows.test.mjs');
await import('../tests/content-ops-integration/renderer.test.mjs');
await import('../tests/content-ops-integration/review-regressions.test.mjs');

// pnpm ext:build — bundles the extension into extension/dist (load that folder unpacked).
// APP_ORIGIN sets the one web origin the extension trusts (host permission and
// externally_connectable). Default is the local dev server.
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:1420');
if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
  throw new Error('APP_ORIGIN must be an http(s) origin, for example https://app.example.com');
}
const appOrigin = origin.origin;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: ['background', 'options', 'popup'].map((n) => join(root, 'src', `${n}.ts`)),
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  define: { __APP_ORIGIN__: JSON.stringify(appOrigin) },
  logLevel: 'info',
});

for (const f of ['options.html', 'popup.html', 'ui.css']) {
  await copyFile(join(root, 'src', f), join(out, f));
}
const manifest = (await readFile(join(root, 'manifest.template.json'), 'utf8')).replaceAll(
  '__APP_ORIGIN__',
  appOrigin,
);
await writeFile(join(out, 'manifest.json'), manifest);
console.log(`Built extension for ${appOrigin} -> extension/dist`);

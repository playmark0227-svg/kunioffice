const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

async function fixture(t) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'kuni-static-build-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const { PUBLIC_FILES, buildStaticSite } = await import('../scripts/build-static.mjs');
  const publicAssets = [
    'css/style.css', 'js/main.js', 'images/logo.png',
    'admin/css/admin.css', 'admin/js/app/admin.js', 'admin/js/data/github.js',
    'admin/js/editor/editor.js', 'admin/js/ui/panels.js',
    'manual/img/example.png', 'wakaba/css/wakaba.css', 'wakaba/js/store.js',
    'wakaba/images/logo.png', 'wakaba/media/movie.mp4',
  ];
  const privateFiles = [
    '.env', '.env.production', '.git/config', '.github/workflows/pages.yml',
    'README.md', 'STRIPE_SETUP.md', 'package.json', 'server.js',
    'server/src/app.js', 'docs/backend.md', 'tests/check.js', 'scripts/task.mjs',
    'node_modules/dependency/index.js', 'wakaba/README.md',
    'admin/js/.env', 'admin/js/.env.js', 'admin/js/README.md',
    'admin/js/server/index.js', 'admin/js/node_modules/dependency/index.js',
  ];
  for (const relative of [...PUBLIC_FILES, ...publicAssets, ...privateFiles]) {
    const absolute = path.join(rootDir, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `fixture:${relative}`);
  }
  return { rootDir, PUBLIC_FILES, publicAssets, privateFiles, buildStaticSite };
}

async function listFiles(rootDir, prefix = '') {
  const results = [];
  for (const entry of await readdir(path.join(rootDir, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...await listFiles(rootDir, relative));
    else results.push(relative);
  }
  return results.sort();
}

test('build preserves every declared public URL and asset while excluding development files', async (t) => {
  const { rootDir, PUBLIC_FILES, publicAssets, privateFiles, buildStaticSite } = await fixture(t);
  const { outputDir, fileCount } = await buildStaticSite({ rootDir });
  const expected = [...PUBLIC_FILES, ...publicAssets, '.nojekyll'].sort();
  assert.deepEqual(await listFiles(outputDir), expected);
  assert.equal(fileCount, expected.length);
  for (const relative of [...PUBLIC_FILES, ...publicAssets]) {
    assert.equal(await readFile(path.join(outputDir, relative), 'utf8'), `fixture:${relative}`);
  }
  for (const relative of privateFiles) {
    await assert.rejects(readFile(path.join(outputDir, relative)), { code: 'ENOENT' });
  }
});

test('rebuild removes stale output only inside the fixed dist directory', async (t) => {
  const { rootDir, buildStaticSite } = await fixture(t);
  await mkdir(path.join(rootDir, 'dist'));
  await writeFile(path.join(rootDir, 'dist/stale.txt'), 'old output');
  await writeFile(path.join(rootDir, 'keep.txt'), 'keep project file');
  await buildStaticSite({ rootDir });
  await assert.rejects(readFile(path.join(rootDir, 'dist/stale.txt')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(rootDir, 'keep.txt'), 'utf8'), 'keep project file');
});

test('rejects arbitrary output paths without deleting existing files', async (t) => {
  const { rootDir, buildStaticSite } = await fixture(t);
  await writeFile(path.join(rootDir, 'keep.txt'), 'keep project file');
  for (const outputDir of [rootDir, '..', '/', path.join(rootDir, '../outside')]) {
    await assert.rejects(buildStaticSite({ rootDir, outputDir }), /output path is fixed to dist/);
  }
  assert.equal(await readFile(path.join(rootDir, 'keep.txt'), 'utf8'), 'keep project file');
});

test('rejects public file symlinks before replacing an existing build', async (t) => {
  const { rootDir, buildStaticSite } = await fixture(t);
  await mkdir(path.join(rootDir, 'dist'));
  await writeFile(path.join(rootDir, 'dist/keep.txt'), 'old build');
  await symlink(path.join(rootDir, '.env'), path.join(rootDir, 'admin/js/linked.js'));
  await assert.rejects(buildStaticSite({ rootDir }), /Symbolic links are not allowed/);
  assert.equal(await readFile(path.join(rootDir, 'dist/keep.txt'), 'utf8'), 'old build');
});

test('rejects a symlink in a nested public parent directory', async (t) => {
  const { rootDir, buildStaticSite } = await fixture(t);
  await rm(path.join(rootDir, 'admin'), { recursive: true });
  await symlink(path.join(rootDir, 'wakaba'), path.join(rootDir, 'admin'), 'dir');
  await assert.rejects(buildStaticSite({ rootDir }), /Symbolic links are not allowed/);
});

test('rejects output directory and output child symlinks without touching their target', async (t) => {
  const { rootDir, buildStaticSite } = await fixture(t);
  await mkdir(path.join(rootDir, 'outside'));
  await writeFile(path.join(rootDir, 'outside/keep.txt'), 'external file');
  await symlink(path.join(rootDir, 'outside'), path.join(rootDir, 'dist'), 'dir');
  await assert.rejects(buildStaticSite({ rootDir }), /Symbolic links are not allowed/);
  await rm(path.join(rootDir, 'dist'));
  await mkdir(path.join(rootDir, 'dist'));
  await symlink(path.join(rootDir, 'outside'), path.join(rootDir, 'dist/linked'), 'dir');
  await assert.rejects(buildStaticSite({ rootDir }), /Symbolic links are not allowed/);
  assert.equal(await readFile(path.join(rootDir, 'outside/keep.txt'), 'utf8'), 'external file');
});

test('missing declared public files fail before removing a previous build', async (t) => {
  const { rootDir, buildStaticSite } = await fixture(t);
  await mkdir(path.join(rootDir, 'dist'));
  await writeFile(path.join(rootDir, 'dist/keep.txt'), 'old build');
  await rm(path.join(rootDir, 'services.html'));
  await assert.rejects(buildStaticSite({ rootDir }), /Missing public path: services.html/);
  assert.equal(await readFile(path.join(rootDir, 'dist/keep.txt'), 'utf8'), 'old build');
});

import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Keep public URLs unchanged. Add new public pages explicitly here.
export const PUBLIC_FILES = Object.freeze([
  'index.html',
  'company.html',
  'services.html',
  'works.html',
  'contact.html',
  'shop.html',
  'success.html',
  'admin/index.html',
  'admin/setup.html',
  'admin/apple-touch-icon.png',
  'manual/index.html',
  'wakaba/index.html',
  'wakaba/cart.html',
  'wakaba/checkout.html',
  'wakaba/thanks.html',
  'wakaba/guide.html',
  'wakaba/privacy.html',
  'wakaba/tokushoho.html',
]);

const IMAGE_EXTENSIONS = ['.avif', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'];
const STYLE_EXTENSIONS = ['.css', '.woff', '.woff2', '.ttf', '.otf'];
const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.json'];

// Only these asset trees are public; server/, docs/, tests/, and scripts/ are not.
const PUBLIC_DIRECTORIES = Object.freeze([
  ['css', STYLE_EXTENSIONS],
  ['js', SCRIPT_EXTENSIONS],
  ['images', IMAGE_EXTENSIONS],
  ['admin/css', STYLE_EXTENSIONS],
  ['admin/js', SCRIPT_EXTENSIONS],
  ['manual/img', IMAGE_EXTENSIONS],
  ['wakaba/css', STYLE_EXTENSIONS],
  ['wakaba/js', SCRIPT_EXTENSIONS],
  ['wakaba/images', IMAGE_EXTENSIONS],
  ['wakaba/media', [...IMAGE_EXTENSIONS, '.mp4', '.webm', '.mp3', '.ogg', '.wav']],
]);

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function inspect(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function rejectSymlink(stat, relative) {
  if (stat?.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${relative}`);
}

// Validate every segment, including parents of explicit nested public paths.
async function publicPath(root, relative, expectedType) {
  const segments = relative.split('/');
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    if (!isInside(root, current)) throw new Error(`Public path is outside the project: ${relative}`);
    const stat = await inspect(current);
    rejectSymlink(stat, relative);
    if (!stat) throw new Error(`Missing public path: ${relative}`);
    const isLast = index === segments.length - 1;
    if ((!isLast || expectedType === 'directory') && !stat.isDirectory()) {
      throw new Error(`Expected a public directory: ${relative}`);
    }
    if (isLast && expectedType === 'file' && !stat.isFile()) {
      throw new Error(`Expected a regular public file: ${relative}`);
    }
  }
  return current;
}

async function collectAssets(root, relative, extensions, files) {
  const absolute = await publicPath(root, relative, 'directory');
  const entries = await readdir(absolute, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const childRelative = `${relative}/${entry.name}`;
    const stat = await lstat(path.join(absolute, entry.name));
    rejectSymlink(stat, childRelative);
    // Hidden files, development directories, and documentation never enter dist/.
    if (entry.name.startsWith('.') || ['node_modules', 'server', 'docs', 'tests', 'scripts'].includes(entry.name)) continue;
    if (stat.isDirectory()) {
      await collectAssets(root, childRelative, extensions, files);
    } else if (stat.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
      files.add(childRelative);
    } else if (!stat.isFile()) {
      throw new Error(`Unsupported file type: ${childRelative}`);
    }
  }
}

async function validateOutputTree(absolute, label = 'dist') {
  const stat = await inspect(absolute);
  if (!stat) return;
  rejectSymlink(stat, label);
  if (!stat.isDirectory()) throw new Error(`Output must be a regular directory: ${label}`);
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const childPath = path.join(absolute, entry.name);
    const childLabel = `${label}/${entry.name}`;
    const childStat = await lstat(childPath);
    rejectSymlink(childStat, childLabel);
    if (childStat.isDirectory()) await validateOutputTree(childPath, childLabel);
    else if (!childStat.isFile()) throw new Error(`Unsupported output file type: ${childLabel}`);
  }
}

export async function buildStaticSite({ rootDir = PROJECT_ROOT, ...options } = {}) {
  if (Object.keys(options).length > 0) {
    throw new Error('The output path is fixed to dist/; build options other than rootDir are not supported.');
  }
  const requestedRoot = path.resolve(rootDir);
  const rootStat = await lstat(requestedRoot);
  rejectSymlink(rootStat, 'project root');
  if (!rootStat.isDirectory() || requestedRoot === path.parse(requestedRoot).root) {
    throw new Error('The project root must be a regular project directory.');
  }
  const root = await realpath(requestedRoot);
  const outputDir = path.resolve(root, 'dist');
  if (!isInside(root, outputDir) || path.dirname(outputDir) !== root || path.basename(outputDir) !== 'dist') {
    throw new Error('Refusing to remove an output path outside the project dist/ directory.');
  }

  // Complete validation before removing the previous build.
  const files = new Set();
  for (const relative of PUBLIC_FILES) {
    await publicPath(root, relative, 'file');
    files.add(relative);
  }
  for (const [relative, extensions] of PUBLIC_DIRECTORIES) {
    await collectAssets(root, relative, extensions, files);
  }
  await validateOutputTree(outputDir);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir);
  for (const relative of [...files].sort()) {
    const destination = path.join(outputDir, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relative), destination, constants.COPYFILE_EXCL);
  }
  await writeFile(path.join(outputDir, '.nojekyll'), '', { flag: 'wx' });
  return { outputDir, fileCount: files.size + 1 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/build-static.mjs (output is always dist/)');
    const result = await buildStaticSite();
    console.log(`Static site built in dist/ (${result.fileCount} files).`);
  } catch (error) {
    console.error(`Static build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

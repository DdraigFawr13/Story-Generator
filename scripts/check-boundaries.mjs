import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = {
  // Layers (REBOOT_PLAN §7.1). Engine data shapes live in engine; content is data only.
  engine: new Set(['engine']),
  content: new Set(['content', 'engine']),
  platform: new Set(['platform', 'engine']),
  app: new Set(['app', 'engine', 'content', 'platform']),
};
const pureLayers = new Set(['engine', 'content']);
const reactLayers = new Set(['app']);
const forbiddenCoreNames = new Set([
  'Date',
  'performance',
  'window',
  'document',
  'navigator',
  'fetch',
  'crypto',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'localStorage',
  'indexedDB',
  'globalThis',
  'process',
  'require',
  'eval',
  'Function',
  'Intl',
  'localeCompare',
  'random',
]);
// Safe math for determinism (REBOOT_PLAN §7.2): transcendental Math functions can differ
// between JS engines, so the new engine and content use lookup tables instead.
const safeMathLayers = new Set(['engine', 'content']);
const unsafeMathNames = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'pow',
  'log',
  'log1p',
  'log2',
  'log10',
  'cbrt',
  'hypot',
]);

export function checkModule(fileName, sourceText) {
  const layer = path.relative(path.join(root, 'src'), fileName).split(path.sep)[0];
  if (!allowed[layer]) return [`Unknown source layer: ${fileName}`];
  const errors = [];
  const source = parse(sourceText, {
    sourceType: 'module',
    sourceFilename: fileName,
    plugins: fileName.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
  });

  function checkImport(specifier) {
    if (specifier.type !== 'StringLiteral') {
      errors.push('Computed module imports are not allowed in production source.');
      return;
    }
    const name = specifier.value;
    if (!name.startsWith('.')) {
      if (!(reactLayers.has(layer) && (name === 'react' || name === 'react-dom/client'))) {
        errors.push(`${layer} cannot import external module ${name}.`);
      }
      return;
    }
    const target = path.resolve(path.dirname(fileName), name);
    const destination = path.relative(path.join(root, 'src'), target).split(path.sep)[0];
    if (!allowed[layer].has(destination))
      errors.push(`${layer} cannot import ${destination}: ${name}.`);
  }
  function visit(node) {
    if (
      ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) &&
      node.source
    ) {
      checkImport(node.source);
    }
    if (node.type === 'TSImportType') checkImport(node.argument ?? node.source);
    if (node.type === 'ImportExpression') checkImport(node.source);
    if (node.type === 'CallExpression' && node.callee.type === 'Import') {
      if (node.arguments[0]) checkImport(node.arguments[0]);
      else errors.push('Missing module specifier.');
    }
    if (pureLayers.has(layer) && node.type === 'Identifier' && forbiddenCoreNames.has(node.name)) {
      errors.push(`Simulation core cannot use ${node.name}.`);
    }
    if (
      pureLayers.has(layer) &&
      node.type === 'MemberExpression' &&
      node.computed &&
      node.property.type === 'StringLiteral' &&
      forbiddenCoreNames.has(node.property.value)
    ) {
      errors.push(`Simulation core cannot use ${node.property.value}.`);
    }
    if (
      safeMathLayers.has(layer) &&
      node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'Math'
    ) {
      const name = node.computed
        ? node.property.type === 'StringLiteral'
          ? node.property.value
          : null
        : node.property.name;
      if (name === null) errors.push('Computed Math access is not allowed in the engine.');
      else if (unsafeMathNames.has(name))
        errors.push(`Engine math must be deterministic: Math.${name} is not allowed.`);
    }
    if (safeMathLayers.has(layer) && node.type === 'BinaryExpression' && node.operator === '**') {
      errors.push('Engine math must be deterministic: ** is not allowed.');
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child))
        child.forEach((item) => {
          if (item?.type) visit(item);
        });
      else if (child && typeof child === 'object' && typeof child.type === 'string') visit(child);
    }
  }
  visit(source);
  return [...new Set(errors)];
}

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sources(name)));
    else if (/\.tsx?$/.test(name)) result.push(name);
  }
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const files = await sources(path.join(root, 'src'));
  const errors = [];
  for (const file of files) {
    errors.push(
      ...checkModule(file, await readFile(file, 'utf8')).map(
        (error) => `${path.relative(root, file)}: ${error}`,
      ),
    );
  }
  if (errors.length) {
    process.stderr.write(errors.join('\n') + '\n');
    process.exitCode = 1;
  } else
    process.stdout.write(`Import/runtime boundaries passed for ${files.length} source modules.\n`);
}

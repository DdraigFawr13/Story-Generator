#!/usr/bin/env node
// test-traps: warn about test traps the test-design skill describes. Warn-only: always exits 0.
// Usage, from the project root: node .claude/skills/test-design/scripts/test-traps.mjs
// Checks wait-async: an async function passed to waitForFunction, which Playwright doesn't await
// (the returned promise is truthy, so the wait ends at once). Comments and strings are skipped.
// Known limits (each can only miss a hit): template ${…} contents; a named async function passed by reference;
// a quote in a regex literal or JSX text, read as a string start; nested type arguments such as <Promise<boolean>>.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const TEST_DIRS = new Set(['tests', 'test', 'e2e', '__tests__']);
const EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const WAIT_ASYNC = /waitForFunction\s*(?:\?\.)?\s*(?:<[^<>()]*>)?\s*\(\s*async\b/g;
const MESSAGE = "waitForFunction doesn't await an async function; poll with page.evaluate (test-design: Waits)";

function listFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { files: [...new Set(out.split('\0').filter(Boolean))] };
  } catch (err) {
    return { skipped: err.code === 'ENOENT' ? 'git not found' : 'not a git repo' };
  }
}

export function isTestFile(file) {
  const parts = file.split('/');
  const base = parts[parts.length - 1];
  const dot = base.lastIndexOf('.');
  if (dot < 0 || !EXTS.has(base.slice(dot))) return false;
  if (/\.(test|spec)\./.test(base)) return true;
  return parts.slice(0, -1).some((p) => TEST_DIRS.has(p));
}

// Replace the contents of strings and comments with spaces, keeping every newline.
// An unterminated string or comment runs to the end of the file.
export function blankStringsAndComments(text) {
  const out = text.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    let end;
    if (c === '/' && next === '/') {
      end = text.indexOf('\n', i);
      if (end < 0) end = text.length;
    } else if (c === '/' && next === '*') {
      end = text.indexOf('*/', i + 2);
      end = end < 0 ? text.length : end + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      end = i + 1;
      while (end < text.length && text[end] !== c) end += text[end] === '\\' ? 2 : 1;
      end = Math.min(end + 1, text.length);
    } else {
      i++;
      continue;
    }
    blank(i, end);
    i = end;
  }
  return out.join('');
}

export function findWaitAsync(text) {
  const scanned = blankStringsAndComments(text.replace(/\r/g, ''));
  const lines = [];
  for (const m of scanned.matchAll(WAIT_ASYNC)) {
    let line = 1;
    for (let k = 0; k < m.index; k++) if (scanned[k] === '\n') line++;
    lines.push(line);
  }
  return lines;
}

function main() {
  const listed = listFiles();
  if (listed.skipped) {
    console.log(`warn test-traps: skipped (${listed.skipped})`);
    return;
  }
  const hits = [];
  for (const file of listed.files) {
    if (!isTestFile(file)) continue;
    let text;
    try {
      if (!fs.lstatSync(file).isFile()) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of findWaitAsync(text)) hits.push({ file, line });
  }
  hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  for (const h of hits) console.log(`warn test-traps wait-async ${h.file}:${h.line} ${MESSAGE}`);
  console.log(`test-traps: ${hits.length} warnings in ${new Set(hits.map((h) => h.file)).size} test files`);
}

try {
  main();
} catch (err) {
  console.log(`warn test-traps: skipped (${err.message})`);
}
process.exitCode = 0;

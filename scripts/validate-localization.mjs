#!/usr/bin/env node
/**
 * Deterministic localization guard.
 *
 * Catalog convention: src/lib/i18n/locales/{en,zh-CN}.json. Keys are dot-separated
 * semantic namespaces (for example, `settings.interfaceLanguage`). Catalogs must
 * have identical leaf keys and object/string shapes.
 *
 * This command validates catalog parity only. Runtime source-string auditing is
 * intentionally not automated because the application contains AI prompts,
 * persisted generation data, and display constants that require contextual review.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogsDirectory = path.join(root, 'src/lib/i18n/locales');
const locales = ['en', 'zh-CN'];
const sourceRoots = ['src', 'electron'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const han = /[\u3400-\u9fff\uf900-\ufaff]/u;
const errors = [];

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function walk(directory, predicate, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, predicate, files);
    else if (entry.isFile() && predicate(file)) files.push(file);
  }
  return files;
}

function flatten(value, prefix = '', result = new Map()) {
  if (typeof value === 'string') {
    result.set(prefix, 'string');
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Object.keys(value).length === 0) result.set(prefix, 'object');
    for (const key of Object.keys(value).sort()) flatten(value[key], prefix ? `${prefix}.${key}` : key, result);
  } else {
    result.set(prefix, Array.isArray(value) ? 'array' : typeof value);
  }
  return result;
}

function validateCatalogs() {
  const files = locales.map((locale) => path.join(catalogsDirectory, `${locale}.json`));
  const present = files.filter(fs.existsSync);
  if (present.length === 0) {
    console.log('Localization catalogs are not present yet; catalog and source checks are deferred.');
    return false;
  }
  for (const file of files) {
    if (!fs.existsSync(file)) errors.push(`Missing required catalog: ${relative(file)}`);
  }
  if (errors.length) return false;

  const catalogs = new Map();
  for (const [index, file] of files.entries()) {
    try {
      catalogs.set(locales[index], flatten(JSON.parse(fs.readFileSync(file, 'utf8'))));
    } catch (error) {
      errors.push(`Invalid JSON in ${relative(file)}: ${error.message}`);
    }
  }
  if (errors.length) return false;

  const [referenceLocale, comparisonLocale] = locales;
  const reference = catalogs.get(referenceLocale);
  const comparison = catalogs.get(comparisonLocale);
  const keys = new Set([...reference.keys(), ...comparison.keys()]);
  for (const key of [...keys].sort()) {
    if (!reference.has(key)) errors.push(`Catalog key missing from ${referenceLocale}: ${key}`);
    else if (!comparison.has(key)) errors.push(`Catalog key missing from ${comparisonLocale}: ${key}`);
    else if (reference.get(key) !== comparison.get(key)) errors.push(`Catalog value shape differs for ${key}: ${referenceLocale} is ${reference.get(key)}, ${comparisonLocale} is ${comparison.get(key)}`);
  }
  return true;
}

function isExemptFile(file) {
  const parts = relative(file).split('/');
  // Electron has a compact main-process catalog because native surfaces cannot load
  // renderer modules. Treat it exactly like the renderer JSON catalogs.
  return relative(file) === 'electron/i18n.ts'
    || parts.includes('locales') && parts.includes('i18n')
    || parts.some((part) => ['prompts', 'fixtures', 'examples'].includes(part))
    || /\.(test|spec)\.[^.]+$/.test(file);
}

// Finds quoted/template literals without treating comments as strings. This is a
// conservative detector: a reported literal must be moved to a catalog or marked.
function findChineseLiterals(source) {
  const literals = [];
  let index = 0;
  let line = 1;
  const advance = () => {
    if (source[index] === '\n') line += 1;
    index += 1;
  };
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      while (index < source.length && source[index] !== '\n') advance();
      continue;
    }
    if (source.startsWith('/*', index)) {
      advance(); advance();
      while (index < source.length && !source.startsWith('*/', index)) advance();
      if (index < source.length) { advance(); advance(); }
      continue;
    }
    const quote = source[index];
    if (!['\'', '"', '`'].includes(quote)) { advance(); continue; }
    const startLine = line;
    let value = '';
    advance();
    while (index < source.length) {
      if (source[index] === '\\') {
        value += source[index]; advance();
        if (index < source.length) { value += source[index]; advance(); }
        continue;
      }
      if (source[index] === quote) { advance(); break; }
      value += source[index]; advance();
    }
    if (han.test(value)) literals.push({ line: startLine, value: value.replace(/\s+/g, ' ').slice(0, 80) });
  }
  return literals;
}

function validateHardCodedChinese() {
  const files = sourceRoots.flatMap((directory) => walk(path.join(root, directory), (file) => sourceExtensions.has(path.extname(file))));
  for (const file of files) {
    if (isExemptFile(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);
    for (const literal of findChineseLiterals(source)) {
      const sourceLine = lines[literal.line - 1] ?? '';
      const isTranslationKey = /\bt\s*\(\s*["'`]/.test(sourceLine);
      if (!isTranslationKey) {
        errors.push(`${relative(file)}:${literal.line}: unapproved Chinese literal "${literal.value}"`);
      }
    }
  }
}

validateCatalogs();
if (errors.length) {
  console.error(`Localization validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Localization validation passed.');
}

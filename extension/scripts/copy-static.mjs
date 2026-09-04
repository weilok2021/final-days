// Copies the manifest, pages, styles and icons next to the compiled scripts.
// Run from the extension/ directory (npm does that for you).
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });
console.log('copied static/ into dist/');

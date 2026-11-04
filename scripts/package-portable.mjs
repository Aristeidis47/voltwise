import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package the Vite build as one offline document, runnable via file://.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '../VoltWise-Παράδοση');
let html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !style) throw new Error('Expected one Vite JS bundle and stylesheet');
const js = await readFile(resolve(root, 'dist', script[1].replace(/^\//, '')), 'utf8');
const css = await readFile(resolve(root, 'dist', style[1].replace(/^\//, '')), 'utf8');
html = html.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(style[0], () => `<style>${css}</style>`);
const icon = await readFile(resolve(root, 'dist/favicon.svg'));
html = html.replace('/favicon.svg', `data:image/svg+xml;base64,${icon.toString('base64')}`);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'VoltWise.html'), html);
await writeFile(resolve(output, 'ΔΙΑΒΑΣΕ-ΜΕ.txt'), `VoltWise — Διαδραστικό mockup mobile εφαρμογής\n\nΆνοιξε το VoltWise.html με διπλό κλικ σε Chrome ή Edge.\nΔεν απαιτούνται εγκατάσταση, Node.js, terminal ή σύνδεση στο Internet.\nΑν ανοίξει σε επεξεργαστή κειμένου: δεξί κλικ → Άνοιγμα με → Chrome ή Edge.\n\nΗ εφαρμογή προτείνει προγράμματα ρεύματος με βάση την κατανάλωση και τις προτιμήσεις του χρήστη και εξηγεί πότε αλλάζει η πρόταση.\nΌλοι οι πάροχοι και οι τιμές είναι φανταστικά εκπαιδευτικά δεδομένα.\nΠρόκειται για browser mockup, όχι εγκαταστάσιμη εφαρμογή Android/iOS ή Windows EXE.\nΗ ανανέωση της σελίδας ξεκινά νέα συνεδρία.\n\nΓια μεταφορά αρκεί το VoltWise.html. Ο πηγαίος κώδικας παραμένει στον φάκελο ΔΕΗ.\n`, 'utf8');
console.log(resolve(output, 'VoltWise.html'));

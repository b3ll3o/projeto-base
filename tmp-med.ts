import { canonicalMemoryDir, corpusOf, allSlugsOf } from './.tooling/scripts/ci/check-memory-dir-concordance.js';
import { readFileSync } from 'node:fs';

const derived = canonicalMemoryDir('.');
console.log('canonical ok:', derived.ok, '| dir:', (derived as any).dir ?? derived.error);
if (!derived.ok) process.exit(0);

const dir = (derived as any).dir;
const corpus = corpusOf(dir);
const allSlugs = allSlugsOf(dir);
console.log('corpus (arquivos medidos):', corpus.length);
console.log('slugs no corpus:', allSlugs.size);

const texto = readFileSync('.agents/runs/memory-triage.md', 'utf8');
const slugsLedger = new Set<string>();
for (const linha of texto.split('\n')) {
  const c = linha.split('|');
  if (c.length < 4) continue;
  const s = c[1]?.trim();
  if (!s || s === 'slug' || s.startsWith('-') || s.includes('disposição')) continue;
  slugsLedger.add(s);
}
console.log('slugs no ledger:', slugsLedger.size);

const fantasma: string[] = [];
const noCorpus: string[] = [];
for (const s of slugsLedger) {
  if (allSlugs.has(s)) continue;
  // o slug esta em algum arquivo do corpus pelo nome/filename?
  const porArquivo = corpus.find((a: string) => a.includes(s) || s.includes(a.replace(/\.md$/, '')));
  if (porArquivo) noCorpus.push(`${s}  (derivaria de ${porArquivo})`);
  else fantasma.push(s);
}
console.log('\n=== slugs do ledger que NAO casam com o corpus ===');
console.log('total:', slugsLedger.size - allSlugs.size);
console.log('\n-- com arquivo-similar no corpus (derivam do mesmo):', noCorpus.length, '--');
noCorpus.slice(0, 6).forEach((s) => console.log('   ', s));
console.log('\n-- sem nenhum par no corpus:', fantasma.length, '--');
fantasma.slice(0, 10).forEach((s) => console.log('   ', s));
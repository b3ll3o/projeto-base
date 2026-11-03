import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCiActionPinning, callSitesDeUses, refDe } from './check-ci-action-pinning';

const SHA = '11d5960a326750d5838078e36cf38b85af677262';

function repoCom(workflows: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'action-pinning-'));
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  for (const [nome, conteudo] of Object.entries(workflows)) {
    writeFileSync(join(root, '.github/workflows', nome), conteudo, 'utf-8');
  }
  return root;
}

describe('a leitura dos call-sites', () => {
  it('acha o `uses:` com o número da linha', () => {
    const sites = callSitesDeUses(
      ['jobs:', '  build:', '    steps:', '      - uses: actions/checkout@v4'].join('\n'),
      'ci.yml',
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]!.linha).toBe(4);
    expect(sites[0]!.uses).toBe('actions/checkout@v4');
  });

  it('o ref é o que vem depois do @', () => {
    expect(refDe('actions/checkout@v4')).toBe('v4');
    expect(refDe(`actions/checkout@${SHA}`)).toBe(SHA);
    expect(refDe('sem-arroba')).toBeNull();
  });
});

describe('o gate', () => {
  it('FALHA quando a action está por TAG', () => {
    // MEDIDO em 2026-11-03: as 21 actions do CI estavam por tag. Tag é
    // ponteiro mutável — quem controla a action move a tag.
    const root = repoCom({ 'ci.yml': '      - uses: actions/checkout@v4\n' });
    const r = checkCiActionPinning({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/NÃO está pinado por SHA/);
  });

  it('PASSA quando a action está por SHA', () => {
    const root = repoCom({ 'ci.yml': `      - uses: actions/checkout@${SHA} # v4\n` });
    const r = checkCiActionPinning({ repoRoot: root });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('ISENTA a action local (`uses: ./...`)', () => {
    const root = repoCom({ 'ci.yml': '      - uses: ./actions/local\n' });
    const r = checkCiActionPinning({ repoRoot: root });
    expect(r.ok).toBe(true);
  });

  it('FALHA quando o "SHA" não é hex de 40', () => {
    // Uma tag com 40 caracteres não passa: o gate olha a FORMA do ref.
    const root = repoCom({
      'ci.yml': '      - uses: actions/checkout@v4aaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
    });
    const r = checkCiActionPinning({ repoRoot: root });
    expect(r.ok).toBe(false);
  });

  it('FALHA quando o `uses:` não tem @ref', () => {
    const root = repoCom({ 'ci.yml': '      - uses: actions/checkout\n' });
    const r = checkCiActionPinning({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/sem @ref/);
  });

  it('sem a pasta de workflows, não há o que medir (não é erro)', () => {
    const root = mkdtempSync(join(tmpdir(), 'action-pinning-'));
    const r = checkCiActionPinning({ repoRoot: root });
    expect(r.ok).toBe(true);
    expect(r.advisories.join('\n')).toMatch(/ausente/);
  });
});

describe('o repo real', () => {
  it('todas as actions de terceiros estão pinadas por SHA', () => {
    const r = checkCiActionPinning({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('há pelo menos um call-site (o gate não pode passar por não medir nada)', () => {
    const r = checkCiActionPinning({ repoRoot: process.cwd() });
    expect(r.advisories.join('\n')).toMatch(/call-sites de action de terceiros verificados: [1-9]/);
  });
});

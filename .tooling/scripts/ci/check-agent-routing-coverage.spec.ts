import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkAgentRoutingCoverage,
  diffAgents,
  listAgents,
  referencedAgents,
} from './check-agent-routing-coverage';

describe('listAgents', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agent-routing-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('devolve [] para diretório inexistente', () => {
    expect(listAgents(join(tmp, 'nope'))).toEqual([]);
  });
  it('lista apenas .md e tira extensão', () => {
    mkdirSync(join(tmp, '.agents/agents'), { recursive: true });
    writeFileSync(join(tmp, '.agents/agents/alpha.md'), '# alpha');
    writeFileSync(join(tmp, '.agents/agents/beta.md'), '# beta');
    writeFileSync(join(tmp, '.agents/agents/.DS_Store'), 'junk');
    writeFileSync(join(tmp, '.agents/agents/config.json'), 'junk');
    expect(listAgents(join(tmp, '.agents/agents'))).toEqual(['alpha', 'beta']);
  });
});

describe('referencedAgents', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agent-routing-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('extrai agents de specialists: [a, b, c]', () => {
    const p = join(tmp, 'matrix.md');
    writeFileSync(p, 'specialists: [nestjs-specialist, security-auditor]\n');
    const { named } = referencedAgents(p);
    expect(named.has('nestjs-specialist')).toBe(true);
    expect(named.has('security-auditor')).toBe(true);
  });
  it('extrai agents de listas YAML `- nome`', () => {
    const p = join(tmp, 'matrix.md');
    writeFileSync(p, 'specialists:\n  - nestjs-specialist\n  - security-auditor\n');
    const { named } = referencedAgents(p);
    expect(named.has('nestjs-specialist')).toBe(true);
  });
  it('ignora tokens que não parecem agent', () => {
    const p = join(tmp, 'matrix.md');
    writeFileSync(p, 'specialists: [nestjs-specialist, $bad, 123]\n');
    const { named } = referencedAgents(p);
    expect([...named].sort()).toEqual(['nestjs-specialist']);
  });
  it('devolve set vazio para arquivo inexistente', () => {
    const { named, missing } = referencedAgents(join(tmp, 'nope.md'));
    expect(named.size).toBe(0);
    expect(missing).toEqual([]);
  });
});

describe('diffAgents', () => {
  it('orphans = reais não referidos', () => {
    expect(diffAgents(['a', 'b', 'c'], new Set(['a']))).toEqual({
      orphans: ['b', 'c'],
      ghosts: [],
    });
  });
  it('ghosts = referidos sem arquivo', () => {
    expect(diffAgents(['a'], new Set(['a', 'z']))).toEqual({
      orphans: [],
      ghosts: ['z'],
    });
  });
  it('paridade = ambos vazios', () => {
    expect(diffAgents(['a', 'b'], new Set(['a', 'b']))).toEqual({ orphans: [], ghosts: [] });
  });
});

describe('checkAgentRoutingCoverage (integração)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agent-routing-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function writeRel(rel: string, content: string) {
    const full = join(tmp, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  it('skipped quando .agents/agents/ ausente', async () => {
    writeRel('.agents/specs/conventions/specialist-routing.md', '# vazia\n');
    const r = await checkAgentRoutingCoverage({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
  });

  it('vermelho quando matriz ausente', async () => {
    writeRel('.agents/agents/alpha.md', '# alpha');
    const r = await checkAgentRoutingCoverage({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/matriz specialist-routing ausente/);
  });

  it('verde quando todos os agents estão referidos', async () => {
    writeRel('.agents/agents/nestjs-specialist.md', '# n');
    writeRel('.agents/agents/security-auditor.md', '# s');
    writeRel(
      '.agents/specs/conventions/specialist-routing.md',
      'specialists:\n  - nestjs-specialist\n  - security-auditor\n',
    );
    const r = await checkAgentRoutingCoverage({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('vermelho quando há agent órfão', async () => {
    writeRel('.agents/agents/nestjs-specialist.md', '# n');
    writeRel('.agents/agents/orphaned.md', '# o');
    writeRel(
      '.agents/specs/conventions/specialist-routing.md',
      'specialists:\n  - nestjs-specialist\n',
    );
    const r = await checkAgentRoutingCoverage({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/disco, sem roteamento/);
    expect(r.errors[0]).toMatch(/orphaned/);
  });

  it('vermelho quando há agent fantasma', async () => {
    writeRel('.agents/agents/nestjs-specialist.md', '# n');
    writeRel(
      '.agents/specs/conventions/specialist-routing.md',
      'specialists:\n  - nestjs-specialist\n  - ghost-agent\n',
    );
    const r = await checkAgentRoutingCoverage({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/fantasma/);
    expect(r.errors[0]).toMatch(/ghost-agent/);
  });
});

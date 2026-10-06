// .tooling/scripts/ci/check-agent-memory-drift.spec.ts
//
// pt-BR: Testes do check de DRIFT ENTRE AGENT E MEMÓRIA (issue #47).
//
// O defeito: `evolucao-agents.md` declara a obrigação — *"Agents DEVEM evoluir
// — após uso significativo, atualizar o agent **E sua memória**"*, com gatilho
// explícito *"Após execução significativa (mudança de comportamento)"*. É a
// classe 1 da própria tabela de guard: obrigação declarada em prosa, nenhum
// gate que a meça.
//
// O caso medido: `doc-sync.md` perdeu o Passo 4 "Reportar e Bloquear" → "Reportar",
// removeu `--auto-apply-minor=true` e ganhou o contrato report-only. A memória
// dele é intocada desde 2026-09-22, e
// `grep -ciE 'report-only|auto-apply-minor' .agents/memory/doc-sync.md` → 0.
//
// **Por que o gate distingue comportamento de path.** No mesmo commit, outros
// dois agents (`nestjs-specialist`, `stack-code-reviewer`) mudaram — mas só de
// path relativo (`../../../docs/adr/` → `../../docs/adr/`), delta comportamental
// ZERO. Um gate que não fizesse essa distinção acusaria os três, e o autor
// aprenderia a atualizar memória por ruído. Por isso o gate é testado nas
// funções puras (`hasBehaviorDelta`, `findDriftedAgents`), que são a lógica de
// verdade; o check completo é a casca de git em volta delas.
//
// Cobre:
// - linha de prosa alterada → delta comportamental
// - APENAS path relativo corrigido → NÃO é delta comportamental
// - par (agent com delta, memória intocada) → vermelho nomeando o agent
// - memória tocada no mesmo range → verde
// - agent sem arquivo de memória → erro nomeando o agent

import { describe, expect, it } from 'vitest';
import { hasBehaviorDelta, findDriftedAgents } from './check-agent-memory-drift.js';

describe('hasBehaviorDelta', () => {
  it('prosa alterada É delta comportamental', () => {
    const diff = [
      '-### Passo 4: Reportar e Bloquear',
      '+### Passo 4: Reportar',
      '-  --auto-apply-minor=true',
    ].join('\n');
    expect(hasBehaviorDelta(diff)).toBe(true);
  });

  it('APENAS path relativo corrigido NÃO é delta comportamental', () => {
    // O caso real medido na #47: `nestjs-specialist.md` e
    // `stack-code-reviewer.md` só corrigiram o número de `../` numa linha que
    // é pura referência de path. Delta zero.
    const diff = ['-`../../../docs/adr/`', '+`../../docs/adr/`'].join('\n');
    expect(hasBehaviorDelta(diff)).toBe(false);
  });

  it('path corrigido DENTRO de prosa igual NÃO é delta comportamental', () => {
    // Mesma frase dos dois lados, mudando só o path: a prosa é a mesma, logo
    // o comportamento é o mesmo. Se o gate acusasse isto, acusaria a correção
    // de path que a #47 mediu como delta zero.
    const diff = [
      '-Ver `../../../docs/adr/` para decisões.',
      '+Ver `../../docs/adr/` para decisões.',
    ].join('\n');
    expect(hasBehaviorDelta(diff)).toBe(false);
  });

  it('path E prosa NOVA juntos É delta comportamental', () => {
    const diff = ['-Ver `../../../docs/adr/`.', '+Ver `../../docs/adr/`. Bloqueia merge.'].join(
      '\n',
    );
    expect(hasBehaviorDelta(diff)).toBe(true);
  });

  it('mesma prosa com path corrigido NÃO é delta; prosa NOVA É', () => {
    // O par que calibra o regex de path contra o de prosa.
    const soPath = [
      '-Bloqueia merge. Ver `../../../docs/adr/`.',
      '+Bloqueia merge. Ver `../../docs/adr/`.',
    ].join('\n');
    const prosaNova = ['-Bloqueia merge.', '+Nao bloqueia merge. Ver `../../docs/adr/`.'].join(
      '\n',
    );
    expect(hasBehaviorDelta(soPath)).toBe(false);
    expect(hasBehaviorDelta(prosaNova)).toBe(true);
  });

  it('diff vazio NÃO é delta comportamental', () => {
    expect(hasBehaviorDelta('')).toBe(false);
  });

  it('só remoção de frontmatter YAML NÃO é delta comportamental', () => {
    const diff = [
      '-name: doc-sync',
      '+name: doc-sync-agent',
      '-description: x',
      '+description: y',
    ].join('\n');
    expect(hasBehaviorDelta(diff)).toBe(false);
  });
});

describe('findDriftedAgents', () => {
  it('agent com delta + memória intocada → ele é o drifted', () => {
    const drifted = findDriftedAgents({ 'doc-sync': true }, new Set());
    expect(drifted).toEqual(['doc-sync']);
  });

  it('mesmo agent COM memória tocada no range → não é drifted', () => {
    const drifted = findDriftedAgents({ 'doc-sync': true }, new Set(['doc-sync']));
    expect(drifted).toEqual([]);
  });

  it('só path alterado (delta false) + memória intocada → não é drifted', () => {
    const drifted = findDriftedAgents({ 'nestjs-specialist': false }, new Set());
    expect(drifted).toEqual([]);
  });

  it('agent com delta SEM arquivo de memória → é drifted (o default honesto)', () => {
    const drifted = findDriftedAgents({ 'agente-novo': true }, new Set());
    expect(drifted).toEqual(['agente-novo']);
  });

  it('vários agents → todos os drifted, em ordem estável', () => {
    const drifted = findDriftedAgents({ zeta: true, alpha: true, meio: false }, new Set());
    expect(drifted).toEqual(['alpha', 'zeta']);
  });
});

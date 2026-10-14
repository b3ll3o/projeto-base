// .tooling/scripts/ci/check-ci-local-scope.spec.ts
//
// pt-BR: Testes do gate que reconcilia o ESCOPO de `ci:local` — não se a task
// roda (isso é `check-ci-local-e2e`), e sim se todo pacote do workspace que a
// implementa está ao alcance dos `--filter`.
//
// MEDIDO 2026-10-13, o caso que motivou o gate: `ci:local` filtra
// `@projeto/api` e `@projeto/web`; `@projeto/shared-types` declara
// `typecheck: tsc --noEmit` e fica de fora. `turbo run ... --dry=json` lista 12
// tasks reais e nenhuma delas é `@projeto/shared-types#typecheck` — enquanto
// `pnpm typecheck` (sem filtro) roda. O script sai 0 e o push local "verifica
// tipos" sem verificar o pacote de tipos.

import { describe, it, expect } from 'vitest';
import { reconciliarEscopoCiLocal } from './check-ci-local-scope';

const PACOTES = [
  {
    name: '@projeto/api',
    dir: 'apps/api',
    scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' },
  },
  {
    name: '@projeto/web',
    dir: 'apps/web',
    scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' },
  },
  {
    name: '@projeto/shared-types',
    dir: 'packages/shared-types',
    scripts: { typecheck: 'tsc --noEmit' },
  },
];

/** O `ci:local` real: filtra api+web e roda o tooling à parte. */
const CI_LOCAL_CORRETO =
  'pnpm ci:preflight && pnpm turbo run lint typecheck test:unit --filter=@projeto/api ' +
  '--filter=@projeto/web --filter=@projeto/shared-types && pnpm tooling:test';

describe('check-ci-local-scope', () => {
  it('aceita um ci:local cujo filtro alcança todo pacote que implementa a task', () => {
    const r = reconciliarEscopoCiLocal({ ciLocal: CI_LOCAL_CORRETO, pacotes: PACOTES });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('acusa o pacote que implementa a task e nao esta no filtro — e nomeia qual task', () => {
    // O caso real: `@projeto/shared-types` implementa `typecheck` e os filtros
    // de `ci:local` eram só `@projeto/api` e `@projeto/web`.
    const ciLocal =
      'pnpm turbo run lint typecheck --filter=@projeto/api --filter=@projeto/web && pnpm tooling:test';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes: PACOTES });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/shared-types');
    // Sem isto, "acusa" e "acusa o pacote errado" passam no mesmo teste.
    expect(r.errors.join('\n')).toContain('typecheck');
  });

  it('nao acusa pacote que so DELEGA a task (o turbo run despachante)', () => {
    // O pacote raiz tem `"test:e2e": "turbo run test:e2e"`: é o agregador, não
    // uma suíte. Acusá-lo seria o guard contra o mecanismo que o protege.
    const pacotes = [
      ...PACOTES,
      { name: 'projeto-base', dir: '.', scripts: { 'test:unit': 'turbo run test:unit' } },
    ];
    const ciLocal =
      'pnpm turbo run test:unit --filter=@projeto/api --filter=@projeto/web ' +
      '--filter=@projeto/shared-types && pnpm tooling:test';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes });
    expect(r.errors.join('\n')).not.toContain('projeto-base');
  });

  it('nao acusa pacote que nao implementa nenhuma task do comando', () => {
    // `@projeto/shared-types` implementa `typecheck`; um comando que so roda
    // `lint` nao pode ser cobrado de cobrir o typecheck dele.
    const ciLocal =
      'pnpm turbo run lint --filter=@projeto/api --filter=@projeto/web && pnpm tooling:test';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes: PACOTES });
    expect(r.errors).toEqual([]);
  });

  it('filtro por glob vira advisory, nao erro — o alcance e indeterminado', () => {
    const ciLocal = 'pnpm turbo run lint typecheck --filter="@projeto/*" && pnpm tooling:test';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes: PACOTES });
    expect(r.errors).toEqual([]);
    expect(r.advisories.join('\n')).toContain('glob');
  });

  it('invocacao sem filtro nenhum vira advisory — o turbo cobre tudo, mas o gate nao mede', () => {
    const ciLocal = 'pnpm turbo run lint typecheck && pnpm tooling:test';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes: PACOTES });
    expect(r.errors).toEqual([]);
    expect(r.advisories.join('\n')).toMatch(/não tem nenhum --filter/);
  });

  it('acusa ci:local que nao roda a suite do tooling', () => {
    // O tooling nao implementa NENHUMA task turbo (roda vitest direto), entao a
    // checagem de filtro acima nunca o ve: a direcao que fecha e a de exigir o
    // `tooling:test` no comando.
    const ciLocal = 'pnpm turbo run lint typecheck --filter=@projeto/api --filter=@projeto/web';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes: PACOTES });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('tooling:test');
  });

  it('mede e devolve o que olhou — um gate que nao mediu nada nao pode dizer que passou', () => {
    const r = reconciliarEscopoCiLocal({ ciLocal: CI_LOCAL_CORRETO, pacotes: PACOTES });
    expect(r.medidos).toEqual({ invocacoes: 1, pacotesNoEscopo: 3, tarefaDoTooling: true });
  });

  it('ci:local ausente e erro nomeando o script, e medidos null (nao zero)', () => {
    const r = reconciliarEscopoCiLocal({ ciLocal: undefined, pacotes: PACOTES });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('ci:local');
    expect(r.medidos).toBeNull();
  });

  it('não trata "test:unit" como prefixo de "test:unit-foo"', () => {
    // `tasks.includes` casa item a item; o teste existe para travar o
    // `startsWith`, que diria que `lint` cobre `lint-staged`.
    const pacotes = [
      { name: '@outro/app', dir: 'apps/outro', scripts: { 'lint-staged': 'lint-staged' } },
    ];
    const ciLocal = 'pnpm turbo run lint --filter=@projeto/api && pnpm tooling:test';
    const r = reconciliarEscopoCiLocal({ ciLocal, pacotes });
    expect(r.errors).toEqual([]);
  });
});

// apps/web/estilizacao.spec.ts
//
// A regra que obriga o padrão de estilização.
//
// pt-BR: a regra é `estilizacao/no-estilizacao-informal`, em
// `packages/eslint-config/rules/no-estilizacao-informal.js`. O padrão que ela
// mede está em `.agents/specs/conventions/estilizacao.md`; os valores dos
// tokens, em `apps/web/app/globals.css`.
//
// Este spec tem DUAS metades, e as duas importam:
//
// 1. **Sintética** — o que a regra aceita e o que ela recusa, caso a caso.
// 2. **Diferencial contra o repo real** — a regra aplicada aos arquivos de
//    produção do app, com a config de produção do app. É a metade que prova
//    que a regra está LIGADA de verdade: uma regra que ninguém rodou é
//    indistinguishable de uma regra que não existe.
//
// ⚠️ A sintética usa o parser padrão do ESLint com `jsx: true` — o texto
//lintado é JS com JSX, não TSX, e por isso não precisa do parser do
// TypeScript. A diferencial usa a config REAL do app (que tem o parser TS).

import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import regra from '@projeto/eslint-config/rules/no-estilizacao-informal.js';

/** A RAIZ do app (`apps/web`). */
const RAIZ_APP = new URL('.', import.meta.url).pathname;

/**
 * Config mínima: a regra sozinha, com JSX habilitado no parser padrão.
 *
 * ⚠️ A anotação `Linter.Config[]` não é decoração: sem ela, o TypeScript
 * ALARGA o valor da regra para `string`, e o `Config` do flat config exige
 * `RuleConfig` — o `tsc` reprova o spec (MEDIDO 2026-11-11).
 */
const configDaRegra: Linter.Config[] = [
  {
    files: ['**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { estilizacao: { rules: { 'no-estilizacao-informal': regra } } },
    rules: { 'estilizacao/no-estilizacao-informal': 'error' },
  },
];

/** Linta um texto e devolve as mensagens DA REGRA (as outras são ignoradas). */
async function mensagensDe(codigo: string): Promise<string[]> {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: configDaRegra });
  const [resultado] = await eslint.lintText(codigo, { filePath: 'teste.jsx' });
  if (resultado === undefined) throw new Error('o ESLint não devolveu resultado');
  return resultado.messages
    .filter((m) => m.ruleId === 'estilizacao/no-estilizacao-informal')
    .map((m) => m.messageId ?? '');
}

describe('regra de estilo — o que ela recusa', () => {
  it('recusa a paleta stock do Tailwind', async () => {
    expect(await mensagensDe('const X = () => <p className="text-slate-900">oi</p>;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa a paleta stock no fundo, na borda e no anel', async () => {
    expect(await mensagensDe('const X = () => <p className="bg-red-50" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="border-slate-300" />;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa valor de cor literal', async () => {
    expect(await mensagensDe('const X = () => <p className="bg-[#fff]" />;')).toEqual([
      'cor-literal',
    ]);
    expect(await mensagensDe('const X = () => <p className="text-[rgb(0,0,0)]" />;')).toEqual([
      'cor-literal',
    ]);
  });

  it('recusa raio fora do padrão', async () => {
    expect(await mensagensDe('const X = () => <p className="rounded-lg" />;')).toEqual(['raio']);
    expect(await mensagensDe('const X = () => <p className="rounded" />;')).toEqual(['raio']);
  });

  it('recusa sombra em repouso', async () => {
    expect(await mensagensDe('const X = () => <p className="shadow-sm" />;')).toEqual(['sombra']);
  });

  it('recusa a violação dentro de template literal', async () => {
    const codigo = 'const X = () => <p className={`text-slate-900`} />;';
    expect(await mensagensDe(codigo)).toEqual(['cor-paleta']);
  });

  it('recusa a violação em `class` (e não só em `className`)', async () => {
    expect(await mensagensDe('const X = () => <p class="text-slate-900">oi</p>;')).toEqual([
      'cor-paleta',
    ]);
  });

  // ⚠️ A variante é o caso MAIS COMUM no app: `hover:bg-slate-700`,
  // `focus:border-slate-900`, `aria-[invalid=true]:border-red-500`.
  // MEDIDO 2026-11-11: com o regex ancorado em `^…$`, as tres passavam.
  it('recusa a paleta stock COM variante (hover, focus, dark, responsivo)', async () => {
    expect(await mensagensDe('const X = () => <p className="hover:bg-slate-700" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="focus:border-slate-900" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="dark:text-slate-900" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="sm:text-slate-900" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(
      await mensagensDe('const X = () => <p className="aria-[invalid=true]:border-red-500" />;'),
    ).toEqual(['cor-paleta']);
  });

  it('recusa a paleta stock COM opacidade', async () => {
    expect(await mensagensDe('const X = () => <p className="bg-slate-900/50" />;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa as cores literais do Tailwind (white, black)', async () => {
    expect(await mensagensDe('const X = () => <p className="text-white" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="bg-black" />;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa sombra literal', async () => {
    expect(
      await mensagensDe('const X = () => <p className="shadow-[0_1px_2px_rgb(0_0_0/0.05)]" />;'),
    ).toEqual(['sombra']);
  });
});

describe('regra de estilo — o que ela aceita', () => {
  it('aceita os tokens semânticos', async () => {
    expect(
      await mensagensDe(
        'const X = () => <p className="bg-surface text-foreground border-border" />;',
      ),
    ).toEqual([]);
  });

  it('aceita o raio do padrão e o anel de foco', async () => {
    expect(await mensagensDe('const X = () => <p className="rounded-md foco" />;')).toEqual([]);
  });

  it('aceita classe sem cor (espaçamento, tipografia, flexbox)', async () => {
    expect(
      await mensagensDe('const X = () => <p className="mt-8 flex items-center gap-3 text-sm" />;'),
    ).toEqual([]);
  });

  it('não confunde `text-sm` com cor', async () => {
    expect(await mensagensDe('const X = () => <p className="text-sm" />;')).toEqual([]);
  });

  it('aceita `transparent` e `current` (não são escolha de cor)', async () => {
    expect(await mensagensDe('const X = () => <p className="bg-transparent" />;')).toEqual([]);
    expect(await mensagensDe('const X = () => <p className="text-current" />;')).toEqual([]);
  });

  it('aceita o token com opacidade (o alert usa `bg-destructive/10`)', async () => {
    expect(await mensagensDe('const X = () => <p className="bg-destructive/10" />;')).toEqual([]);
  });
});

describe('regra de estilo — o repo real', () => {
  it('não há nenhuma violação nos arquivos de produção do app', async () => {
    // A config REAL do app — é ela que registra a regra em `pnpm lint`.
    const eslint = new ESLint({
      cwd: RAIZ_APP,
      overrideConfigFile: `${RAIZ_APP}eslint.config.mjs`,
    });
    const resultados = await eslint.lintFiles(['app', 'components']);
    const violacoes = resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === 'estilizacao/no-estilizacao-informal')
        .map((m) => `${r.filePath}: ${m.message}`),
    );

    expect(violacoes).toEqual([]);
  });

  it('a regra acusa uma violação plantada no app (o dente do gate)', async () => {
    const eslint = new ESLint({
      cwd: RAIZ_APP,
      overrideConfigFile: `${RAIZ_APP}eslint.config.mjs`,
    });
    const [resultado] = await eslint.lintText(
      'const X = () => <p className="text-slate-900">oi</p>;',
      { filePath: `${RAIZ_APP}plantado.tsx` },
    );
    if (resultado === undefined) throw new Error('o ESLint não devolveu resultado');
    const daRegra = resultado.messages.filter(
      (m) => m.ruleId === 'estilizacao/no-estilizacao-informal',
    );

    expect(daRegra).toHaveLength(1);
  });
});

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
// 2. **Diferencial contra o repo real** — a regra aplicada ao app INTEIRO,
//    com a config de produção do app.
//
// ⚠️ A sintética usa o parser padrão do ESLint com `jsx: true` — o texto
// lintado é JS com JSX, não TSX, e por isso não precisa do parser do
// TypeScript. A diferencial usa a config REAL do app (que tem o parser TS).
//
// ⚠️ **O que cada metade PROVA** (achado da revisão do PR #168): a
// diferencial prova que o app não tem violação — e NÃO prova que a regra está
// LIGADA (com a regra desregistrada, ela continua verde: o resto da config
// segue rodando). A prova de que a regra está LIGADA é do teste IRMÃO, o que
// planta a violação na config real e exige a mensagem dela.

import { ESLint, type Linter } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import regra from '@projeto/eslint-config/rules/no-estilizacao-informal.js';

/**
 * A RAIZ do app (`apps/web`).
 *
 * ⚠️ `fileURLToPath`, e não `new URL('.', import.meta.url).pathname`: o
 * `.pathname` é percent-encoded e quebra em `C:\` (a casa usa `fileURLToPath`
 * em `lib/cadastro-usuario-schema.parity.spec.ts`).
 */
const RAIZ_APP = fileURLToPath(new URL('.', import.meta.url));

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

  // ⚠️ MEDIDO 2026-11-16 (revisão de código): com a cor presa ao FIM do nome
  // (`^prefix-cor$`), `border-t-slate-200` PASSAVA — e essa é a forma mais
  // comum de borda do Tailwind. O furo era do INSTRUMENTO, não do app.
  it('recusa a paleta stock com modificador de LADO (border-t-, divide-y-)', async () => {
    expect(await mensagensDe('const X = () => <p className="border-t-slate-200" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="border-l-red-500" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="divide-y-slate-200" />;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa a paleta stock em placeholder e em ring-offset', async () => {
    expect(await mensagensDe('const X = () => <p className="placeholder-slate-400" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="ring-offset-slate-100" />;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa a opacidade arbitrária e o "importante" do Tailwind 4', async () => {
    expect(await mensagensDe('const X = () => <p className="bg-slate-900/[0.5]" />;')).toEqual([
      'cor-paleta',
    ]);
    expect(await mensagensDe('const X = () => <p className="bg-slate-900!" />;')).toEqual([
      'cor-paleta',
    ]);
  });

  it('recusa sombra literal', async () => {
    expect(
      await mensagensDe('const X = () => <p className="shadow-[0_1px_2px_rgb(0_0_0/0.05)]" />;'),
    ).toEqual(['sombra']);
  });

  // ⚠️ MEDIDO 2026-11-16: `drop-shadow-*` e `inset-shadow-*` PASSAVAM, e a
  // convenção §2.3 diz que o sistema não tem sombra nenhuma.
  it('recusa as famílias de sombra irmãs (drop-shadow, inset-shadow)', async () => {
    expect(await mensagensDe('const X = () => <p className="drop-shadow-lg" />;')).toEqual([
      'sombra',
    ]);
    expect(await mensagensDe('const X = () => <p className="inset-shadow-sm" />;')).toEqual([
      'sombra',
    ]);
  });

  // ⚠️ MEDIDO 2026-11-16: só o literal e o template literal eram lidos — o
  // ternário e a chamada de helper PASSAVAM. O app derivado usa as duas.
  it('recusa a violação em ternário e em chamada de helper', async () => {
    expect(
      await mensagensDe("const X = () => <p className={ok ? 'text-slate-900' : 'bg-surface'} />;"),
    ).toEqual(['cor-paleta']);
    expect(await mensagensDe("const X = () => <p className={cn('text-slate-900')} />;")).toEqual([
      'cor-paleta',
    ]);
  });

  // ⚠️ MEDIDO 2026-11-16 (revisão Next.js): a regra era cega ONDE O PADRÃO
  // MORA — as primitivas guardam as classes em constantes. Um
  // `text-slate-900` de volta na `CLASSES_BOTAO` passava o gate.
  it('recusa a violação na CONSTANTE de classe', async () => {
    expect(
      await mensagensDe(
        "const CLASSE_CONTROLE = 'border border-slate-300 px-3 py-2';\nconst X = () => <p className={CLASSE_CONTROLE} />;",
      ),
    ).toEqual(['cor-paleta']);
  });

  it('recusa a violação no objeto de classes (a forma que o repo usa)', async () => {
    expect(
      await mensagensDe(
        "const CLASSES_BOTAO = { base: 'rounded-md', primario: 'bg-slate-900' };\nconst X = () => <p className={CLASSES_BOTAO.primario} />;",
      ),
    ).toEqual(['cor-paleta']);
  });

  // ⚠️ MEDIDO 2026-11-16 (revisão do PR #168): a regra lia a constante pelo
  // NOME (`CLASSE_*`/`CLASSES_*`) — e 4 das 9 primitivas guardam a classe em
  // `const base`, que não casa. A regra era cega em 6 dos 11 componentes que
  // ela deveria medir. Agora ela resolve o VALOR da constante.
  it('recusa a violação na constante cujo NOME não declara classe (o VALOR, não o nome)', async () => {
    expect(
      await mensagensDe(
        "const base = 'text-slate-900';\nconst X = ({ className }) => (<p className={className ? `${base} ${className}` : base}>oi</p>);",
      ),
    ).toEqual(['cor-paleta']);
  });

  // ⚠️ O furo acima REABRIA em silêncio com um rename: `CLASSE_CONTROLE` →
  // `ESTILO_CONTROLE` deixava a regra cega, e nenhum teste acusava. Com a
  // resolução por VALOR, o nome deixa de ser o contrato.
  it('recusa a violação depois de um RENAME da constante', async () => {
    expect(
      await mensagensDe(
        "const ESTILO_CONTROLE = 'text-slate-900';\nconst X = () => <p className={ESTILO_CONTROLE} />;",
      ),
    ).toEqual(['cor-paleta']);
  });

  // ⚠️ MEDIDO 2026-11-16: a escala de sombra do Tailwind 4 tem `xs` e `2xs`
  // além das do Tailwind 3 — e a menor delas PASSAVA.
  it('recusa as sombras que o Tailwind 4 adicionou (xs, 2xs)', async () => {
    expect(await mensagensDe('const X = () => <p className="shadow-xs" />;')).toEqual(['sombra']);
    expect(await mensagensDe('const X = () => <p className="shadow-2xs" />;')).toEqual(['sombra']);
    expect(await mensagensDe('const X = () => <p className="inset-shadow-xs" />;')).toEqual([
      'sombra',
    ]);
    expect(await mensagensDe('const X = () => <p className="drop-shadow-xs" />;')).toEqual([
      'sombra',
    ]);
  });

  // ⚠️ MEDIDO 2026-11-16 (revisão do PR #168): o anel de foco SOBIA em 150ms
  // porque `transition-colors` transiciona `outline-color` também. O padrão
  // proíbe a combinação — e nada no repo a proibia.
  it('recusa a transição de cor junto do anel de foco', async () => {
    expect(await mensagensDe('const X = () => <p className="foco transition-colors" />;')).toEqual([
      'foco-transicao',
    ]);
  });

  // ⚠️ A §4.3 do padrão proíbe `outline-none` SEM substituto — e a regra
  // pode medir: o substituto (`foco`) está na MESMA class string.
  it('recusa o `outline-none` sem substituto', async () => {
    expect(await mensagensDe('const X = () => <p className="outline-none" />;')).toEqual([
      'outline-none-sem-substituto',
    ]);
    expect(await mensagensDe('const X = () => <p className="focus:outline-none" />;')).toEqual([
      'outline-none-sem-substituto',
    ]);
  });

  it('aceita o `outline-none` COM o substituto (`foco`)', async () => {
    expect(await mensagensDe('const X = () => <p className="foco outline-none" />;')).toEqual([]);
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
    // ⚠️ MEDIDO 2026-11-16: `rounded-t-md` usa o MESMO raio do padrão em um
    // lado só, e era reprovado — recusar o padrão é tão errado quanto deixar
    // o padrão passar.
    expect(await mensagensDe('const X = () => <p className="rounded-t-md" />;')).toEqual([]);
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

  // ⚠️ MEDIDO 2026-11-16: só `shadow-none` tinha a isenção — e as outras
  // DUAS famílias do Tailwind 4 têm a sua ("sem sombra"). Um app derivado que
  // escreve a classe semanticamente CORRETA levava falso positivo.
  it('aceita as sombras "sem sombra" das três famílias', async () => {
    expect(await mensagensDe('const X = () => <p className="shadow-none" />;')).toEqual([]);
    expect(await mensagensDe('const X = () => <p className="inset-shadow-none" />;')).toEqual([]);
    expect(await mensagensDe('const X = () => <p className="drop-shadow-none" />;')).toEqual([]);
  });

  it('aceita `rounded-none` (a escolha de NÃO arredondar, como o `shadow-none`)', async () => {
    expect(await mensagensDe('const X = () => <p className="rounded-none" />;')).toEqual([]);
  });
});

describe('regra de estilo — o repo real', () => {
  /**
   * ⚠️ O timeout é EXPLICITO, e o motivo é medido: este teste roda o ESLint
   * de verdade sobre o app INTEIRO (com o parser do TypeScript). Local ele
   * leva ~1,2 s; no CI o mesmo passo levou 8,8 s — e o default do Vitest é
   * 5 s, ou seja, MENOR que o CI (o run 43887524859 foi VERMELHO por
   * estourar o default, não por defeito da regra). O default mediria "a
   * regra demora" como FALHA do teste, que é o motivo errado.
   */
  const TIMEOUT_DIFERENCIAL = 30_000;

  /**
   * A regra está LIGADA na config do app — e com severidade de ERRO.
   *
   * ⚠️ A severidade é afirmada aqui porque o resto da suíte filtra por
   * `ruleId` e IGNORA a severidade: com a regra em `warn`, `eslint .` sai
   * com exit 0 e o gate perde o dente sem nada avisar (MEDIDO 2026-11-16).
   * `severity === 2` é `error`.
   */
  it(
    'a regra está LIGADA na config do app, com severidade de erro',
    async () => {
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
      expect(daRegra[0]?.severity).toBe(2);
    },
    TIMEOUT_DIFERENCIAL,
  );

  /**
   * O app INTEIRO não tem nenhuma violação.
   *
   * ⚠️ `lintFiles(['.'])` — o mesmo alcance do `pnpm lint` do app, que é
   * `eslint .`. O alcance anterior (`['app', 'components']`) cobria 57 dos
   * 134 arquivos que o gate lint, e uma violação plantada em `src/` ou `lib/`
   * passava (MEDIDO 2026-11-16).
   *
   * ⚠️ `resultados.length > 0` é a afirmação de que o gate MEDIU algo: sem
   * ela, um lint que não varre nada passa por "nenhuma violação".
   */
  it(
    'não há nenhuma violação nos arquivos de produção do app',
    async () => {
      // A config REAL do app — é ela que registra a regra em `pnpm lint`.
      const eslint = new ESLint({
        cwd: RAIZ_APP,
        overrideConfigFile: `${RAIZ_APP}eslint.config.mjs`,
      });
      const resultados = await eslint.lintFiles(['.']);
      const violacoes = resultados.flatMap((r) =>
        r.messages
          .filter((m) => m.ruleId === 'estilizacao/no-estilizacao-informal')
          .map((m) => `${r.filePath}: ${m.message}`),
      );

      expect(resultados.length).toBeGreaterThan(0);
      expect(violacoes).toEqual([]);
    },
    TIMEOUT_DIFERENCIAL,
  );
});

import type { RuleDefinition } from 'eslint';

/**
 * Tipagem da regra local `no-estilizacao-informal`.
 *
 * O repositório da regra é JavaScript (é o que o ESLint flat config carrega),
 * e o `apps/web/tsconfig.json` declara `allowJs: false` — sem este arquivo,
 * um spec em TypeScript que importe a regra não compila (`TS7016`: módulo sem
 * declaração de tipo).
 *
 * A alternativa seria `// @ts-expect-error` no ponto do import, que amarra o
 * teste a um erro que pode sumir. Um `.d.ts` ao lado do `.js` é a forma que o
 * TypeScript espera, e não depende do erro existir.
 *
 * ⚠️ O tipo é `RuleDefinition`, e não `Rule.RuleModule`: o `Config` do flat
 * config do ESLint 9 exige `RuleDefinition`, e `RuleModule` (o tipo legado)
 * NÃO é atribuível a ela — o `create` de uma tem assinatura diferente da
 * outra, e o `tsc` acusa. MEDIDO 2026-11-11.
 */
declare const regra: RuleDefinition;

export default regra;

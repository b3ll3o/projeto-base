# `@projeto/tsconfig`

> Configurações de TypeScript compartilhadas pelos workspaces do monorepo.
> Medido em **2026-10-29**: 3 arquivos (`base.json`, `node.json`, `react.json`),
> todos derivados do `tsconfig.base.json` da **raiz do repo**.

## §1. A cadeia

```
tsconfig.base.json          (raiz do repo — a base de tudo)
  └── packages/tsconfig/base.json
        ├── packages/tsconfig/node.json    → apps/api/tsconfig.json
        ├── packages/tsconfig/react.json   → apps/web/tsconfig.json
        │                                    apps/web/tsconfig.e2e.json
        └── packages/tsconfig/base.json    → packages/shared-types/tsconfig.json
```

`packages/tsconfig/base.json` só faz `extends: "../../tsconfig.base.json"` —
a base real mora **na raiz**, em `tsconfig.base.json`. O package é a forma de
**nomear e versionar** os presets (`base`, `node`, `react`) sem duplicar
configuração.

## §2. Quem estende o quê

| Consumidor | Estende |
|---|---|
| `apps/api/tsconfig.json` | `@projeto/tsconfig/node.json` |
| `apps/web/tsconfig.json` | `@projeto/tsconfig/react.json` |
| `apps/web/tsconfig.e2e.json` | `@projeto/tsconfig/react.json` |
| `packages/shared-types/tsconfig.json` | `@projeto/tsconfig/base.json` |

## §3. O que cada preset define

| Preset | `target` | `module` / `moduleResolution` | `lib` | Outros |
|---|---|---|---|---|
| `base.json` | — | — | — | Nada além do `extends` da raiz. |
| `node.json` | `ES2022` | `NodeNext` / `NodeNext` | `["ES2022"]` | `types: ["node"]` |
| `react.json` | `ES2022` | `ESNext` / `Bundler` | `["ES2022", "DOM", "DOM.Iterable"]` | `jsx: "preserve"`, `incremental: true`, `allowJs: false`, `noEmit: true` |

Três escolhas que valem saber:

- **`jsx: "preserve"`** no preset React — o `next build` é quem transpila o
  JSX. O preset não emite (`noEmit: true`).
- **`NodeNext` no preset Node** — é o que permite `import type { X } from
  './foo.js'` com extensão explícita, que é a forma que o
  `@projeto/shared-types` usa nos barrels.
- **`Bundler` no preset React** — resolução sem extensão, que é o que o
  bundler do Next faz.

## §4. O que já vem da raiz

`packages/tsconfig/base.json` não define `compilerOptions` próprio: ele herda
tudo de `tsconfig.base.json`, na raiz do repo. As opções **mais restritivas**
que o repo usa moram lá — e valem ser lidas antes de mexer neste package:

| Opção | Efeito |
|---|---|
| `strict` | A família inteira de checagens estritas. |
| `noUncheckedIndexedAccess` | `arr[0]` é `T \| undefined` mesmo com `length > 0` garantido. É por isso que o login usa `empresas[0]` com checagem, e não `!`. |
| `exactOptionalPropertyTypes` | `{a?: string}` ≠ `{a: string \| undefined}`. |
| `isolatedModules` | Cada arquivo tem de ser transpilável sozinho — obriga `export type` para tipos re-exportados. |
| `experimentalDecorators` + `emitDecoratorMetadata` | O par que o NestJS precisa para injeção de dependência. |
| `useDefineForClassFields: false` | Compatível com o `emitDecoratorMetadata` do Nest. |
| `paths` | `@projeto/shared-types` → `./packages/shared-types/src` (e `@projeto/ui`, `@projeto/shared-audit`, `@projeto/shared-domain`). |

## §5. Regras de manutenção

- **O preset novo entra como arquivo irmão**, com nome próprio, e quem estende
  passa a apontar para ele. O `package.json` deste package tem `files` com os
  três nomes — **um preset novo precisa entrar nessa lista**, senão ele não é
  publicado no workspace.
- **A raiz é a fonte da verdade das opções.** Este package **nomeia** e
  **versiona**; ele não **decide** strictness.

## §6. Ver mais

- Base real: `tsconfig.base.json` (raiz do repo)
- Contrato web↔api (usa `base.json`): [`packages/shared-types/README.md`](../shared-types/README.md)
- Convenções de estrutura: [`.agents/specs/conventions/estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md)

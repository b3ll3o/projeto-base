# Pendências encerradas — CI Defense in Depth

> Registro datado das pendências que **já foram encerradas**, extraído de
> [`ci-defense-in-depth-pendencias.md`](./ci-defense-in-depth-pendencias.md) em
> 2026-10-29, quando o ledger passou a medir **só** o que está aberto.
>
> **Por que este arquivo existe:** o ledger de pendências abertas é medido pelo
> gate `check-doc-size` (teto de 300 linhas, `tamanho-e-revisao.md`), e ele cresce
> a cada gate novo. Uma pendência que **fecha** sai do ledger e vem para cá —
> assim o ledger mede o trabalho que ainda existe, e este arquivo guarda o
> registro do que já foi resolvido, com a medição e a data de cada item.
>
> Item só entra aqui **medido**: o comando e a data. Pendência sem comando é
> opinião, e opinião envelhece sem aviso.
>
> Quando este arquivo passar de 300 linhas, ele é dividido em
> `ci-defense-in-depth-pendencias-fechadas-2.md` com índice e links cruzados —
> o gate `check-doc-size` avisa.

## Pendências encerradas

- **FECHADO 2026-10-08 — o painel lia `ok` e `errors` para decisões
  diferentes.** `relatarUmCheck` tirava a **marca** de `result.ok` e a
  **contagem** de `errors.length`; `ok` e `errors` são independentes por
  contrato `CheckResult`. MEDIDO: com `{ ok: true, errors: ['pacote de e2e
  fora dos --filter'] }` a linha saía **VERDE**, os erros eram contados e o
  processo saía 1 — o build reprovava com uma linha verde na tela, que é a
  pior leitura possível porque o token de sucesso é o primeiro que o olho pega.
  O outro lado da classe: `{ ok: false, errors: [] }` imprimia `✗` e saía **0**.
  Hoje **inalcançável** (`grep -rn "ok: errors.length === 0"
  .tooling/scripts/ci/*.ts` → 11 ocorrências; todo gate deriva `ok` de
  `errors.length`), o que é exatamente por que era um furo: nada media se os
  dois concordam. Agora `falhou(r) = r.errors.length > 0` é a **única** fonte
  de "isto reprovou" — a marca, a contagem e o gatilho da linha de skip leem a
  mesma variável, e `ok: false` sem erro algum conta **1** e **diz** que a
  recusa não tem causa registrada. Dentes medidos em
  `npx vitest run --root .tooling/scripts/ci preflight` (denominador **40**):
  marca voltando a derivar de `ok` → **2 de 40** vermelho; `Math.max` voltando a
  `errors.length` → **1 de 40**.

- **FECHADO 2026-10-08 — `PREFLIGHT_GATES` deixou de ser transcrição à mão.**
  O item estava aberto desde 2026-10-06: `check-teeth-registry.ts` reconciliava
  o registro contra um **literal** seu, e não contra o array `checks` que
  `preflight.ts` de fato executa (o array vivia dentro de `main()`, sem
  export). Gate novo rodava sem obrigação de entrar no registro; gate removido
  continuava "registrado". O comentário sobre o literal afirmava "derivados do
  array `checks` por importação real" — o oposto do que o código fazia.

  A lista virou `PREFLIGHT_CHECKS` em
  [`preflight-gates.ts`](../../../.tooling/scripts/ci/preflight-gates.ts),
  **só dados** (`id`, `name`, `file`): o módulo que guardasse também a função
  importaria `checkTeethRegistry`, que importa ele de volta. O `COMO` ficou em
  `RUNNERS`, no `preflight.ts`, e `resolverChecks()` casa os dois lados.

  **MEDIDO (dentes do spec novo, denominador 9):**
  `preflightGates()` virando um retrato avaliado no carregamento do módulo →
  **1 de 9 vermelho**; o `throw` de `resolverChecks` trocado por fallback verde
  → **1 de 9 vermelho** (medido duas vezes: a primeira medida deu **8 de 8
  verde**, porque no repo real todo `id` tem runner e o caminho de falha era
  inerte — o gate vigiava um conjunto vazio).

  **A extração quebrou dois guards, e eles estavam certos.** `check-harness-owner`
  lia a posse do campo `file:` em `preflight.ts` → 3 harnesses viraram órfãos
  ("expected [ …(3) ] to deeply equal []"), e `preflight-gates.ts` com
  `#!/usr/bin/env tsx` no topo foi classificado como HARNESS ÓRFÃO — o guard
  classifica como harness o que não começa com `check-`, não termina em
  `.spec.ts` e tem shebang. O conserto foi nos dois: shebang removido do módulo
  importado (que ninguém executa) e `OWNERSHIP_SOURCES` lendo as duas fontes, com
  o rótulo do dono vindo delas (`preflight-gates.ts#PREFLIGHT_CHECKS`) em vez
  de uma constante embutida no guard.


- **FECHADO 2026-10-08 — `tooling/scripts/` tinha typecheck que NADA executava,
  e barra mais frouxa.** A #46 dizia que `.tooling/` era "a única superfície do
  repo sem typecheck" — falso para `tooling/`, que tem
  `tooling/scripts/tsconfig.json` com um `tsc` que nenhum script ou job rodava.
  Três divergências, todas medidas: **não estendia** o base (tinha `strict`,
  não tinha `noUncheckedIndexedAccess` — e o `check-tsconfig-drift` não
  conseguia acusar: sem `extends`, "ausente" e "herda" são indistinguíveis);
  **excluía** `**/*.spec.ts` e limitava `include` a `./*.ts` (nem `lib/` entra);
  e a cobertura era por acaso — `npx tsc --noEmit -p .tooling/tsconfig.json
  --listFiles | grep -c "projetos/base/tooling/scripts"` → **1**, e só
  `review-router.ts`, importado por outro arquivo.

  ⚠️ **O número da pendência envelheceu e ninguém mediu.** O texto dizia **37
  erros** para paridade plena; medido hoje, com o conteúdo atual do diretório, são
  **31** — e a contagem envelhece a cada commit posterior, não por mês. O
  registro antigo não é erro de cálculo, é erro de *fonte*.

  Agora: `tooling/scripts/tsconfig.json` estende `tsconfig.base.json` com
  `include: ["./**/*.ts"]`, e o `check-tooling-typecheck` typecheca **as duas**
  superfícies — `SUPERFICIES` é lista exportada e o gate faz `for` nela, com
  o prefixo da superfície em cada erro (dois vermelhos simultâneos precisam ser
  distinguíveis por linha). Os **31** erros foram corrigidos, não escondidos:
  `glob.charAt` em vez de `glob[i]`, `evidence` com tipo concreto em vez de
  `Record<string, string[]>` (que sob `noUncheckedIndexedAccess` devolvia
  `string[] | undefined` em cada `push`), `if (k === undefined) continue` nos
  dois parsers de `process.argv`, e `ArchiveInput.frontmatter` passando a
  `unknown` — porque a função existe para validar frontmatter que pode estar
  errado, e o tipo canônico ali só empurrava o `as` para o spec.

  Dentes medidos, denominador **12**: `parseTscDiagnostics` sempre `[]` →
  **4 de 12**; `status !== 0` neutralizado → **2 de 12**; `for` correndo só a
  1ª superfície → **2 de 12**; só a 1ª ausência contada → **2 de 12**. E o
  diferencial contra o repo real: um arquivo de prova com um
  `noUncheckedIndexedAccess` sob tooling/scripts → **EXIT=1** prefixando
  `tooling/scripts/tsconfig.json:`; sem ele → EXIT=0.

- **FECHADO 2026-10-08 — a cobertura de dentes fecha a classe.** Era 6 dos 16
  gates provando a lógica com `controle negativo` em tmpdir, o que não prova a
  integração com o sistema real. MEDIDO contando as linhas da tabela por nível:
  agora **16** = **15** mutação + **0** controle negativo + **1** controle
  positivo, **0** desconhecidas (ver
  [Registro de dentes](ci-defense-in-depth.md#registro-de-dentes)). As cinco
  viradas foram `check-tooling-typecheck`, `check-tsconfig-drift`,
  `check-eslint-drift`, `check-turbo-drift` e `check-doc-refs`, mais a do lint
  da matriz de review-routing, que era o último `controle negativo` da tabela.

  ⚠️ **Um SPEC verde não era prova de integração, e o `--filter` provou.**
  `check-package-json-drift` tinha **28** specs, todos verdes, e era inerte
  contra o repo real: plantar `"e2e:web": "turbo run test:e2e
  --filter=@projeto/web"` no `package.json` raiz saía **EXIT=0**. O spec media a
  lógica num tmpdir, que é a mesma forma que a classe 6 descreve. O que fecha a
  classe não é mais spec — é um **diferencial contra o repo de verdade**,
  com o defeito real plantado e o gate rodando sobre ele.

  E o lint da matriz era a prova de que a classe ainda tinha brecha: ao medir os
  dentes dele, o gate **falhou** num bloco `yaml` que não é mapa (lista,
  escalar ou prosa) — devolvia `errors: []` depois de **não verificar regra
  nenhuma**. Verde por ausência, a mesma forma do `--filter`. Corrigido, com o
  diferencial medido na matriz real (`bloco yaml #2` nomeado).

- **FECHADO 2026-10-16 (T4) — `check-package-json-drift` estendido** com
  `extraPackageJsonPaths` para cobrir `apps/{web,api}/package.json`
  (pendência L208). O gate agora detecta scripts fantasma em apps e exige
  canônicos só onde faz sentido: raiz exige `test`, `ci:preflight`, etc.;
  apps exigem `test`, `test:unit`, `test:coverage` (não `ci:preflight`,
  que vive só na raiz). Specs `extraPackageJsonPaths cobre apps` e
  `extraPackageJsonPaths com legacy default` verde.

## Pendências herdadas (T4 — gates que não couberam no PR v1.12)

- **G-H-11 (testIgnore) — cancelado em T4** por saturação de contexto do
  subagente. `check-testignore` foi entregue como draft (8/12 testes
  falhando) e removido do PR. Pendência L247 continua.
- **G-H-02 (otelcol-compose-parity) — cancelado em T4** pelo mesmo motivo.
  Sem artefato produzido. Pendência L261 (engines / Dockerfiles) é
  adjacente mas distinta.
- **G-H-08 (workflow-yaml) — cancelado em T4.** Pendência L38 ("nenhum
  tooling lê `.github/workflows/ci.yml`") continua.


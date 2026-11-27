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

- **FECHADO 2026-11-27 — o `check-path-alias` media uma semântica de `paths` que o TypeScript não tem, e mediava só UM tsconfig.** (medido 2026-10-30, fechado 2026-11-27). O alvo de um `paths` do TS é um **local de módulo**, resolvido por wildcard e por arquivo; o gate exigia um **diretório** (`st.isDirectory()`) e pegava só o **primeiro** destino. Três formas legítimas eram acusadas: (a) alvo que é **arquivo** (`"./src/x.ts"` resolve — `tsc --noEmit` sai 0); (b) alvo com **wildcard** (`"./*"` — que é o que `apps/web/tsconfig.json` usa); (c) alvo com **vários destinos** — o TS tenta **todos** em ordem (MEDIDO: `['./src/nao-existe','./src/real.ts']` resolve para `real.ts`, `tsc` sai 0). Comando do defeito: o gate contra o tsconfig do web → `alias morto: '@/*' aponta para './*' (…/apps/web/*), que não existe`.
  O conserto passa a resolver o alvo **na base em que o TS resolve**: `ts.getParsedCommandLineOfConfigFile` devolve o `paths` e o `baseUrl` **efetivos** (após o `extends`), o alvo é resolvido contra essa base (não contra o diretório do tsconfig), e cada destino é julgado na forma que o TS aceita como alvo — arquivo, diretório, ou padrão com `*` (o `*` casa `/` também: MEDIDO 2026-11-27, `@/deep/a` → `./src/*` resolve para `src/deep/a.ts`). O gate passa a medir **TODOS** os tsconfigs do repo (o de cada projeto e o do pacote de configs), e um tsconfig que não pode ser lido vira **advisory** ("NÃO medido"), nunca verde por ausência.
  MEDIDO 2026-11-27 no repo real: **11** tsconfigs medidos (9 deles declaram `paths` efetivo), **23** pares alias×destino — **4** aliases distintos, herdados por `extends` — e **0** mortos; o `@/*` do web (`apps/web/tsconfig.json` e `apps/web/tsconfig.e2e.json`) resolvido **vivo** — o `apps/web` tem **150** imports `@/…` (MEDIDO: `grep -rhoE "from '@/[^']*'" apps/web --include=*.ts --include=*.tsx | wc -l` → 150) e 27 specifiers distintos.
  ⚠️ **A CHAVE é o que decide se o `*` do ALVO é substituição ou nome de arquivo** — MEDIDO em 2026-11-27 com a matriz completa (4 combinações de chave × alvo, cada uma com `tsc --noEmit --traceResolution`): `@k/*` + `./src/*` resolve (o `*` casa o capturado), `@k/*` + `./src/deep` resolve (o TS usa o alvo e ignora o capturado), `@kexato` + `./src/deep` resolve, e `@kexato` + `./src/*` **NÃO resolve** — sem `*` na chave não há trecho capturado, e o TS procura `./src/*` LITERAL (o trace mostra `Trying substitution './src/*', candidate module location: './src/*'` e `Directory '…/src/*' does not exist` → TS2307). O gate que decide o modo "wildcard" olhando SÓ o alvo dizia que esse alias estava vivo: **verde com o `tsc` vermelho**. O conserto consulta a CHAVE antes de tratar o `*` do alvo como slot de substituição. Nenhum alias do repo real cai nesse caso (as 4 declarações são `@projeto/*` com alvo plano e `@/*` com chave e alvo com `*`) — era um buraco LATENTE, não um vermelho vivo.
  Dentes: `npx vitest run --root .tooling/scripts/ci check-path-alias` (denominador **23**, MEDIDO 2026-11-27) → **13 de 23** com `aliasesDe` devolvendo lista vazia (nenhum alias lido), **9 de 23** com o julgamento de existência neutralizado (todo `vivo: false` virado em `vivo: true` — todo alias parece vivo), **3 de 23** com o parse revertido ao `JSON.parse` e o erro engolido (o `tsconfig` com comentário volta a passar verde em silêncio), **2 de 23** com a base resolvida contra o diretório do tsconfig em vez do `baseUrl` (o alias herdado por `extends` resolve contra a base errada), **2 de 23** com o fallback na ordem removido (só o primeiro destino é medido — o 2º nunca é consultado), **1 de 23** com o wildcard tratado como caminho literal (o `@/*` do web vira "alias morto"), **1 de 23** com o `*` do alvo julgado sem consultar a chave, **1 de 23** com o pool de volta a (nome, base) (o alias vivo no pai mascara o quebrado no filho).

- **FECHADO 2026-11-26 — o `check-path-alias` lia o `tsconfig` com `JSON.parse`, e um `//` desligava o gate inteiro.** O `tsconfig.json` é **JSONC**: o `tsc` aceita comentário e vírgula final, e o `JSON.parse` REJEITA os dois. O `catch` devolvia `[]` — **verde silencioso**, a classe 5 de `guard-classes.md`. MEDIDO (2026-11-26): um `tsconfig.base.json` com um `//` no meio e **DOIS aliases mortos** devolvia `{ok: true, errors: []}` — o gate não via nenhum dos dois.
  O conserto lê o arquivo com a **mesma porta que o `tsc` usa** (`ts.readConfigFile`, que aceita JSONC), e JSON que é inválido DE VERDADE volta como `skipped` **COM MOTIVO** (nunca verde por ausência). ⚠️ A afirmação de que `ts.parseConfigFileTextToJson` "LANÇA um Debug Failure com texto comentado" **NÃO SE SUSTENTA** — MEDIDO em 2026-11-27: 41 entradas (comentário em 6 posições, bloco, vírgula final, BOM, CRLF, 5 formas de JSON inválido, array na raiz, vazio, octal, chave duplicada) × as duas portas → **0 LANÇAMENTOS**; as duas devolvem o mesmo resultado. O que o `readConfigFile` acrescenta é o **nome do arquivo no diagnóstico** e o erro 5083 ("Cannot read file") quando o arquivo não existe — é isso que o gate usa, e não um crash do leitor.
  Dentes: `npx vitest run --root .tooling/scripts/ci check-path-alias` (denominador **23**, re-medido em 2026-11-27) → **3 de 23** com o parse revertido ao `JSON.parse` (o `tsconfig` com comentário volta a passar verde em silêncio).

- **FECHADO 2026-11-26 — um gate que LANÇAVA derrubava o preflight INTEIRO (os checks depois dele nem rodavam).** O `preflight` chamava `check.fn()` sem proteção. O caso real: um `.md` apagado cuja remoção ainda não foi staged fica no **índice** do git e some do **disco** — o `check-doc-size` fazia `readFile` e o `ENOENT` derrubava o preflight (MEDIDO 2026-11-26: `Error: ENOENT ... at async arquivosAcimaDoTeto`, com o processo morrendo no primeiro gate de doc).
  ⚠️ **MEDIDO em 2026-11-27, o número "56" que circulava na redação deste item era ERRADO** — o preflight tem 56 checks NO TOTAL, e o crash não ocorreu no fim: ele ocorreu no **48º** check (`check-doc-size`, o 48º de 56 — `grep -n "id: '" .tooling/scripts/ci/preflight-gates.ts` → posição 48). Reproduzido no `origin/main` com um `.md` plantado e apagado: o painel imprimiu **48** bullets — **47** checks rodaram antes do crash (**39** ✓, **3** "– (skipped)", os **5** vermelhos são gates que exigem o ambiente completo, que o worktree de medição não tem), o **48º** (`check-doc-size`) morreu, os **8** seguintes NUNCA rodaram, o **resumo final não imprimiu**, e o processo saiu com **exit 2** (o do crash), não 1. A redação certa é "o preflight morreu no 48º de 56 checks; os 8 seguintes não rodaram".
  O conserto é em DUAS camadas: (1) o `check-doc-size` não mede o que não existe e **DIZ que não mediu** (advisory com o nome do arquivo); (2) o `preflight` roda cada check por `executarCheck`, que transforma um gate que lançou em **um check vermelho com o motivo** — uma linha no painel, e o resto do preflight continua. Um gate com defeito é uma linha vermelha, não a queda da casa.
  Dentes: `npx vitest run --root .tooling/scripts/ci preflight.spec` (denominador **45**, re-medido 2026-11-27 depois de o `rodarChecks` ser extraído do `main()`) → **3 de 45** com o `try/catch` neutralizado e **3 de 45** com o `catch` devolvendo `ok: true`; `npx vitest run --root .tooling/scripts/ci check-doc-size` (denominador **15**) → **1 de 15** com o `readFile` que lança.

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


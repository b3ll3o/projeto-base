---
name: estrategias-desenvolvimento-comparacao
description: Comparação entre regra determinística, camada agentic e memória acumulada, e onde este repo errou a classificação
version: 1.1.0
updated: 2026-10-03
maintainer: orquestração
---

# Estratégias de desenvolvimento — qual usar, e onde este repo errou

## TL;DR

O framework de referência ("vetorial encontra similaridade, grafos encontram
relacionamentos, fine-tuning especializa comportamento, e às vezes a resposta é
software convencional") aplicado a este repo produz um veredito desconfortável:
**quase nenhum problema aqui precisa de IA**, e mesmo assim o repo construiu
três camadas — 1849 linhas de tooling determinístico (`find tooling/scripts -name '*.ts' -not -name '*.spec.ts' | xargs wc -l`), 19 agents, 1307 linhas de
memória — para resolver o que, em 100% dos casos verificados, é regra
determinística.

Verificado:

```bash
grep -rliE 'embedding|openai|langchain|pgvector|neo4j' --include=package.json apps packages tooling .tooling | wc -l
# → 0
```

A camada que o repo chama de "agentic" é, estruturalmente, **26 `pattern:` em
YAML** (`.agents/specs/conventions/review-routing.md:21-104`) executados por
`tooling/scripts/review-router.ts` — TypeScript determinístico. Pelo framework,
isso se chama software convencional. O nome errado produziu custo concreto, e a
seção 7 lista os oito.

**A tese honesta:** o pipeline determinístico é a única das três estratégias
cujo modo de falha é inspecionável — e é por isso que ele vence. Os outros dois
modos de falha (sub-invocação, evaporação) não são detectáveis pelo próprio
sistema.

## 1. As três estratégias

### 1.1 Pipeline determinístico (regras, hooks, gates de CI)

**O que resolve:** tudo que tem padrão conhecido — drift de config, import
proibido, script fantasma no `package.json`, link quebrado, tamanho de `.md`.
**O que não resolve:** nada que exija julgamento semântico.

**Evidência de que funciona:** o `preflight` roda 9 checks declarados no array `checks` de
`.tooling/scripts/ci/preflight.ts:80-125` e mede ~1,6s localmente
(`time pnpm ci:preflight` → `real 0m1,562s`, 3 execuções em 2026-10-02), contra
`timeout-minutes: 20` no job `quality` (`.github/workflows/ci.yml:36`).

O bloqueio é real: `tooling/scripts/stack-code-reviewer.ts:236` faz
`process.exit(1)`, e o guard anti-falso-positivo `isDomainFile()`
(`stack-code-reviewer.ts:56`) limita a regra a paths com componente `/domain/` —
verificado nos dois sentidos: fora de `/domain/` importando `@nestjs/common` →
0 findings; dentro → 1 blocker + exit 1.

**Custo por task:** ~1,6s (preflight) + ~0,5s (stack-code-reviewer).
Manutenção: 2373 linhas:

```bash
wc -l .tooling/scripts/ci/*.ts tooling/scripts/stack-code-reviewer.ts tooling/scripts/doc-sync.ts | tail -1
# → 2373 total
```

**Modo de falha:** não é o gate errar — é o gate virar teatro. Verde sem ter
verificado. Ver seção 8.

### 1.2 Camada agentic (roteamento de revisão por especialista)

**O que resolve:** decidir *quem* revisa um diff, incluindo as classes que o
filtro por extensão de hook é cego (commit só de `.md`, só de `Dockerfile` — o
glob de revisão é `\.(ts|tsx|prisma)$` em `.husky/pre-commit:15`).
**O que não resolve:** nada que exija bloquear, porque não tem consumidor.

**Evidência:** é a única camada que mede a própria taxa de erro e converte falso
positivo em teste de regressão nomeado pelo incidente
(`tooling/scripts/review-router.spec.ts:275`). É o único artefato do repo
comparável a um fine-tuning bem feito — e está em código, não em prosa.

**Custo:** ~0,5s por invocação. Manutenção: 26 `pattern:` em `review-routing.md`
(297 linhas) + 30 em `specialist-routing.md` (285 linhas), medido por
`grep -c 'pattern:'`.

**Modo de falha:** sub-invocação silenciosa.
`grep -rn 'review:route\|specialist:route' .github .husky .tooling | wc -l` → **0**.
O `process.exit(result.blocking ? 3 : 0)` (`review-router.ts:350`) é código sem
consumidor. A camada produz *nenhuma* saída — visualmente idêntica a "rodou e
não achou nada".

### 1.3 Memória acumulada (retro, memory files, lições codificadas)

**O que resolve:** decisões de julgamento, regras negativas e números de falso
positivo que as outras duas não capturam. Exemplo verificado:
`.agents/memory/docker-specialist.md:64` registra "Recomendação: lint para
validar que `COPY --from` com múltiplas sources usa caminhos absolutos" — um
defeito observado por um agente que virou *candidata a regra determinística*.
É o caminho que só o híbrido percorre: memória (julgamento) → regra → barreira.

**O que não resolve:** enforcement. Por construção —
`grep -rn 'agents/memory' tooling/ .tooling/ .husky/ .github/ | wc -l` → **0**.

**Custo:** zero marginal na escrita (editada no mesmo commit da atividade). O
custo real é de **descoberta**: um LLM que não abre o arquivo paga a leitura e
mesmo assim não aprende.

**Modo de falha:** evaporação e paralelismo. `wc -l .agents/memory/*.md | sort -n`
mostra 8 de 21 memórias presas em 31 linhas — o piso do template
(`.agents/memory/_template.md` tem 32) — e nenhuma delas é de um agent exercitado
por hook ou CI. Agrava: 18 links em `AGENTS.md:65-88` apontam para
`../.agents/memory/…`, que resolve **para fora do repo** (o diretório pai não tem
`.agents/`), enquanto a coluna vizinha usa `./.agents/agents/…`.

## 2. A quarta: o híbrido em 3 camadas — implementa ou só declara?

**Implementa.** As três camadas existem e funcionam isoladamente:

- Camada 1 tem barreira **provada ao vivo**: violação DDD real em
  `domain/probe.ts` → `1 finding(s) — 1 blocker` + EXIT=1 pelo mesmo caminho que
  `.husky/pre-commit:19` e `review-stack.yml:31` executam.
- Camada 2 é código testado: `pnpm tooling:test` → **16 arquivos / 206 testes
  verdes**.
- Camada 3 é artefato versionado: 1307 linhas em 21 arquivos.

**A carga de prova não está mais concentrada na Camada 1.** A Camada 2 era
inert — os 6 specs de `.tooling/scripts/ci` (os próprios checks do preflight)
não rodavam em lugar nenhum, porque `tooling:test` usava `--root
tooling/scripts`, que exclui `.tooling/`. Ligados ao `tooling:test` e ao job
`preflight` do CI. E a barreira de topo **passou a existir**: o ruleset
`master` (23853096) exige `required_status_checks: [{context: "quality"}]`
(D2, [git-workflow.md](../.agents/specs/conventions/git-workflow.md)).

**O que ainda não fecha:** a garantia é da **cadeia**, não de cada check —
`quality` tem `needs: preflight`, mas se essa aresta cair, `preflight` vira
opcional sem aviso. `required_approving_review_count` segue 0. E a Camada 3
continua inalcançável pelo índice.

**Veredito:** o híbrido ganha como narrativa e perde como sistema. Onde ele é
real — um gate de DDD barrando um commit — funciona. Onde ele é declarado — três
camadas de convenção com 12 furos de costura (8 misclassifications na §7 + 4
modos de bypass na §8) — produz a sensação exata do que
não existe.

## 3. Tabela comparativa

| Dimensão | Determinístico | Agentic | Memória |
| --- | --- | --- | --- |
| Latência de feedback | ~1,6s (medido) — o dev vê o erro antes de terminar a frase | ~0,5s/invocação, **0 no caminho real** (nenhum hook/CI chama) | 0 na escrita; custo real é de descoberta |
| Custo por task | ~2,1s por ciclo commit+push contra job de 20 min | ~1,0s se rodasse; marginal por regra nova = 1-2 linhas | 0 marginal; custo é de disciplina (alguém tem que rodar a retro) |
| Cobertura de falha | Alta onde está ligado | **Zero hoje** — sem consumidor | **Zero por construção** — nenhum código lê memória |
| Bypass silencioso | Baixo e inspecionável: `--no-verify` é pego por `format:check` (`ci.yml:30`) | Altíssimo e invisível: sub-invocação não produz saída nenhuma | Altíssimo: evaporação silenciosa |
| Escalabilidade (1→10 devs) | Mal em conhecimento (hooks são por dev), bem em execução | Escala em conhecimento, mas single-owner | Única que escala como ativo de time — **mas só se versionada** |
| O que faz quando erra | Erra **alto e nomeado**: exit 1, arquivo, linha, regra | Erra **baixo e anônimo**: classifica para o reviewer errado e nada denuncia | Não erra — evapora. Não existe evento detectável |
| Auditabilidade | Alta: o gate imprime o que verificou | Média: emite `evidence[]`, mas só se você lembrar de rodar | Alta como artefato, zero como trilha de decisão |
| Aprendizado | Lento e caro: cada FP custa um PR | **Única que se mede** — FP vira teste no mesmo commit | Aprende no papel, não no fluxo |
| Ajuste ao framework | Software convencional — correto, o framework autoriza | Regra determinística com figurino de semântico | Fine-tuning analógico — e por isso sujeito à lei do framework |

**Vencedora por dimensão:** determinística em 7 de 9; memória em 1; agentic em 1.

## 4. Regra de classificação

| Se o problema é… | Use | Critério **decisivo** |
| --- | --- | --- |
| "esse valor é igual ao esperado?" | Regra determinística | Existe um predicado puramente sintático |
| "esse import é proibido?" | Regra determinística | O padrão casa sem ambiguidade |
| "quem deve revisar este diff?" | Regra determinística aqui; agentic só se a decisão depender de contexto fora do path | A decisão é função do path, não do significado |
| "qual decisão de tradeoff tomamos antes e por quê?" | Memória | O fato não é verificável contra o disco |
| "este documento é parecido com aquele?" | Vetorial | Similaridade semântica entre documentos |
| "como estes 5 arquivos se relacionam?" | Grafo | Relacionamento multi-hop entre entidades |
| "especialize este comportamento com exemplos validados" | Fine-tuning | O conhecimento é **estável** |
| "esse dado muda com frequência?" | **Check, nunca memória** | A pergunta de triagem: "isso expira?" |

**A inversão que este repo cometeu:** guardou em `.md` versionado fatos que são
verificáveis contra o disco — quantos agents existem, qual a versão de um
footer, se um link existe. Conhecimento que muda é fonte viva, nunca cópia.

## 5. O framework aplicado a este repo

| Tipo do problema | Instâncias verificadas no repo | Estratégia correta | O que foi feito |
| --- | --- | --- | --- |
| Regra determinística | 9 checks de drift/preflight, 206 testes de tooling | Determinística — e funciona | ✅ Camada 1 |
| Similaridade semântica | 0 | Vetorial | — (nada a fazer) |
| Relacionamento multi-hop | 0 | Grafo | — (nada a fazer) |
| Especialização de comportamento | 1 caso real (roteamento de reviewer) | Regra, não agentic | ⚠️ chamada de "agentic", é TypeScript com regex |
| Conhecimento que muda | contagens no README, footer de versão, links do AGENTS.md | **Check de drift** | ❌ guardado como memória/prosa → envelheceu |

Os três "0" não são estimativas: são o resultado do `grep` de dependências de
IA acima. Não há superfície vetorial, não há grafo, não há LLM em runtime.

## 6. Onde este repo acertou

1. **Precisão de gate demonstrada nos dois sentidos** — `isDomainFile()`
   (`stack-code-reviewer.ts:52`) é sensível *e* específico, que é a parte
   difícil de gating determinístico.
2. **O pipeline consertou o próprio gate mentiroso** — commit `5490de6`
   moveu a lógica para `apps/api/test/config/coverage-floor.ts`, com spec
   dedicado e caminho ligado em `vitest.config.ts:56`.
3. **Relaxamento de gate documentado e reversível** — `apps/web/vitest.config.ts`
   desliga o piso de 80% com baseline **medido** e gatilho de reativação.
4. **FP → teste nomeado pelo incidente** — `review-router.spec.ts:275` é o
   melhor artefato de aprendizado do repo, e está em código.
5. **Três disparadores independentes para a mesma regra** — `.husky/pre-commit:19`,
   `review-stack.yml:31` e CI; o buraco do `--no-verify` está fechado em `ci.yml:30`.
6. **Correlação memória↔maturidade é real** — onde o agent rodou, a memória
   engordou: `review-router.md` 175, `telemetry-specialist.md` 142,
   `docker-specialist.md` 127 — contra 31 linhas nos agents nunca exercitados.

## 7. Misclassifications — a seção que importa

| O que o repo tentou | O que era de fato | Custo do erro de rótulo |
| --- | --- | --- |
| Camada "agentic" de roteamento | 26 `pattern:` regex em YAML rodados por TypeScript (`review-routing.md:21-104`) | Foi o que deixou `specialist:lint` **fora** do preflight (`grep -c specialist .tooling/scripts/ci/preflight.ts` = **0**) enquanto `review:lint` está dentro (`preflight.ts:50`, que executa `pnpm review:lint`). A camada tratada como "semântica" foi tratada como opcional. |
| Memória acumulada como "fine-tuning" | Fine-tuning de conhecimento que **muda** — proibido pelo framework | `README.md:259` afirmava que os apps "ainda **não foram criados**"; existem, com 40 specs. Corrigido. `docs/MONOREPO.md:262` está em `1.9.0` enquanto a última tag é `v1.8.0` — o drift encolheu de 3 versões para 1, mas a classe é a mesma: fato volatile envelhecendo como se fosse estável, agora sem check que amarre os dois. |
| Arquitetura de 3 camadas escolhida antes do problema | Nenhum problema verificado pede IA | Superfície de manutenção (1849 + 1307 linhas) e 12 furos de costura (§7 + §8), para resolver o que cabia num script de 1,6s. |
| Camada 2 como "barreira de roteamento" | Telemetria | `review-router.ts:350` tem exit 3 sem consumidor algum. Um exit code sem consumidor é uma constante, não um portão. |
| `tdd:check` como verificação de TDD | Task sem dono: declarada no `package.json` como `turbo run tdd:check`, ausente do `turbo.json` e de todo pacote do workspace | **A análise original errou a classe do erro** e a tabela é a prova: afirmava "exit 0 com FULL TURBO em 37ms" (falso verde). Medido: `pnpm tdd:check` → **EXIT=1**, `Could not find task in project`. A task já tinha morrido; o script que a invocava ficou. Quem reportava verde era este documento, não o comando. |
| `release-template.yml` como "automática e idempotente" | Era inerte — o footer tinha regredido para `1.5.0` e `v1.5.0` já existia, então todo push era noop. Footer alinhado em `1.9.0`; a idempotência agora emite `::warning::` em vez de encerrar em silêncio | Idempotência confundida com *correctly*-idempotência: o mecanismo criado para evitar erro mascarava drift. Falta o check que amarra footer↔tag (**BL1**). |
| 3 camadas de `ci-defense-in-depth.md` como barreira | Eram detecção — o ruleset ativo não tinha `required_status_checks`. Agora exige `{context: "quality"}` e `main` só é atualizável por PR | `git-workflow.md:34` afirmava que "branch protection + status checks" **impõem** a regra; a afirmação era verdadeira em prosa e falsa no repo. Restam `required_approving_review_count = 0` e 1 dos 3 contexts exigido. |
| `lint-staged` como lint pelo nome | Formatter — as duas entradas são `prettier --write` | O nome induz a crer em checagem semântica; o conteúdo é formatação. |

## 8. Bypass silencioso — a classe que nenhuma estratégia captura sozinha

O modo de falha mais caro **não** é a estratégia errada por imprecisão. É o
**verde que não significa nada**. Quatro casos, todos verificáveis neste repo:

1. **Gate com stub no caminho** — `apps/api/package.json:7`:
   `"lint": "echo 'apps/api lint stub (real wiring in Phase 3)' && exit 0"`.
   A regra `ddd-hexagonal/no-domain-imports-from-infra` (`packages/eslint-config/index.js:14`),
   apresentada em `docs/STACK.md:126` como guardião mecânico, **nunca executou**
   contra o maior codebase do monorepo.
2. **Gate que roda e não bloqueia** — `grep -c 'process.exit' tooling/scripts/doc-sync.ts`
   → **0**. O `|| exit 1` em `.husky/pre-commit:25` é guarda de crash, não gate.
3. **Token de sucesso ambíguo** — `check-archive-integrity.ts:33-36` faz
   `return { ok: true, errors: [] }` quando `.agents/runs/archive` não existe
   (verificado: inexistente). O painel emite o mesmo `✓` para "verifiquei e
   passou" e para "não havia nada para verificar".
4. **Gate parcial com bypass silencioso** — `check-doc-refs.ts:67` remove
   inline-code **antes** do linkRegex de `:70`; como o regex exige 1+ caractere
   no label, todo link de label 100% inline-code colapsa para `[]()` e nunca
   casa. Agrava o escopo: `preflight.ts:60-61` cobre só `docs` (87 `.md`) e
   `.agents/specs` (27), de 189 `.md` versionados.

**Regra que daí decorre:** o token de sucesso não pode ser o mesmo para
"verifiquei e passou" e "não havia nada para verificar". Todo check que faz
short-circuit por ausência do alvo precisa de um terceiro estado (`skipped`)
com motivo — sem isso o observador perde a capacidade de distinguir ausência de
verificação, que é a pré-condição de auditar qualquer outra coisa.

**E por que o híbrido não salva:** um gate que não pode falhar é **pior** do que
nenhum gate, porque o time para de olhar. Hibridizar multiplica o número de
painéis sem multiplicar o número de sinais — e aqui multiplica os dois com o
mesmo token.

## 9. Como pensar antes de escolher

1. **Defina o tipo do problema antes da tecnologia.** "É igual ao esperado?" ou
   "esse import é proibido?" → regra determinística. O framework autoriza isso
   explicitamente. Vetorial é para similaridade semântica. Grafo é para relação
   multi-hop. Fine-tuning é para especializar comportamento estável.
2. **Esse dado expira?** Se sim, é check de drift, não memória. Contagem de
   arquivos, versão de footer e existência de link são verificáveis contra o
   disco a cada uso.
3. **Nomeie a camada pelo mecanismo, não pela ambição.** Se a decisão sai de
   regex em YAML executada por TypeScript com testes, isso é regra determinística
   com prosa em volta — e vale como tal: ganha CI, ganha hook, ganha TDD.
4. **Gate não ligado não é gate fraco — é pior que ausência**, porque consome
   confiança. Gate que não pode falhar > nenhum gate.
5. **Sub-invocação é o modo de falha mais caro, porque não tem sinal.** Se um
   componente não tem gatilho, ele não é camada, é rascunho. O wiring importa
   mais que a sofisticação.
6. **Defense-in-depth só é defesa se alguma camada for barreira no topo.**
   Verifique o ruleset, não a documentação. Três camadas locais + CI sem
   `required_status_checks` são três vezes telemetria.

## 10. Footer

**Manutenção:** revisar quando `preflight.ts` ganhar ou perder checks, ou quando
a matriz `review-routing.md` mudar de versão.

**Regras aplicadas:** `.agents/specs/conventions/tamanho-e-revisao.md`
(≤300 linhas), `idioma.md` (pt-BR em prosa), `cobertura-testes.md`.

**Documentos relacionados:**
[MONOREPO.md](./MONOREPO.md) ·
[STACK.md](./STACK.md) ·
[ci-defense-in-depth.md](../.agents/specs/conventions/ci-defense-in-depth.md) ·
[review-routing.md](../.agents/specs/conventions/review-routing.md) ·
[specialist-routing.md](../.agents/specs/conventions/specialist-routing.md)

**Status:** Estável. Veredito atribuído: **determinística** como barreira de
primeira linha; agentic como instrumentação de decisão (não como portão);
memória como substrato do julgamento — desde que versionada e alcançável.

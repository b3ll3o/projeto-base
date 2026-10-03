---
name: guard-classes
description: Leva para dentro do repo o diagnostico das 5 classes de guard descobertas ao construir os gates do fluxo de desenvolvimento, conserta a fonte unica do destino da retrospectiva que hoje tem 10 declaracoes divergentes, corrige 2 checks de path de maquina, e liga o unico harness que o repo ja provou e deixou desligado. 4 fases, P0-P2.
version: 2.0.0
updated: 2026-10-03
maintainer: stack-code-reviewer
state_snapshot: ../../../.agents/runs/state-snapshot-20261003T184236Z.md
related:
  - ../../fluxo-desenvolvimento.md
  - ../../../.agents/specs/conventions/retrospective-capture.md
  - ../../../.agents/specs/conventions/ci-defense-in-depth.md
  - ../../../.agents/specs/conventions/demand-archiving.md
  - ../../../.agents/runs/backlog-2026-10-02.md
---

# Plano — Guard Classes

> **Origem:** pendência aberta no fim da demanda `melhorias-fluxo-desenvolvimento`
> (PR #43, mergeado em `ad0ff70`). A trilha versionada das classes está em
> [`.agents/runs/backlog-2026-10-02.md`](../../../.agents/runs/backlog-2026-10-02.md)
> (`X11`–`X14`); a narrativa vive em memória de máquina, fora do repo — por isso
> não há link relativo que a alcance daqui (ver F2.1).
> **Branch:** `feat/guard-classes` (base `main` @ `ad0ff70`) · **Agentes:**
> `stack-code-reviewer` (review por task) · `agent-architect` (F1) · `doc-sync`
> (pós-alteração) · **v2.0.0** reescrito após auditoria — ver §Changelog.

## TL;DR

1. **A causa raiz não é um símbolo indefinido — são 10 declarações sem fonte
   única.** O destino da retrospectiva aparece **10 vezes em 7 arquivos, em 6
   notações**, e **duas são `test -f` executáveis com path de máquina** — a
   classe 1 deste plano, viva e quebrada. Definir `<memory-dir>` arruma 1 de 10.
2. **2 checks estão quebrados agora.** `demand-archiving/SKILL.md:64` e
   `archive-demand.md:30` rodam `test -f /home-leo/…` — verde aqui, vermelho em
   qualquer outra máquina. E `archive-lint.ts:141` só retorna cedo com o
   diretório **ausente**: ele existe e está vazio, então o check 9 renderiza `✓`
   tendo validado **zero** arquivos.
3. **As classes não estão só fora do repo — 4 das 5 têm instância versionada**
   em `backlog-2026-10-02.md` (`X11`–`X14`), com comando de reprodução. O que
   falta não são as cicatrizes: é o **diagnóstico**.
4. **O melhor artefato do PR #43 está desligado.**
   `turbo-redirect-differential.sh` não é invocado por nada (B11) — a mesma
   doença, um nível acima.
5. **A matriz de review-routing tem dentes parciais.** `lint-review-routing.ts:198`
   faz `new RegExp(rule.regex)` e **nunca roda contra um diff**; mas 150–165
   **executam** `path_globs` contra `git ls-files` e avisam quando o padrão casa
   0 arquivos ("dead pattern"). Metade é controle, metade é forma.

## Contexto

Seis defeitos, com a instância real de cada um — nenhuma citada de memória:

| # | Classe | Instância real |
|---|--------|----------------|
| 1 | **Nunca dispara** — condição inalcançável | `doc-sync.resolvePath.spec.ts` com `REPO_ROOT = join('/caminho/que/nao/existe','..','..')`; string com `/` é absoluta em qualquer plataforma, o `if` nunca passa |
| 2 | **Só a forma rara** — cobre `2>&1`, perde `2>/dev/null` | guard de redirect do PR #43 |
| 3 | **Dispara em si mesmo** — o único hit é o comentário que o documenta | sweep `git grep '/home/leo'` |
| 4 | **Erra o eixo** — corta task em vez de cortar redirect | `splitRedirect` (falso negativo silencioso) |
| 5 | **Classe ausente do dado** — a forma defeituosa não existe no repo | `turbo run build >out.log ALVO`; exige diferencial (18 formas, 0 divergentes) |

Adjacente: **ferramenta que reporta sucesso corrompendo** — um `Edit` trocou
`0x27`→`0x22` fora do alvo; o sintoma apareceu numa linha não editada.

Classes 1–4: `X11`–`X14` em `backlog-2026-10-02.md`. Classe 5 e a adjacente:
só em memória de máquina. `base/` é template (`AGENTS.md` §2: `cp -r`), então
quem copia herda os 9 checks e não o diagnóstico das falhas que eles já deram.

### O problema de fundo

O plano B38 deixou esta tese, e ela é o critério de sucesso deste plano:

> *"onde o repo construiu um gate determinístico, ele funciona; onde o controle
> foi declarado em prosa e nunca construído, é fictício — e o pior caso é o que
> reporta verde."*

**Escrever uma convenção em prosa repetiria o defeito.** Por isso há uma fase
de construção por classe, e cada task declara o que **não** é detectável
estaticamente, em vez de prometer um lint que não pega.

## Baseline verificável

Todo número vem com o comando. Sem comando ao lado, o número não vale.

| # | Métrica | Comando | Medido em 2026-10-03 |
|---|---------|---------|----------------------|
| B1 | preflight | `pnpm ci:preflight >/dev/null 2>&1; echo $?` | `0` — **mas** o preflight não roda vitest (comentário em `preflight.ts:3`): `0` aqui nunca foi afirmação sobre a suíte de testes |
| B2 | declarações do destino | `git grep -n -e memory-dir -e claude/projects -e 'memory/b<N' -- '.agents/**/*.md' ':!.agents/runs/state-snapshot-*'` | **10 hits, 7 arquivos, 6 notações**; 2 são `test -f` com path de máquina |
| B3 | memórias versionadas | `ls -1 .agents/memory/ \| wc -l` | **21** = 19 per-agent + `_template` + `state-aware-planning` |
| B4 | results fora do repo | `ls -1 ~/.claude/…/memory/b*-result.md \| wc -l` | **34** |
| B5 | classes por nome | 5 comandos, um por classe: `git grep -icF '<classe>' -- '*.md' ':!docs/superpowers/plans/' ':!.agents/runs/state-snapshot-*'` | **0 · 0 · 0 · 0 · 0** |
| B6 | checks do preflight | `pnpm ci:preflight \| grep -c '• '` | **9** |
| B7 | `.tooling` no workspace | `grep -A4 'packages:' pnpm-workspace.yaml` | **não** |
| B8 | tsconfig / eslint em `.tooling` | `ls .tooling/tsconfig.json .tooling/eslint.config.*` | ambos inexistentes |
| B9 | regra de condição morta no repo | `git grep -lE 'no-unreachable-condition\|no-constant-condition\|no-self-compare' -- '*eslint*'` | **0 arquivos** |
| B10 | check que *detecta* guard | `git grep -icE 'guard\|alcançav\|unreachable' -- '.tooling/scripts/ci/' 'tooling/scripts/' \| grep -v ':0$'` | 3 arquivos, **todos do PR #43**, nenhum é detector |
| B11 | differential ligado? | `git grep -n 'turbo-redirect-differential' -- package.json '.github' '.tooling' 'tooling' \| grep -v spec.ts` | **2 hits, ambos comentários** (`check-package-json-drift.ts:438` e o próprio script). **0 invocações** |
| B12 | review-routing executa o regex? | `sed -n '196,200p' tooling/scripts/lint-review-routing.ts`; `sed -n '150,158p'` | linha **198** compila e nunca roda contra diff; linhas **150–165** rodam `path_globs` e avisam dead pattern |
| B13 | convenções órfãs do índice | `ls -1 .agents/specs/conventions/*.md \| wc -l`; `grep -oE '\]\(\./[a-z-]+\.md\)' .agents/specs/conventions/README.md \| sort -u \| wc -l` | **19 arquivos, 11 linkados, 7 órfãs** |
| B14 | archive vazio | `find .agents/runs/archive -name '*.md' \| wc -l` | **0** — e o check 9 renderiza `✓` |

**Duas leituras que importam.** B7–B10: nenhum check pegaria um guard que nunca
dispara, por três camadas independentes — nenhum check inspeciona condição
alcançável; a pasta onde os guards vivem não está no workspace nem tem tsconfig
nem eslint; e a regra que pegaria condição morta não existe em config nenhum.
B14: [`archive-lint.ts:141`](../../../tooling/scripts/archive-lint.ts#L141) só
retorna cedo quando o diretório está **ausente**; ele existe e tem só
`.gitkeep`, então o linter lê 0 arquivos e `formatMark` renderiza `✓` — enquanto
[`preflight.ts:63-71`](../../../.tooling/scripts/ci/preflight.ts#L63-L71) declara
que `skipped` não pode renderizar `✓`. **É a classe deste plano, viva, dentro
dos 9 que ele certifica como verdes.**

## Índice das fases

| Fase | Escopo | Tasks |
|------|--------|-------|
| 1 | **P0** — o destino: 2 paths de máquina, 1 fonte única, 1 check de concordância | 4 |
| 2 | **P1** — o payload: as 6 classes num artefato do repo, registradas | 3 |
| 3 | **P1** — o registro de dentes: o que cada gate prova, e como se prova | 4 |
| 4 | **P2** — ligar o que já existe e fechar a auto-aplicação | 2 |

---

## Fase 1 — P0: o destino declarado 10 vezes

**Por que primeiro, e por que não é "load-bearing".** F2 escreve artefatos
versionados, que não evaporam — a dependência F1→F2 é de **política**, não
técnica. F1 vem primeiro porque 2 dos 10 pontos estão **quebrados agora**, e
porque 2.1 precisa citar `arquivo:linha` de instâncias que ainda não têm
destino único para onde apontar.

| id | Task | Verificação |
|----|------|-------------|
| 1.1 | Corrigir os 2 `test -f` com path de máquina (`demand-archiving/SKILL.md:64`, `archive-demand.md:30`) para derivar de fonte única | RED: roda com `HOME=/tmp/outro` → **vermelho**; GREEN: com a fonte definida → verde. O RED é o critério: sem ele, o path volta |
| 1.2 | Declarar a **fonte única** do destino num lugar canônico; as outras 9 declarações passam a **referenciar**, não repetir | `git grep -cE 'memory-dir\|claude/projects\|memory/b<N' -- '.agents/**/*.md' ':!.agents/runs/state-snapshot-*'` → todas as ocorrências ou são a definição, ou referenciam a definição |
| 1.3 | Check de **concordância**: extrai o destino de todas as declarações e falha se qualquer uma divergir | RED: mutar 1 das 10 deixa vermelho nomeando o arquivo; GREEN: volta |
| 1.4 | **Arquivar as fontes de evidência** pelo mecanismo que já existe (`demand-archiving.md` + `archive-lint.ts` + frontmatter) | ver §Decisões 1 — ternário, não binário |

**1.3 fecha a pendência.** Não é "definir um símbolo": é a primeira instância do
`3.4` generalizado, e sem ela as próximas 9 declarações voltam a divergir em
silêncio. **E 1.4 tem o mecanismo pronto e não o usa** — o repo já tem
`demand-archiving.md`, o workflow `archive-demand.md`, a skill e um linter de
frontmatter; a v1.0 ofereceu só o binário "backfill / não mover" e **perdeu a
terceira opção**, arquivar as 6 fontes de evidência e deixar as 28 de fora.

## Fase 2 — P1: o payload

| id | Task | Verificação |
|----|------|-------------|
| 2.1 | Convenção das classes com **receita de detecção por classe** — não só definição. **Citar `X11`–`X14` como fonte**, não reescrevê-las | tabela com, por classe: definição, instância com `arquivo:linha`, receita, contra-exemplo, evidência de que a receita funciona |
| 2.2 | Registrar: `AGENTS.md` §6 + índice de `.agents/specs/conventions/README.md` — e fechar as 7 órfãs do índice (B13) | **zero órfãs**: todo `.md` do diretório, exceto o próprio README, aparece linkado no `README.md`. Hoje 19 arquivos, 11 linkados, 7 órfãs |
| 2.3 | Declarar **o que cada classe NÃO é detectável estaticamente** — incluindo os cegos do próprio 3.3 | coluna "detecção" (`estática` \| `harness`) + coluna "não pega", uma linha por classe |

**2.3 é o que impede a convenção de mentir.** Um lint que promete pegar a
classe 5 é pior que nenhum lint: é um guard que nunca dispara, escrito em prosa.
A coluna "não pega" precisa cobrir os três cegos do 3.3 — comentário
auto-acusatório **reformulado** (nenhum grep por string pega), hit
auto-acusatório **allowlisted** (a allowlist é a saída de emergência do 3.3, e o
remédio recria o buraco), e hit legítimo em comentário (sem julgamento humano o
3.3 não separa).

## Fase 3 — P1: o registro de dentes

O controle construído que este plano entrega. Não é um lint por classe — é a
coisa que os 9 checks atuais não têm.

**Ideia:** um registro (`ci-defense-in-depth.md`, seção nova) onde cada gate
declara **como se prova que tem dentes**, e um check que confere o registro
contra a realidade.

| id | Task | Verificação |
|----|------|-------------|
| 3.1 | Mapear os 9 checks: para cada um, qual é a evidência de dentes (mutação, corpus, estado remontado) e onde ela está | **≥ 1 check com mutação medida e o comando ao lado**; o resto pode ser `desconhecida` + justificativa escrita. "9 linhas preenchidas" **não** é critério — enche de `desconhecida` sem provar nada |
| 3.2 | Check que reconcilia registro ↔ preflight: todo check real tem entrada; toda entrada aponta para artefato existente | RED: remover um check do registro → vermelho; GREEN: volta |
| 3.3 | Check da **classe 3** (dispara em si mesmo): todo hit ou foi corrigido, ou tem allowlist cujo motivo não é o comentário | RED: reintroduzir o comentário auto-acusatório → vermelho; GREEN: passa. Limites em 2.3 |
| 3.4 | Check de **controle desligado** — regra geral, duas instâncias: (a) todo harness referenciado é invocado por algo; (b) **toda referência ao destino aponta para o mesmo lugar**. A instância (b) é o 1.3, generalizado | RED: o `turbo-redirect-differential.sh` sem dono, **ou** uma declaração de destino divergente, deixa vermelho nomeando o arquivo; GREEN: ambos ligados |

**3.1 tem que achar o B14 na mão.** Os 9 checks estão mapeados como funcionais;
um deles validou zero arquivos e ainda assim está marcado `✓`. Se 3.1 não
encontrar isso sozinho, o registro está errado.

**Invariante de 3.4 com 4.1 (importante).** Se 4.1 puser o differential no
`ci:local`, **3.4 tem de tratar qualquer script de `package.json#scripts` como
dono válido**, senão fica vermelho para sempre. O invariante é *"existe um
invocador em `preflight.ts` **ou** em `package.json#scripts`"* — não "no
preflight". **Só 3.3 é estática:** a 1 exige semântica de condição, a 2 e a 5
exigem corpus, a 4 exige diferencial contra o sistema real (conteúdo de 2.3).

## Fase 4 — P2: ligar e fechar a auto-aplicação

| id | Task | Verificação |
|----|------|-------------|
| 4.1 | Ligar `turbo-redirect-differential.sh` ao `preflight` **ou** a um script de `ci:local` | rodar o dono **executa** o differential; mutação reintroduzindo o bug antigo deixa **vermelho**. Custo medido: 8,1 s sozinho |
| 4.2 | Auditar o plano contra as próprias classes antes do merge, **gravado em `.agents/runs/`** — não em commit message | arquivo versionado, uma linha por classe: onde este plano poderia cair nela, e por que não cai |

**4.2 não é burocracia.** Um plano que publica uma regra sobre controles
desligados, enquanto entrega um controle desligado, começa falso no primeiro
dia. A saída é um `.md` versionado porque é exatamente esse o meio que
`fluxo-desenvolvimento.md:147` classifica como "Evapora" — entregar o remedy
pelo mecanismo do defeito seria auto-refutação.

## Sequenciamento e dependências

```text
F1.1 (paths de máquina) ──► F1.2 (fonte única) ──► F1.3 (concordância) ──► F3.1..F3.4
F1.4 (arquivar fontes) ──► F2.1 (convenção, cita X11–X14) ──┘                │
F2.2 (registro no índice) corre em paralelo a F2.1 e F3                       ▼
                                                                    F4.1 ──► F4.2
```

## Riscos

| Risco | Sinal | Mitigação |
|-------|-------|-----------|
| Virar só prosa — o defeito que B38 nomeou | 1.3/3.2/3.4 não existem no merge | F3 é pré-requisito de F4, não follow-up |
| O registro de dentes envelhece igual o resto | `desconhecida` aparecendo nas linhas | 3.1 exige justificativa escrita **e ≥ 1 mutação medida** |
| Backfill de 34 arquivos polui o template | PR grande e difícil de revisar | 1.4 é decisão do owner, com 3 opções |
| Custo do differential no CI | preflight passa de ~10 s para ~18 s | 4.1 deixa a escolha (preflight vs `ci:local`) com o owner |
| A demanda cresce | alguém adiciona R-009/R-010/R-011 | ver §Fora de escopo |

## Decisões do owner

1. **O destino dos 34 results (1.4)?** Três saídas, não duas: **(a)** mover tudo
   — deixa o template com 34 arquivos de histórico; **(b)** não mover — repo
   leve, mas quem copia o template herda as regras e nenhuma das falhas;
   **(c)** arquivar só as **6 fontes de evidência** e deixar as 28 de fora.
   **Recomendo (c)**: usa o mecanismo de archive que o repo já tem, custa pouco,
   e entrega o que o TL;DR 3 diz que falta.
2. **O differential no `preflight` ou no `ci:local` (4.1)?** Exige `pnpm turbo` e
   um workspace temporário. Custo medido: **8,1 s** contra um preflight de ~10 s.
   **Recomendo `ci:local`** — quase dobra o primeiro gate de todo push de PR.
3. **A convenção nova entra no índice (2.2)?** 7 de 19 já não entram. Há duas
   leituras — o índice morreu, ou foi esquecido. O plano assume que **morreu** e
   fecha; se o owner preferir o contrário, 2.2 inverte.

## Como validar o plano inteiro

```bash
pnpm ci:local                                            # o que o CI roda
bash .tooling/scripts/ci/turbo-redirect-differential.sh  # 18 formas, 0 divergentes, 8,1 s
pnpm ci:preflight                                        # deve incluir os checks novos
git grep -n -e memory-dir -e claude/projects -e 'memory/b<N' -- '.agents/**/*.md' \
  ':!.agents/runs/state-snapshot-*'                      # == nº de declarações, nenhuma divergente
```

**Quatro ressalvas que a validação acima esconde, todas medidas:**

1. **Só enxerga o que está versionado.** `check-doc-refs` enumera com
   `git ls-files` (`check-doc-refs.ts:152`), então um `.md` novo ainda não staged
   passa **fora** de todo check de link. Use `git add -N <arquivo>` antes.
2. **Não prova que o gate tem dentes.** Verde sobre a árvore já verde é o estado
   em que todo gate falso-verde parece legítimo.
3. **Não cobre a suíte de testes.** B1 = `0` vem de um gate que não roda vitest.
   Havia um teste vermelho versionado na árvore durante a escrita deste plano,
   com o preflight verde.
4. **Não vê o próprio registro.** O B5 da v1.0 usava `-E` com `\|`, que sob
   `-E` é pipe literal: casava a string inteira e **0 arquivos**, medindo outra
   coisa. E ao incluir o próprio snapshot, casou as classes no arquivo que as
   registrava. Daí B5 virar **5 comandos, um por classe**, snapshot excluído.

A validação que **conta** é a mutação: cada check novo tem de ficar
**vermelho** quando o defeito que ele caça é reintroduzido. Check que continua
verde sob mutação não pega nada — e é a classe que este plano nomeia.

## Fora de escopo

Explicitamente **não** entram: **R-009** (nenhum gate lê `.github/workflows/`)
e **R-010** (`.md` fora do `format:check`) — pedidos separados; **R-011 / X5**
(`.tooling` sem tsconfig) — mudar a topologia do monorepo é maior que esta
demanda, mas B7–B9 registram por que a detecção de classes é limitada; **X9**
(path de máquina em `note`) — cosmético; **Husky deprecated**; e lint para as
classes 1, 2, 4 e 5 — exige corpus ou diferencial, registrado em 2.3 como
limitação explícita, não como esquecimento.

## Checklist de revisão (aplicado a este arquivo)

- [x] `wc -l` ≤ 300 — medido
- [x] Referências cruzadas resolvem — cada path do frontmatter testado com `test -e`
- [x] Todo claim numérico tem comando ao lado (B1–B14, M1–M20 do snapshot)
- [x] pt-BR, sem placeholders, tabelas consistentes
- [x] Limitações declaradas (2.3, §Fora de escopo), não escondidas

## Changelog

- **v2.0.0** (2026-10-03): reescrito após auditoria adversarial que **refutou a
  causa raiz** da v1.0. 4 fases, 13 tasks, baseline B1–B14 corrigido.

  | v1.0 afirmava | Medido | Correção |
  |---|---|---|
  | causa raiz = `<memory-dir>` indefinido | **10 declarações, 6 notações, 2 executáveis com path de máquina** | 1.1–1.3: fonte única + check de concordância |
  | "F1→F2 é load-bearing" (F2 evapora) | F2 escreve artefato versionado | dependência de política, declarada como tal |
  | B5: 1 comando, 0 hits | o `\|` sob `-E` é pipe literal, e o comando casa o próprio registro | 5 comandos, snapshot excluído |
  | frontmatter: 4 de 5 caminhos quebrados | `../../` de `plans/` é `docs/`, não a raiz | corrigido — e a correção é heterogênea |
  | baseline "working tree clean" | havia 1 teste vermelho versionado | snapshot corrigido |
  | review-routing "não serve de carregador" | `path_globs` **têm** dentes; só `diff_patterns.regex` não | TL;DR 5 corrigido |
  | 1.3 = backfill binário | o repo já tem `archive-lint` + `demand-archiving` | 1.4 virou ternário |
  | 4.2 = linha no commit message | é o meio que `fluxo-desenvolvimento.md:147` marca "Evapora" | 4.2 grava `.md` versionado |

- v1.0.0 (2026-10-03): plano inicial, origem: pendência do PR #43. **Superado:**
  diagnosticava a causa raiz errado e trazia um comando de baseline que media a
  coisa errada.

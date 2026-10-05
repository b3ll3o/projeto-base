---
name: guard-classes
description: Leva para dentro do repo o diagnostico das 5 classes de guard descobertas ao construir os gates do fluxo de desenvolvimento, conserta a fonte unica do destino da retrospectiva que hoje tem 10 declaracoes divergentes, corrige o unico check de path de maquina e a notacao em prosa que o repete, e liga o unico harness que o repo ja provou e deixou desligado. 4 fases, P0-P2.
version: 2.1.0
updated: 2026-10-05
maintainer: stack-code-reviewer
state_snapshot: ../../../.agents/runs/state-snapshot-20261003T184236Z.md
related:
  - ./2026-10-03-guard-classes-baseline.md
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
> (`X8`, `X10`–`X12`); a narrativa vive em memória de máquina, fora do repo — por isso
> não há link relativo que a alcance daqui (ver F2.1).
> **Branch:** `feat/guard-classes` (base `main` @ `ad0ff70`) · **Agentes:**
> `stack-code-reviewer` (review por task) · `agent-architect` (F1) · `doc-sync`
> (pós-alteração) · **v2.1.0** corrigido após auditoria adversarial — ver §Changelog.

## TL;DR

1. **A causa raiz não é um símbolo indefinido — são 10 declarações sem fonte
   única.** O destino da retrospectiva aparece **10 vezes em 7 arquivos, em 6
   notações**, e **uma delas é um `test -f` executável com path de máquina** — a
   classe 1 deste plano, viva e quebrada. Definir `<memory-dir>` arruma 1 de 10.
2. **2 coisas estão quebradas agora.** `demand-archiving/SKILL.md:64` roda
   `test -f .claude/projects/-home-leo-…/memory/<retro>.md` dentro de um fence
   `bash` — e **`.claude` não existe no repo**: `ls -d .claude` → *No such file*.
   Não é "verde aqui, vermelho fora"; é **falso em toda máquina, daqui
   inclusive**, porque o caminho depende de um CWD que ninguém especificou.
   `archive-demand.md:30` cita `test -f` com reticências, mas é **prosa de
   checklist**: corrigi-lo é normalizar notação, não consertar check. E
   `archive-lint.ts:141` só retorna cedo com o diretório **ausente**: ele existe
   e está vazio, então o check 9 renderiza `✓` validando **zero** arquivos.
3. **As classes não estão só fora do repo — 3 das 5 catalogadas têm entrada
   própria** no backlog: `X8` (classe 1), `X10`+`X11` (classe 4), `X12` (classe 5),
   cada uma com comando de reprodução. Falta o **diagnóstico**, não as cicatrizes.
4. **A matriz de roteamento não alcança onde os 9 checks vivem.**
   `review-routing.md:84` declara `tooling/scripts/ci/**` — **0 arquivos
   tracked**; o real é `.tooling/scripts/ci/`, com 16. E a regra não tem
   `blocking: true`, então o detector de dead pattern de
   `lint-review-routing.ts:150`, que só roda `if (rule.blocking === true)`, está
   **escopado fora exatamente deste caso**. O melhor artefato do PR #43
   (`turbo-redirect-differential.sh`) também não é invocado por nada (B11).
5. **A matriz de review-routing tem dentes parciais.** `lint-review-routing.ts:198`
   faz `new RegExp(rule.regex)` e **nunca roda contra um diff**; mas 150–165
   **executam** `path_globs` contra `git ls-files` e avisam quando o padrão casa
   0 arquivos.

## Contexto

Cinco classes de guard, com a instância real de cada uma — nenhuma citada de
memória:

| # | Classe | Instância real |
|---|--------|----------------|
| 1 | **Nunca dispara** — condição inalcançável | `review-routing.md:84` declara `tooling/scripts/ci/**`; **0 arquivos** casam, e o detector que denunciaria está atrás de um `blocking: true` que a regra não tem |
| 2 | **Só a forma rara** — cobre `2>&1`, perde `2>/dev/null` | guard de redirect do PR #43 |
| 3 | **Dispara em si mesmo** — o único hit é o comentário que o documenta | sweep `git grep '/home/leo'` |
| 4 | **Erra o eixo** — corta task em vez de cortar redirect | `splitRedirect` (falso negativo silencioso) |
| 5 | **Classe ausente do dado** — a forma defeituosa não existe no repo | `turbo run build >out.log ALVO`; exige diferencial (18 formas, 0 divergentes) |

**Adjacentes (2).** **Ferramenta que reporta sucesso corrompendo** — um `Edit`
trocou `0x27`→`0x22` fora do alvo, e o sintoma apareceu numa linha não editada.
**Claim numérico que envelhece** (o 7º item, da auditoria) — `X8` afirma
`git grep '/home/' -- '*.ts'` → **0**; são **3** (B18), e a ressalva 5 diz por que
importa mais que o número.

**Inventário: 7 itens** — as 5 da tabela + estes 2, e é sobre esse número que 2.3
e 4.2 iteram. As classes 1, 4 e 5 têm entrada própria no backlog (`X8`,
`X10`+`X11`, `X12`); as classes 2 e 3 e as 2 adjacentes só em memória de máquina.
`base/` é template (`AGENTS.md` §2: `cp -r`), então quem copia herda os 9 checks e
não o diagnóstico das falhas que eles já deram.

### O problema de fundo

> *"onde o repo construiu um gate determinístico, ele funciona; onde o controle
> foi declarado em prosa e nunca construído, é fictício — e o pior caso é o que
> reporta verde."* (tese do plano B38, e o critério de sucesso deste)

**Escrever uma convenção em prosa repetiria o defeito.** Por isso há uma fase de
construção por classe, e cada task declara o que **não** é detectável, em vez de
prometer um lint que não pega.

## Baseline verificável

As 18 medições (B1–B18) vivem em
**[`2026-10-03-guard-classes-baseline.md`](./2026-10-03-guard-classes-baseline.md)**,
com o comando ao lado de cada número; as tasks citam as linhas pelo id (B7, B14,
B15, B17) sem repetir a tabela. **Regra:** sem comando, o número não vale.

## Índice das fases

| Fase | Escopo | Tasks |
|------|--------|-------|
| 1 | **P0** — o destino: 1 `test -f` quebrado + 1 notação divergente, 1 fonte única, 1 check de concordância | 4 |
| 2 | **P1** — o payload: as 5 classes de guard + 2 adjacentes, registradas | 3 |
| 3 | **P1** — o registro de dentes: o que cada gate prova, e como se prova | 4 |
| 4 | **P2** — ligar o que já existe e fechar a auto-aplicação | 2 |

---

## Fase 1 — P0: o destino declarado 10 vezes

**Por que primeiro, e por que não é "load-bearing".** F2 escreve artefatos
versionados, que não evaporam — a dependência F1→F2 é de **política**, não
técnica. F1 vem primeiro porque 1 dos 10 pontos está **quebrado agora**, e
porque 2.1 precisa citar `arquivo:linha` de instâncias que ainda não têm
destino único para onde apontar.

| id | Task | Verificação |
|----|------|-------------|
| 1.1 | Corrigir o `test -f` **executável** (`demand-archiving/SKILL.md:64`, num fence `bash`, slug de máquina) e normalizar a notação da **prosa** que o repete (`archive-demand.md:30`, item de checklist com reticências) — as duas derivam da fonte única | RED: **o `test -f` da SKILL, rodado da raiz do repo, dá falso hoje** (B15); GREEN: com a fonte definida, dá verdadeiro. Sem o RED, o path volta. A linha de `archive-demand.md` **não tem RED possível** — não é executável; a prova dela é o check de 1.3 |
| 1.2 | Declarar a **fonte única** do destino num lugar canônico; as outras 9 declarações passam a **referenciar**, não repetir | `git grep -oE 'memory-dir\|claude/projects\|memory/b<N' -- '.agents/**/*.md' ':!.agents/runs/state-snapshot-*' \| wc -l` → hoje **11 ocorrências**; GREEN = **1** (só a definição). A forma anterior (`-cE` com `\|` escapado) casava pipe literal, dava `exit 1` sem saída e era satisfeita **vacuamente pelo conjunto vazio** — um critério que passa com zero trabalho. O `-o` conta **ocorrências**, não linhas: o `10` do TL;DR é de `-n`, e `SKILL.md:64` casa 2× — sob `-n` uma duplicata na mesma linha passaria como 1 |
| 1.3 | Check de **concordância**: extrai o destino de todas as declarações e falha se qualquer uma divergir | RED: mutar 1 das 10 deixa vermelho nomeando o arquivo; GREEN: volta |
| 1.4 | **Arquivar as fontes de evidência** pelo mecanismo que já existe (`demand-archiving.md` + `archive-lint.ts` + frontmatter) | ver §Decisões 1 — ternário, não binário |

**1.3 fecha a pendência.** Não é "definir um símbolo": é a primeira instância do
`3.4` generalizado, e sem ela as próximas 9 declarações voltam a divergir em
silêncio. **E 1.4 tem o mecanismo pronto e não o usa** — o repo já tem
`demand-archiving.md`, o workflow, a skill e o linter de frontmatter; a v1.0
ofereceu só o binário "backfill / não mover" e **perdeu a terceira opção**,
arquivar as 6 fontes e deixar as 28 de fora.

## Fase 2 — P1: o payload

| id | Task | Verificação |
|----|------|-------------|
| 2.1 | Convenção das classes com **receita de detecção por classe** — não só definição. **Citar `X8`/`X10`–`X12` como fonte**, não reescrevê-las | tabela com, por classe: definição, instância com `arquivo:linha`, receita, contra-exemplo, evidência de que a receita funciona |
| 2.2 | Registrar: `AGENTS.md` §6 + índice de `.agents/specs/conventions/README.md` — fechar as 7 órfãs (B13) **e corrigir o claim `X8`, que afirma `git grep '/home/' -- '*.ts'` → 0 e mede 3 (B18)**: claim numérico falso em doc versionado viola a regra de verificabilidade de `tamanho-e-revisao.md` | **zero órfãs**: todo `.md`, exceto o README, linkado no índice — 19 arquivos, 11 linkados, 8 não-linkados, 1 deles é o README (B13). E `git grep -c '/home/' -- '*.ts' ':!*.spec.ts'` → **0**, com a exclusão **e o motivo escritos no backlog** — sem ela o `0` exigiria apagar o fixture e o comentário que provam que a allowlist da doc-refs não volta |
| 2.3 | Declarar **o que cada classe NÃO é detectável estaticamente** — incluindo os cegos do próprio 3.3 | coluna "detecção" (`estática` \| `harness`) + coluna "não pega", uma linha por classe |

**2.3 é o que impede a convenção de mentir.** Um lint que promete pegar a
classe 5 é pior que nenhum lint: é um guard que nunca dispara, escrito em prosa.
A coluna "não pega" cobre os **7 itens** do inventário (Contexto) e os três cegos
do 3.3: comentário auto-acusatório **reformulado** (nenhum grep pega), hit
auto-acusatório **allowlisted** (a allowlist é a saída de emergência, e o remédio
recria o buraco), e hit legítimo em comentário (sem julgamento humano o 3.3 não
separa).

## Fase 3 — P1: o registro de dentes

O controle construído que este plano entrega. Não é um lint por classe — é a
coisa que os 9 checks atuais não têm: um registro
(`ci-defense-in-depth.md`, seção nova) onde cada gate declara **como se prova
que tem dentes**, e um check que confere o registro contra a realidade.

| id | Task | Verificação |
|----|------|-------------|
| 3.1 | Mapear os 9 checks: para cada um, qual é a evidência de dentes (mutação, corpus, estado remontado) e onde ela está | **≥ 1 check com mutação medida e o comando ao lado**; o resto pode ser `desconhecida` + justificativa escrita. "9 linhas preenchidas" **não** é critério — enche de `desconhecida` sem provar nada |
| 3.2 | Check que reconcilia registro ↔ preflight **e** registro ↔ roteamento: todo check real tem entrada; toda entrada aponta para artefato existente; **e todo check mora num diretório que alguma regra de roteamento alcança** (B17) | 2 REDs distintos. **Registro**: remover um check → vermelho nomeando-o. **Roteamento**: o **estado atual já é o RED** — `review-routing.md:84` casa 0 arquivos tracked enquanto os 16 de `.tooling/scripts/ci/` não têm rota; corrigir a 84 **é o GREEN** (0 → 16), e com `blocking: true` o detector de dead pattern passa a rodar. Trocar a rota para `.tooling/scripts/ci/**` sem rota não é mutação possível: seria a correção |
| 3.3 | Check da **classe 3** (dispara em si mesmo): todo hit ou foi corrigido, ou tem allowlist cujo motivo não é o comentário | RED: reintroduzir o comentário auto-acusatório → vermelho; GREEN: passa. Limites em 2.3 |
| 3.4 | Check de **controle desligado** — regra geral, duas instâncias: (a) todo harness referenciado é invocado por algo; (b) **toda referência ao destino aponta para o mesmo lugar**. A instância (b) é o 1.3, generalizado | **O aceite é o check disparar, não ele virar verde.** Um detector de dívida nasce vermelho: (a) só esverdeia em 4.1, quando o differential ganha dono. Prova: introduzir um **segundo** harness sem dono → o check nomeia os dois; a instância (b) esverdeia já em 1.3 |

**3.1 tem que achar duas coisas na mão.** Os 9 checks estão mapeados como
funcionais; **um validou zero arquivos e ainda assim está marcado `✓`** (B14), e
**um nem roda** — `check-types` está na Tabela de Checks com custo e propósito,
mas não no array `checks` (B16). Se 3.1 não achar as duas sozinho, o registro
está errado: a segunda é a própria F3 FAIL — um registro de dentes com um check
sem dentes.

**Invariante de 3.4 com 4.1 (importante).** Se 4.1 puser o differential no
`ci:local`, **3.4 tem de tratar qualquer script de `package.json#scripts` como
dono válido**. O invariante é *"existe um invocador em `preflight.ts` **ou** em
`package.json#scripts`"* — não "no preflight". **Só 3.3 é estática:** a 1 exige
semântica de condição, a 2 e a 5 corpus, a 4 diferencial contra o sistema real.

**Restrição operacional de 3.2:** `review-routing.md` está em **297/300 linhas**
(`wc -l`). Corrigir a rota de B17 é trocar um token, mas qualquer entrada nova
exige antes extrair um cenário para `review-routing-examples.md` (precedente do
fix v1.3). `review-routing-examples.md` está em 104/300 e é o destino.

## Fase 4 — P2: ligar e fechar a auto-aplicação

| id | Task | Verificação |
|----|------|-------------|
| 4.1 | Ligar `turbo-redirect-differential.sh` ao `preflight` **ou** a um script de `ci:local` | rodar o dono **executa** o differential; mutação reintroduzindo o bug antigo deixa **vermelho**. Custo medido: 8,2 s sozinho |
| 4.2 | Auditar o plano contra as próprias classes antes do merge, **gravado em `.agents/runs/`** — não em commit message | arquivo versionado, uma linha por classe: onde este plano poderia cair nela, e por que não cai |

**4.2 não é burocracia.** Um plano que publica uma regra sobre controles
desligados, enquanto entrega um controle desligado, começa falso no primeiro dia.
A saída é um `.md` versionado porque é o meio que `fluxo-desenvolvimento.md:147`
classifica como "Evapora" — entregar o remédio pelo mecanismo do defeito seria
auto-refutação.

## Sequenciamento e dependências

```text
F1.1 (path de máquina + notação) ─► F1.2 (fonte única) ─► F1.3 (concordância) ─► F3.1..F3.4
F1.4 (arquivar) ─► F2.1 (convenção, cita X8/X10-X12) ─┘            │
F2.2 (índice + claim X8) em paralelo a F2.1 e F3                   ▼
                                          3.4(a) fica VERMELHO até ── F4.1 ─► F4.2
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
   um workspace temporário. Custo medido: **8,2 s** contra um preflight de ~10 s.
   **Recomendo `ci:local`** — quase dobra o primeiro gate de todo push de PR.
3. **A convenção nova entra no índice (2.2)?** Das 19 convenções, 11 são
   linkadas e 8 não (B13): 7 órfãs de verdade, mais o `README.md`, que
   corretamente não se linka a si mesmo. Há duas leituras — o índice morreu, ou
   foi esquecido. O plano assume que **morreu** e fecha; se o owner preferir o
   contrário, 2.2 inverte.

## Como validar o plano inteiro

```bash
pnpm ci:local                                            # o que o CI roda
bash .tooling/scripts/ci/turbo-redirect-differential.sh  # 18 formas, 0 divergentes, 8,2 s
pnpm ci:preflight                                        # deve incluir os checks novos
git grep -n -e memory-dir -e claude/projects -e 'memory/b<N' -- '.agents/**/*.md' \
  ':!.agents/runs/state-snapshot-*'                      # == nº de declarações, nenhuma divergente
```

**Cinco ressalvas que a validação acima esconde, todas medidas:**

1. **Só enxerga o que está versionado.** `check-doc-refs` enumera com
   `git ls-files` (`check-doc-refs.ts:152`): um `.md` novo e não-staged sai
   **fora** de todo check de link. Use `git add -N <arquivo>` antes.
2. **Não prova que o gate tem dentes.** Verde sobre a árvore já verde é o estado
   em que todo gate falso-verde parece legítimo.
3. **Não cobre a suíte de testes.** B1 = `0` vem de um gate que não roda vitest.
   Havia um teste vermelho versionado na árvore aqui, com o preflight verde.
4. **Não vê o próprio registro.** O B5 da v1.0 casava pipe literal sob `-E`, e
   ao incluir o próprio snapshot casou as classes no arquivo que as registrava.
   Daí 5 comandos, um por classe, snapshot excluído.
5. **Não envelhece junto com o repo.** B18 é o exemplo: um `0` que era verdade
   virou **3**, e o comando que o provava não foi reexecutado. Reexecute todo
   claim numérico antes de citá-lo, mesmo com o comando escrito ao lado.

A validação que **conta** é a mutação: cada check novo tem de ficar **vermelho**
quando o defeito que ele caça é reintroduzido. Check verde sob mutação não pega
nada — e é a classe que este plano nomeia.

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
- [x] Todo claim numérico tem comando ao lado (B1–B18 no baseline, M1–M20 do snapshot)
- [x] pt-BR, sem placeholders, tabelas consistentes
- [x] Limitações declaradas (2.3, §Fora de escopo), não escondidas

## Changelog

- **v2.1.0** (2026-10-05): 2 workflows adversariais (13 e 12 agentes) tentaram
  refutar o plano, e **as claims que caíram eram todas minhas** — a mais grave, o
  critério da **1.2 era inerte**: casava pipe literal, saía `exit 1` e passava
  **vacuamente pelo conjunto vazio**, exatamente a forma que o v2.0 declarava ter
  corrigido. Também: "2 `test -f`" é **1** (contei em vez de classificar — classe
  4); a 2.2 exigia `0` hits de `/home/`, o que apagaria o fixture que prova a
  allowlist fechada (classe 3); e os critérios de 3.2 e 3.4 estavam invertidos — a
  mutação nomeada era o GREEN, e o GREEN declarado dependia de 4.1. **A ressalva 5
  mordeu:** `8,1 s` → **8,2 s**. Cada correção está no ponto, com o comando;
  medições e leituras em [`-baseline.md`](./2026-10-03-guard-classes-baseline.md).

- **v2.0.0** (2026-10-03): reescrito após auditoria adversarial que **refutou a
  causa raiz** da v1.0 — que era "`<memory-dir>` indefinido", quando o medido
  são 10 declarações sem fonte única. A auditoria também pegou: o `-E` com `\|`
  do B5 medindo a coisa errada, 4 de 5 caminhos do frontmatter quebrados, o
  snapshot afirmando `working_tree: clean` com um teste vermelho na árvore, e
  "F1→F2 é load-bearing" sendo falso (F2 escreve artefato versionado). 4 fases,
  13 tasks, baseline B1–B14. O diff completo está em `8b57731`.

- v1.0.0 (2026-10-03): plano inicial, do PR #43. **Superado:** causa raiz errada e
  comando de baseline que media a coisa errada.

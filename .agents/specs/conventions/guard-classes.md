---
name: guard-classes
version: 1.0
updated: 2026-10-05
maintainer: stack-code-reviewer
description: "Convenção canônica das 7 classes de guard — como cada uma se manifesta, a receita de detecção por classe (o que procurar, o contra-exemplo, e a evidência medida de que a receita pega), e — criticamente — o que cada classe NÃO é detectável estaticamente. Existe para que um guard futuro não repita um modo de falha que o repo já pagou."
---

# Convenção: `guard-classes` (as 7 classes de guard)

> pt-BR: define as **7 classes** pelas quais um controle determinístico falha
> reportando verde, a **receita de detecção** de cada uma, e a coluna
> **"não pega"** — o que nenhuma receita estática cobre. Escrita em prosa
> apenas seria a classe 3 dela mesma: um guard que promete pegar algo que
> não pega é pior que nenhum.
>
> **Escopo desta convenção é um guard de CI, um hook, um preflight, ou um
> check em `package.json#scripts` que valida algo determinístico.** Um
> documento que *descreve* um comportamento não é guard, e por isso não cai
> nestas classes (com uma exceção declarada em §3, item 7).

## §1 As 7 classes

| # | Classe | Instância real no repo | Fonte | Detecção |
|---|--------|--------------------------|-------|----------|
| 1 | **Nunca dispara** — condição inalcançável | `review-routing.md:84` declara `tooling/scripts/ci/**` → **0** arquivos tracked; o real é `.tooling/scripts/ci/**` → **19** | [`X8`](../../runs/backlog-2026-10-02.md) (mesma *forma*, `isAbsolute`) | estática |
| 2 | **Só a forma rara** — cobre `2>&1`, perde `2>/dev/null` | guard de redirect do PR #43: 6 formatos vazavam | — (memória `b39`) | estática + corpus |
| 3 | **Dispara em si mesmo** — o único hit é o comentário que o documenta | sweep de path-de-máquina do PR #43 (o hit virou fixture) | [`X8`](../../runs/backlog-2026-10-02.md) (o hit virou fixture) | estática + julgamento |
| 4 | **Erra o eixo** — corta task em vez de cortar redirect | `splitRedirect` devolvia `[]` → caller pulava o script sem `skipped` | [`X10`+`X11`](../../runs/backlog-2026-10-02.md) | harness |
| 5 | **Classe ausente do dado** — a forma defeituosa não existe no repo | `turbo run build >out.log ALVO` (não existe em nenhum `package.json`) | [`X12`](../../runs/backlog-2026-10-02.md) | harness |
| 6 | **Ferramenta reporta sucesso corrompendo** | `Edit` trocou `0x27`→`0x22` fora do alvo; sintoma (`Unterminated string literal`) apareceu numa linha não editada | — (memória `b39`) | **nenhuma** (ver §3) |
| 7 | **Claim numérico que envelhece** | `X8` afirmava `git grep '/home/' -- '*.ts'` → 0; hoje são **3** | [`X8`](../../runs/backlog-2026-10-02.md) (corrigido na task 2.2) | estática (re-medição) |

> **As classes 1, 4 e 5 têm entrada própria no backlog** (`X8`, `X10`+`X11`,
> `X12`) com comando de reprodução. Esta convenção **não reescreve** esses
> itens — ela os **cita** e acrescenta a receita, que o backlog não tinha.

## §2 Receita de detecção por classe

Para cada classe: **o que procurar** → **comando** → **contra-exemplo** (a
forma que passa e não deveria) → **evidência medida** de que a receita pega.

### 1 — Nunca dispara

- **O que procurar:** um `pattern`/`glob`/`path` declarado cujo conjunto
  resolvido é **vazio**, e cuja intenção era não-vazia.
- **Comando:** `git ls-files '<glob-do-guard>' | wc -l` → 0, com o diretório
  irmão real contando > 0.
- **Contra-exemplo:** `tooling/scripts/ci/**` (0) quando o guard vive em
  `.tooling/scripts/ci/**` (19). O prefixo de `.` some e nada acusa.
- **Evidência:** `git ls-files 'tooling/scripts/ci/**' | wc -l` → **0**;
  `git ls-files '.tooling/scripts/ci/**' | wc -l` → **19**. Medido 2026-10-05.

### 2 — Só a forma rara

- **O que procurar:** um parser/guard que enumera **variantes**; contar se
  alguma variante **comum** ficou de fora.
- **Comando:** contar quantos nomes de script alcançáveis o guard NÃO cobre:
  `git ls-files '*package.json'` → 7 arquivos → **27 nomes / 53 ocorrências**
  de scripts; o guard cobria 21, 6 vazavam.
- **Contra-exemplo:** cobrir `2>&1`, `&>` e `>` mas deixar `2>/dev/null` — a
  forma que o mundo realmente usa.
- **Evidência:** 6 formatos vazando, medido sobre os nomes reais do repo.

### 3 — Dispara em si mesmo

- **O que procurar:** um sweep cujo único hit é o **comentário/fixture** que
  o documenta.
- **Comando:** rodar o sweep; se o hit está numa linha que o próprio guard
  escreveu (fixture, comentário de método, exemplo), é classe 3.
- **Contra-exemplo:** o sweep de path-de-máquina do PR #43 casou a **regra
  que ele mesmo havia escrito** no `.ts` de detecção, e passou a acusá-la.
- **Evidência:** o `check-memory-dir-concordance` exclui `.agents/runs` e
  aceita `*.spec.ts` — porque os hits lá são o defeito **descrito**, não uma
  reintrodução. Ver o motivo escrito no código.

### 4 — Erra o eixo

- **O que procurar:** um guard cujo eixo de corte é o **objeto errado** —
  onde a intenção é "corte o redirect" e ele corta a task, ou vice-versa.
- **Comando:** só um **diferencial contra o caller real**; um spec do parser
  isolado não pega, porque as 3 versões tinham spec verde.
- **Contra-exemplo:** `splitRedirect` tratava o token inteiro como redirect e
  devolvia `[]`; o caller caía em `referenced.length === 0` e pulava o script
  inteiro, sem erro e sem `skipped`.
- **Evidência:** reprodução contra o turbo 2.11.2 real.

### 5 — Classe ausente do dado

- **O que procurar:** a forma defeituosa **não aparece nos dados do repo** —
  logo nenhum spec escrito a partir do repo a cobre.
- **Comando:** `git ls-files '*package.json' | xargs grep -l 'forma-defeituosa'`
  → 0 arquivos. Se 0, spec-escrito-a-partir-dos-dados é cego.
- **Contra-exemplo:** `turbo run build >out.log ALVO` não existe em nenhum
  `package.json` — a forma com task após redirect.
- **Evidência:** exige **diferencial** (18 formas contra o sistema real, 0
  divergentes); ver `turbo-redirect-differential.sh`.

### 6 — Ferramenta reporta sucesso corrompendo

- **O que procurar:** um `Edit`/escrita cujo **efeito colateral** fica longe
  do alvo e o sintoma aparece noutro lugar.
- **Evidência de detecção:** **hexdump contra `git show HEAD:<file>`** — não
  há comando que previna; a defesa é o diff byte-a-byte no commit.

### 7 — Claim numérico que envelhece

- **O que procurar:** um número **sem derivação** num `.md` versionado.
- **Comando:** re-rodar o comando que o número afirma, **no mesmo dia** que
  for ler, e se o número não estiver lá, corrigir o `.md` (não o código).
- **Contra-exemplo:** `X8` afirmava `0` hits de `/home/`; quando medido, 3.
- **Evidência:** o sweep do `X8` é exatamente o que a task 2.2 do plano
  `guard-classes` corrigeu, com o comando e as exclusões **escritos no
  backlog** — porque um `0` que só fecha com exclusão escondida é um gate
  que não dispara.
- **A variante que um guard de reconciliação não pega (2026-10-05).** O registro
  de dentes em `ci-defense-in-depth.md` **tinha** o comando de cada RED ao lado
  do número esperado, e `check-teeth-registry` reconcilia toda linha. Três
  números envelheceram assim mesmo: a classe 3 dizia **9** (são **8**) e o
  comando 4 dizia "8 dos **9** gates" (são **12 dos 13** — a tabela cresceu de
  9 para 13). As mutações eram as mesmas; mudou o corpus. **O guard validava o
  endereço da claim — o `path` da linha — e não a claim.** Reconciliar onde a
  evidência mora não a impede de envelhecer; só reexecutar o comando, no dia da
  leitura, impede.
- **Por que o registro não se autoprotege:** `check-teeth-registry` **não pode**
  reexecutar os REDs de todos os gates em cada preflight — o registro documenta
  o vermelho de gates que ele próprio não é. A defesa é o que o §2 já exige (o
  comando ao lado do número) mais a auditoria que rodou todos uma vez e corrigiu
  o que divergiu.

## §3 O que cada classe NÃO é detectável estaticamente

> **A coluna mais importante desta convenção.** Um lint que promete pegar a
> classe 5 é pior que nenhum lint: é um guard que nunca dispara, escrito em
> prosa. O que segue é o **chão de cobertura** — declarado, não escondido.

| Classe | "Não pega" — o que nenhum sweep estático pega |
|--------|--------------------------------------------------|
| 1 | Intenção errada **sem ocorrência no repo**. Se a forma certa também não existe nos dados, um sweep de "o glob casa 0" não distingue "rule incorreta" de "rule describing something absent" — só diff contra o caso de uso real separa. |
| 2 | A variante que ninguém **escreveu** ainda. Contar variantes conhecidas só prova cobertura do que se conhece; a forma comum esquecida tem de vir do **corpus real** (os 27 nomes de script), não de imaginação. |
| 3 | Hit **allowlisted** (a allowlist é a saída de emergência, e o remédio recria o buraco) e hit legítimo em comentário **reformulado** (nenhum grep pega, porque não é mais o mesmo texto). |
| 4 | **Errar o eixo** só se manifesta no **caller**, não no parser. Spec do parser verde + caller vermelho é o estado que o repo já teve 3×. |
| 5 | Por definição: a forma **não está no dado**, então nenhum spec derivado do dado a cobre. Só **diferencial contra o sistema real**. |
| 6 | **Nenhuma** detecção estática — nem grep, nem hexdump finds o *momento* da corrupção; só o diff byte-a-byte contra `HEAD` no commit. |
| 7 | Um número que **ainda** está certo envelhece depois; o sweep passa enquanto ele é verdade. A defesa é **re-medir no dia da leitura**, não um CI. |
| **1–5 no guard de retro-destino** | `.agents/runs` é excluído (registro que descreve o defeito = classe 3); a exclusão está escrita no código. **Nenhum** check separa hit legítimo de hit descriptions sem julgamento humano. |
| **Ferramenta (6)** | Um `Edit` que reporta `OK` e corrompe fora do alvo não tem comando que o pegue em tempo real. |

> **Por que a coluna existe.** O `check-memory-dir-concordance` — o guard
> que esta demanda entregou — **não pega a classe 4 nem a 5**, porque elas são
> do domínio do parser de redirect, não de documentação. Ele pega 1, 2, 3, 7 no
> seu escopo. Declarar isso é o que impede que o próximo guard prometente
> demais.

## Cross-refs

- [backlog `X8`,`X10`–`X12`](../../runs/backlog-2026-10-02.md) — as cicatrizes, com comando de reprodução
- [`retrospective-capture.md`](./retrospective-capture.md) — a fonte única que a classe 1 exemplifica (tasks 1.1–1.3)
- [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) — onde o registro de dentes (Fase 3) vive
- [`demand-archiving.md`](./demand-archiving.md) — o frontmatter que o `archive:lint` (classe 1/B19) valida
- [plano `guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md) — de onde as 7 classes vêm

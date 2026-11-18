---
name: architecture-docs-auditor-memory
description: Memória acumulada do agent architecture-docs-auditor — auditor do pilar 2 do kit de documentação (HLD, C4, diagramas Mermaid e ADRs citados)
---

# Memória: `architecture-docs-auditor`

> Arquivo de memória do agent `architecture-docs-auditor`.

## Decisões Tomadas

### 2026-11-18 — O bloco `%%{init}%%` é medido pelo `awk` com `getline`, não por contagem

**Contexto:** O README §2.3 declara que **todo** diagrama do conjunto começa
com o bloco de inicialização — e o próprio README **mostra** o bloco num
fence ````text` ``. Contar linhas `%%{init}` no arquivo daria 1 a mais que
o número de diagramas no README (que não tem nenhum), e a razão ficaria
incompreensível para quem lê o relatório.

**Decisão:** O passo 3 conta o fence ```` ```mermaid `` `` e olha **a linha
seguinte** com `awk`/`getline` — o que mede é "este diagrama tem o init?",
não "este arquivo tem N linhas de init".

**Consequências:** A medida do conjunto em 2026-11-18 foi **10 diagramas, 10
com init** — e `docs/system-design/README.md` aparece com `0 e 0`, que é
exato (ele mostra o bloco, não usa um).

### 2026-11-18 — A duplicação do bloco de init é exceção declarada, não violação de DRY

**Contexto:** O `dry.md` do repo proíbe o mesmo conhecimento em dois lugares.
O bloco `%%{init}` está duplicado em 10 arquivos.

**Decisão:** Não reportar. O README §2.3 declara a exceção **e o motivo** (o
Mermaid lê a diretiva por documento; não existe include nem herança entre
arquivos), e a alternativa — diagrama sem init — deixa o render depender do
tema do GitHub.

**Consequências:** O agente não produz um finding que seria sempre um falso
positivo.

### 2026-11-18 — O ADR citado é item do outro pilar

**Contexto:** O índice do system design cita ADR (`../adr/0010-…md`) e o
`docs/adr/` tem 12 arquivos. O ADR em si — as 3 seções, o conteúdo — é o
item 8, do `decision-docs-auditor`.

**Decisão:** O passo 4 mede só a **existência do arquivo citado** pelo índice
do system design. Conflito entre o ADR e o doc é do `architecture-docs-auditor`
só quando é **contradito** (P0); estrutura do ADR é do outro auditor.

**Consequências:** Nenhum achado é reportado duas vezes — o gate
`check-bloco-duplicado` mede repetição de código de produção, mas a mesma
lacuna em dois relatórios continua sendo dívida duplicada.

## Padrões Descobertos

- O `docs/system-design/README.md` tem 211 linhas e as 3 seções mínimas
  (`## §1. Ordem de leitura`, `## §3. Os 8 princípios`, `## §4. Como um
  aplicativo derivado estende isto`).
- O `docs/system-design/contexto.md` tem 259 linhas, os 2 níveis do C4 e 3
  diagramas — todos com o bloco de init.
- O conjunto `docs/system-design/` tem 7 arquivos: `README.md`, `contexto.md`,
  `dados.md`, `extensao.md`, `modulo.md`, `operacao.md`, `seguranca.md`.
  O `extensao.md` é o único **sem** diagrama (0 e 0).
- O índice do system design cita **5** ADRs (0010, 0001, 0004 duas vezes,
  0011, 0012) e os 5 têm arquivo em `docs/adr/` — que tem 12 ADR no total.
  Citar não é a mesma coisa que listar: o índice **aponta**, o
  `docs/agents/domain.md` **lista**.
- O §6 do README ("O que ainda não existe") é o lugar das lacunas
  **declaradas** do conjunto — e a §5 diz que 5 dos 6 focais **não** têm
  instrumento automático. É a lacuna que a auditoria manual cobre.

## Lições Aprendidas

- ❌ **Contar `%%{init}` com `grep -c`.** O número contava o fence ````text` ``
  do README §2.3 e inflava a medida do conjunto em 1.
- ❌ **Usar `sed -n` com regex de ADR sem considerar o hífen.** O padrão
  `\.\./adr/[0-9]{4}-[a-z0-9.-]+\.md` precisa do `.` no final da classe —
  senão `0010-system-design-canonico.md` era lido só até o primeiro hífen.
- ❌ **Contar o Mermaid de um arquivo que não tem diagrama como "sem init".**
  `0 e 0` é o número certo; a leitura ingênua diria "faltou o init em 1
  arquivo".
- ❌ **Tratar ADR citado no índice como ADR faltando.** Citar e listar são
  duas medidas, de dois donos.

## Sugestões de Evolução

- [ ] Medir a **coerência entre o C4 Nível 2 e o Compose real** (os
      contêineres do `docker-compose.yml` × os nós do diagrama) — o README
      §5 admite que essa focal não tem instrumento automático.
- [ ] Apontar, no relatório, **qual dos 6 focais** do §5 a medição cobriu, para
      que a lacuna seja atribuída e não apenas citada.
- [ ] Reusar o passo 3 (contagem de Mermaid com init) como **post-condição**
      de qualquer doc novo em `docs/system-design/`.

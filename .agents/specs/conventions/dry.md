---
name: dry
version: 1.0
updated: 2026-10-22
maintainer: stack-code-reviewer
description: "Don't Repeat Yourself — o conhecimento tem UMA representação. Aplicação ao código: um termo de domínio tem UM dono (constante exportada) e quem usa importa. Dois gates medem: `check-repeticao` (termo) e `check-bloco-duplicado` (lógica)."
---

# Convenção: DRY — Don't Repeat Yourself

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## 1. A REGRA

**Cada pedaço de conhecimento tem UMA representação autoritativa. Quando o
mesmo conhecimento aparece em dois lugares, os dois envelhecem — e o bug é o
que fica.**

Em código, o conhecimento tem três formas, e as três têm dono:

| forma | o dono | o sintoma da repetição |
|---|---|---|
| **um termo** (perfil, papel, permissão, chave de flag, código de erro) | uma **constante exportada** | o literal hardcoded em N arquivos |
| **uma decisão** (um bloco de lógica) | uma **função** | o bloco copiado |
| **um dado** (uma lista, uma tabela, um catálogo) | um **catálogo** | a lista re-declarada |

⚠️ **O critério é o DONO, e não o número de repetições.** Um termo usado em
29 arquivos com dono é **saudável** (o dono existe e é importado); um termo
usado em 3 arquivos sem dono é **doente** (o nome está espalhado). A
repetição é o **sinal** de que falta um dono — nunca o critério para criar um.

## 2. AS TRÊS REPETIÇÕES LEGÍTIMAS

⚠️ Repetir não é o defeito — **repetir CONHECIMENTO** é. Estas três são
repetição de **forma**, e cada uma tem o motivo escrito:

| repetição | por que é legítima |
|---|---|
| **spec que afirma o valor** | o literal É o dente do teste. Se o spec importasse a constante, as duas pontas mudariam juntas e o teste passaria com o dono errado. |
| **texto de UI** | o texto que a pessoa lê é da tela. Um dono compartilhado entre duas telas mudaria as duas — e mudar a palavra da interface é decisão de produto, não de refatoração. |
| **framework, rota HTTP, cabeçalho de rede** | o nome é de outro dono (o pacote, o contrato, o protocolo). Um alias nosso seria um espelho que envelhece. |

E o quarto caso, que **não** é legítimo: **mensagem de log e de erro**. O
texto é de diagnóstico e muda com o tempo; o **código** do erro é do contrato,
e esse sim tem dono.

## 3. O QUE A REPETIÇÃO CUSTA (MEDIDO)

MEDIDO 2026-10-22, no PR #116: renomear o perfil `dono` → `gerente` tocou
**14 arquivos** — o catálogo, o repositório, o caso de uso, as portas, o
schema do Prisma, a assinatura da membership e N specs. O nome estava
**hardcoded** em cada um deles, e o rename foi uma caça ao literal.

O custo não é o de escrever: é o de **lembrar**. O próximo nome que muda
volta a varrer o repo inteiro, e quem esqueceu um arquivo descobre na
produção (ou no próximo `grep`).

## 4. A APLICAÇÃO AO TERMO DE DOMÍNIO

Um termo de domínio é o nome de algo que o **produto** tem. A pergunta que
decide é: *"se este nome mudar, quantos arquivos precisam mudar junto?"*

| situação | o que fazer |
|---|---|
| o termo tem dono | **importar o dono**: `import { PAPEL_GERENTE } from '...'` |
| o termo NÃO tem dono | **criar o dono** antes de usar — e usá-lo |
| o termo é de framework, rota ou UI (o §2) | literal é o certo |

⚠️ **O dono tem de exportar a CONSTANTE NOMEADA, e não só o array.** O dono das
permissões exporta `PERMISSIONS` (um array), e quem precisa de `users.read`
escreve o literal — porque `PERMISSIONS[3]` é um índice que muda quando o
catálogo cresce. Exportar `export const USERS_READ = 'users.read'` ao lado do
array é a linha que destrava a migração.

## 5. A DECLARAÇÃO E OS DOIS GATES

**A declaração** é `.tooling/scripts/ci/dry-termos.json`: o termo, o dono que
o deve exportar, a constante que falta, e o estado (`ok` = ninguém
hardcodeia; `declarado` = dívida com motivo). A **revisão** produz a
declaração; os **gates** cobram.

| gate | o que mede | como se prova que tem dentes |
|---|---|---|
| `check-repeticao` | termo declarado e hardcoded em **arquivo de PRODUÇÃO** | `npx vitest run --root .tooling/scripts/ci check-repeticao` → **2 de 6** com o hardcode neutralizado |
| `check-bloco-duplicado` | bloco de **16+ linhas** repetido em 2+ arquivos de produção | `npx vitest run --root .tooling/scripts/ci check-bloco-duplicado` → **2 de 5** com a varredura neutralizada |

⚠️ **O gate mede por ARQUIVO, e não por ocorrência.** Um literal usado 40×
num arquivo só é um arquivo só. E spec fica de fora: o literal do spec é o
dente dele (§2).

⚠️ **A dívida é PUBLICA, não escondida.** Um termo em `estado: 'declarado'`
sai como **ressalva** com o motivo, e some da lista quando a fase do plano
pagar. Um gate que grita com o que já é dívida conhecida é um gate que ninguém
ouve.

⚠️ **A janela do gate de lógica é 16 porque foi MEDIDA**: com 12, o gate
acusaria o markup JSX do formulário — repetição de MARCAÇÃO, não de decisão.
MEDIDO 2026-10-22 sobre a árvore de produção: com 16 linhas de janela, **ZERO**
blocos repetidos. O código já é DRY na lógica; a repetição que sobra é de
TERMO.

## 6. A MEDIÇÃO (a revisão)

```bash
npx tsx tooling/scripts/analisa-repeticao.ts --min=3 --producao
```

A ferramenta conta, para cada literal, **quantos arquivos distintos** o
carregam. Ela **conta**; ela não sabe o que é termo de domínio — a
separação entre "domínio" e "ruído" é de quem lê.

⚠️ **O que a medição mostra hoje** (2026-10-22, `--min=3 --producao`): **134**
literais repetidos em 3+ arquivos de produção, e **8** deles são de domínio.

A coluna "arquivos" é a do comando acima. A coluna "fora do dono" é a
**dívida** que o gate cobra — e ela sai da função do próprio gate
(`arquivosQueHardcodam`, em `check-repeticao.ts`), que mede as mesmas raízes
de produção e **exclui o dono** (é o dono quem DEFINE o valor):

| termo | arquivos (produção) | fora do dono | dono hoje |
|---|---|---|---|
| `convite` (o `destino.tipo`) | 9 | 8 | o **TIPO** está no shared-types (`user.ts`); o LITERAL, espalhado |
| `gerente` | 3 | 2 | **existe** (`perfis-da-empresa.ts`), mas exporta o array |
| `users.read` e irmãs | 3 | 2 | **existe** (`permissions-catalog.ts`), mas exporta o array |
| `tenancy.invites` | 3 | 2 | **existe** (`feature-flag-catalog.ts`), mas exporta o array |
| `member` (o papel do convidado) | 2 | 2 | o arquivo existe (`shared-types/src/tenant.ts`), mas não exporta a constante |
| `VALIDATION_ERROR` (o código do problema) | 2 | 2 | o arquivo existe (`domain-exception-to-http.ts`), mas não exporta a constante |
| `coordenador` | 1 | **0** | **dívida paga** — só o dono carrega o literal |
| `funcionario` | 1 | **0** | **dívida paga** — só o dono carrega o literal |

⚠️ **O número desta tabela é um dado que ENVELHECE** — e a regra do repo é
que número sem derivação é classe 7 (`guard-classes.md` §2). Por isso o
comando está ao lado do número, e por isso a tabela mede **o que o gate
mede**: os mesmos arquivos de produção, a mesma contagem por ARQUIVO, e a
mesma exclusão do dono. A tabela anterior falava de "3+ arquivos de
produção" e trazia números de um corpus que INCLUÍA specs — a legenda e os
números mediam objetos diferentes.

⚠️ **A leitura que muda o plano: o problema NÃO é "faltam enums".** Três dos
oito **já têm dono** — e o que falta é o **import**, não o enum. Por isso a
fase que mais destrava é a de **exportar a constante nomeada ao lado do
array** (uma linha por termo), e a migração dos literais é mecânica depois
disso. E dois dos oito (`coordenador` e `funcionario`) **já não têm dívida**:
só o dono carrega o literal, e por isso eles estão em `estado: 'ok'` — a
partir de agora, voltar a hardcodar é ERRO. O plano é
[`docs/superpowers/plans/2026-10-22-termos-de-dominio.md`](../../../docs/superpowers/plans/2026-10-22-termos-de-dominio.md).

## 7. O QUE ESTA REGRA **NÃO** COBRA

- **Nomes de variável, de função e de arquivo**: são do código, não do
  conhecimento. `idDoGerente` é do código; `'gerente'` é do domínio.
- **Estruturas parecidas que não são o mesmo conhecimento**: dois formulários
  com a mesma CLASS não são a mesma decisão. O gate de lógica existe para
  pegar a CÓPIA, e a janela de 16 linhas é o filtro.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT

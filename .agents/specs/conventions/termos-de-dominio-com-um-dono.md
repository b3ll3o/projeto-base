---
name: termos-de-dominio-com-um-dono
version: 1.0
updated: 2026-10-22
maintainer: stack-code-reviewer
description: "Um termo de domínio tem UM dono (uma constante exportada); quem usa importa. O sintoma é o literal repetido, medido por `analisa-repeticao`."
---

# Convenção: termos de domínio com um dono só

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## 1. A REGRA

**Um termo de domínio tem UM DONO — uma constante exportada que o define —
e quem usa IMPORTA o dono. O literal repetido é o sintoma, não o estilo.**

O que é um **termo de domínio**: o nome de algo que o produto tem — um perfil,
um papel, uma permissão, uma chave de feature flag, o discriminante de um
`destino`, um código de erro de contrato. O que decide é a pergunta: *"se este
nome mudar, quantos arquivos precisam mudar junto?"*

| situação | o que fazer |
|---|---|
| o termo tem dono | **importar o dono**. `import { PAPEL_GERENTE } from '...'` |
| o termo NÃO tem dono | **criar o dono** antes de usar — e usá-lo |
| o termo é de framework, rota HTTP ou fixture de teste | literal é o certo (ver §3) |

⚠️ **O critério é o DONO, e não o número de repetições.** Um termo usado em
40 arquivos com dono é **saudável** (o dono existe e é importado); um termo
usado em 3 arquivos sem dono é **doente** (o nome está espalhado). A
repetição é o **sinal** de que falta um dono — nunca o critério para criar um.

## 2. POR QUE A REPETIÇÃO CUSTA CARO (MEDIDO)

MEDIDO 2026-10-22, no PR #116: renomear o perfil `dono` → `gerente` tocou
**14 arquivos** — o catálogo, o repositório, o caso de uso, as portas, o
schema do Prisma, a assinatura da membership e N specs. O nome estava
**hardcoded** em cada um deles, e o rename foi uma caça ao literal.

O custo não é o de escrever: é o de **lembrar**. O próximo nome que muda
volta a varrer o repo inteiro, e quem esqueceu um arquivo descobre na
produção (ou no próximo `grep`).

## 3. O QUE **NÃO** É TERMO DE DOMÍNIO

| categoria | exemplos | por que o literal é o certo |
|---|---|---|
| framework / pacote | `'vitest'`, `'@nestjs/common'`, `'next/navigation'` | o nome é do dono externo; um alias nosso seria um espelho que envelhece |
| rota HTTP / verbo | `'POST'`, `'GET'`, `'/users'` | é a superfície pública; mudá-la é breaking change, e o dono é o contrato (OpenAPI) |
| cabeçalho de resposta | `'content-type'`, `'utf8'` | pertence ao protocolo |
| **fixture de teste** | `'acme'`, `'João'`, `'joao@example.com'` | o valor é do teste, e o dono é o próprio teste — mas **ver §4**: os fixtures que se repetem em N arquivos são um caso à parte |
| tipo primitivo | `'string'` | é o TypeScript |

⚠️ O fixture é a exceção que **mais** engana: `'acme'` aparece em 19
arquivos (149×) e parece um termo de domínio. Não é — é o nome de uma
empresa de mentira. Mas ele **tem** um dono pendente: um
`apps/web/e2e/support/fixtures.ts` (que já existe) com as constantes
compartilhadas.

## 4. A MEDIÇÃO

```bash
npx tsx tooling/scripts/analisa-repeticao.ts --min=4
```

A ferramenta conta, para cada literal, **quantos arquivos distintos** o
carregam. O critério do gate é "quantos ARQUIVOS", e não "quantas
ocorrências": um literal usado 40× num arquivo só é um arquivo só.

⚠️ A ferramenta **conta**; ela não sabe o que é termo de domínio. A
separação entre "domínio" e "ruído" é de quem lê — e é por isso que o gate
(§6) carrega uma **lista de exceções declarada**, e não uma heurística.

## 5. O ESTADO MEDIDO (2026-10-22)

MEDIDO com o comando acima, sobre `apps/api/src`, `apps/api/test`,
`apps/web/{app,lib,components,e2e}` e `packages/shared-types/src`:

| termo | arquivos | ocorrências | dono hoje |
|---|---|---|---|
| `users.read` (e as outras permissões) | 29 | 155 | **existe**: `shared/auth/permissions-catalog.ts` — mas exporta o ARRAY, não a constante |
| `tenancy.invites` | 15 | 79 | **existe**: `shared/auth/feature-flag-catalog.ts` — mesmo caso |
| `gerente` / `coordenador` / `funcionario` | 20 | 60 | **existe**: `tenancy/domain/perfis-da-empresa.ts` |
| `member` (o papel do convidado) | 17 | 59 | **NÃO EXISTE** |
| `VALIDATION_ERROR` (o código do problema) | 19 | 47 | **NÃO EXISTE** |
| `convite` (o `destino.tipo`) | 23 | 44 | **NÃO EXISTE** (o tipo está em `shared-types`; o literal, espalhado) |

⚠️ **A leitura que importa:** três dos seis já têm dono, e o problema **não**
é falta de enum — é o consumidor repetir o literal em vez de importar o
dono. O dono que existe exporta um ARRAY (`PERMISSIONS`, `FEATURE_FLAGS`), e
quem precisa de um item escreve o literal — porque `PERMISSIONS[3]` é um
índice que muda quando o catálogo cresce.

Por isso a regra tem duas metades, e a segunda é a que **custa menos**:
**exportar a constante nomeada ao lado do array** (`export const USERS_READ =
'users.read'`) e trocar o literal pelo import.

## 6. O GATE (a fase que falta)

A regra sem gate é prosa. A fase 3 do
[plano](../../../../docs/superpowers/plans/2026-10-22-termos-de-dominio.md)
transforma `analisa-repeticao` em `check-repeticao`, com:

- **limiar**: um literal de domínio em **≥ 3 arquivos de produção** é erro;
- **lista de exceções declarada** (o §3, mais os literais que a medição
  mostrar serem falsos positivos), versionada e revisável;
- **dente**: um caso do spec que planta um literal repetido e o gate acusa.

⚠️ O gate **não** pode acusar o que não é termo de domínio — e a lista de
exceções é o que garante isso. Um gate que acusa `'vitest'` é um gate que
grita e não é ouvido, que é a classe de falha que
[`guard-classes.md`](./guard-classes.md) §3 cataloga.

## 7. O QUE ESTA REGRA **NÃO** COBRA

- **Nomes de variável, de função e de arquivo**: são do código, não do
  domínio. `idDoGerente` é do código; `'gerente'` é do domínio.
- **Strings de UI**: o texto que a pessoa lê é da tela. `'Criar empresa'` é
  da tela — mudar a palavra da interface é decisão de produto, e um dono
  compartilhado entre duas telas mudaria as duas.
- **Mensagens de log e de erro**: o texto é de diagnóstico, e ele muda com o
  tempo. (O **código** do erro é do contrato — e por isso o
  `VALIDATION_ERROR` da tabela acima é termo de domínio.)

---

**Mantido por:** projeto-base contributors
**Licença:** MIT

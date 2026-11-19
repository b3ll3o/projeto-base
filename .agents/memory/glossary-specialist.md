---
name: glossary-specialist-memory
description: Memória acumulada do agent glossary-specialist — o vocabulário do repo já existe em ADR e em código, e o glossário aponta para ele em vez de redefinir
---

# Memória: `glossary-specialist`

> Arquivo de memória do agent `glossary-specialist`.

## Decisões Tomadas

### 2026-11-18 — O glossário aponta para o dono; ele não redefine

**Contexto:** o repo já tem vocabulário próprio **antes** do glossário
existir: 12 ADRs em `docs/adr/`, o catálogo de permissões, os `slug`s de
perfil, os tipos compartilhados em `packages/shared-types/src/`. O
`docs/agents/domain.md` diz: *"Na dúvida, o termo do repo ganha do termo
genérico."*

**Decisão:** cada entrada do glossário é **um ponteiro com uma definição
curta**: termo · o que é · o que **não** é · dono (path) · sinônimos
proibidos. A regra continua no ADR e no código; o glossário é onde o
contribuidor **descobre** que a regra existe e onde ela mora.

**Consequências:** uma decisão nova não reescreve o glossário — ela **acrescenta
a entrada** ou **apaga a que aponta para o ADR superado**. O glossário não
vira um segundo dono de nenhuma regra.

### 2026-11-18 — Os pares que se confundem são o conteúdo real do glossário

**Contexto:** o produto tem 4 pares de termos que o código usa com o mesmo
sabor e significam coisas diferentes. Sem entrada que os separe, um
issue novo chama "role" de "perfil" e o bug nasce.

**Decisão:** o glossário abre com esses pares, e cada par é uma entrada com
o "não é" explícito:

| termo | não é | dono |
|---|---|---|
| **empresa** (tenant) | a conta | ADR-0004 |
| **conta** | a empresa | ADR-0004 |
| **membership** | o perfil | ADR-0004 |
| **perfil** (`Profile`) | o `role` | ADR-0005 |
| **`role`** (`gerente`, `member`) | o RBAC | `packages/shared-types/src/tenant.ts` |
| **bucket de sistema** | um valor que a sessão escolhe | ADR-0004 |
| **bucket global** (`tenantId === null`) | "sem empresa" | ADR-0004 |
| **flag** | um interruptor explícito | ADR-0006 |

**Consequências:** o par `role`/`perfil` é o que mais aparece em issue e PR —
o `shared-types` já avisa em prosa: *"o `role` é o rótulo de tenant …, e NÃO
o RBAC"*. O glossário vira o lugar onde isso está escrito uma vez.

### 2026-11-18 — Termo não decidido é lacuna nomeada, não definição inventada

**Contexto:** o item 3 do kit é **obrigatório** — e o `GLOSSARY.md` **não
existia** antes do kit (nasceu com ele, no mesmo PR) —
existe, e o `docs/agents/domain.md` diz que ele nasce *"quando um termo ou
decisão é de fato resolvido"*.

**Decisão:** a primeira versão do glossário declara os termos **já decididos**
(ADR + catálogo) e lista os **não resolvidos** como lacuna. Não se inventa
definição para fechar a lista — a regra do `documentacao.md` §1 vale também
aqui: ausência é P1, mentira é P0.

**Consequências:** o item 3 fecha sem esperar o vocabulário inteiro — e o
glossário cresce junto com o produto, sem inflar.

## Padrões Descobertos

- `GLOSSARY.md` **existe** na raiz (medido em 2026-11-18: 87 linhas, 30
  termos). O `docs/agents/domain.md` aponta para ele, e a skill
  `domain-modeling` (plugin `mattpocock-skills`) o cria.
- O nome canônico do arquivo é **`GLOSSARY.md`** desde a v1.3.0 do plugin; até
  a v1.2.3 ele se chamava `CONTEXT.md`. O `domain.md` registra essa troca
  explicitamente — o glossário nasce com o nome novo.
- O catálogo de permissões tem **8** chaves
  (`apps/api/src/shared/auth/permissions-catalog.ts`): `users.read`,
  `users.write`, `users.delete`, `admin.manage-profiles`,
  `admin.manage-authorizations`, `admin.manage-users`,
  `admin.manage-feature-flags`, `audits.read`. O `admin.*` é namespace
  visual, **não** curinga — o guard compara string exata e nega por default.
- O `slug` de perfil é o identificador canônico, validado por
  `SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/` no `profile-slug.vo.ts` — é
  kebab-case, e o glossário deve dizer.
- O `is_admin` do `Profile` é bypass **total** e **independente** de
  permissões (defesa em profundidade) — o ADR-0005 trata como decisão.
- Os `role` de tenant vivem em `packages/shared-types/src/tenant.ts`
  (`gerente`, `member`), e o `dry.md` §6 registra `member` e `gerente` como
  termos com dono em código — o glossário **não** os redefine.
- A convenção `dry.md` §6 já é um **catálogo de termos de domínio** com dono:
  `convite` (o `destino.tipo`), `gerente`, `users.read`, `tenancy.invites`,
  `member`, `VALIDATION_ERROR`, `coordenador`, `funcionario`. É a fonte mais
  próxima de um glossário que o repo já tem.

## Lições Aprendidas

- ❌ **Traduzir dicionário.** "Tenant" é `empresa` neste repo; o termo
  genérico entra **em parênteses**, nunca no título.
- ❌ **Sinônimo como entrada separada.** "tenant" e "empresa" são a mesma
  entrada, com o sinônimo proibido registrado.
- ❌ **Glossário de framework.** "Aggregate", "controller", "migration" são do
  time que implementa.
- ❌ **Definir o que o schema já impõe.** `NOT NULL` não precisa de verbete.

## Sugestões de Evolução

- [ ] Abrir o `GLOSSARY.md` pelos **pares** (empresa/conta, perfil/role),
      não pela lista alfabética — o leitor erra justamente nos pares.
- [ ] Ligar o `dry.md` §6 ao glossário: o catálogo de termos com dono é a
      fonte, e o `check-repeticao` é o instrumento que cobra que o literal
      não escape do dono.

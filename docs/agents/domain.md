# Domain Docs

> Gerado por `/setup-matt-pocock-skills` e **versionado desde então**. Re-rodar a skill
> sobrescreve este arquivo pelo template em inglês e leva junto a lista de ADRs.

Como as skills de engenharia devem consumir a documentação de domínio deste repo.

## Antes de explorar, leia estes

- **`GLOSSARY.md`** na raiz do repo — glossário e termos canônicos. **Ainda não existe**;
  a skill `domain-modeling` o cria quando um termo ou decisão é de fato resolvido.
  (Nome canônico **a partir da v1.3.0** do plugin; até a 1.2.3 o arquivo se chamava
  `CONTEXT.md`. As duas versões estão em disco, mas a carregada nesta sessão é a
  **1.3.1** — MEDIDO em `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/`,
  que lista `1.2.3` e `1.3.1`. Então `domain-modeling` escreve `GLOSSARY.md`, e o
  `git mv CONTEXT.md GLOSSARY.md` só se aplica a uma sessão que carregue a 1.2.3.
  Nenhum dos dois arquivos está na raiz hoje.)
- **`docs/adr/`** — decisões arquiteturais registradas:
  - `0001-arquitetura-ddd-hexagonal-auditoria.md` — boundary `domain/application/infrastructure`
  - `0002-autenticacao-jwt-argon2.md` — auth, sessão, hashing de senha
  - `0003-backends-locais-de-telemetria.md` — stack de telemetria e backends locais
  - `0004-tenancy-multi-empresa.md` — tenancy por membership, escopo de banco + RLS, bucket de sistema por credencial
  - `0005-rbac-por-perfil.md` — RBAC por perfil, `isAdmin` como bypass, catálogo de permissões em código, perfil por membership
  - `0006-feature-flags-como-excecao.md` — a tabela de flags guarda só as exceções; bloqueio responde 404 genérico

Se `GLOSSARY.md` não existir, **siga em silêncio**: não sinalize a ausência nem sugira
criá-lo antecipadamente.

## Layout: single-context

Um domínio só (auth, perfis, tenancy, feature flags, auditoria), apesar do
`pnpm-workspace.yaml` — os membros do workspace são `apps/api`, `apps/web`, `packages/*`
(`eslint-config`, `shared-types`, `tsconfig`) e `tooling/scripts` (os gates de CI). Tudo
isso é config compartilhada e ferramenta, não contexto de domínio separado.

```text
/
├── GLOSSARY.md          ← glossário (a criar, lazily)
├── docs/adr/            ← decisões do sistema
├── apps/{api,web}/      ← o produto
├── packages/*           ← config compartilhada
└── tooling/scripts/     ← gates de CI
```

Se um dia `apps/api` e `apps/web` divergirem em vocabulário de domínio, a evolução é
`GLOSSARY-MAP.md` na raiz apontando para um `GLOSSARY.md` por contexto.

## Use o vocabulário do glossário

Quando a saída nomear um conceito de domínio (título de issue, proposta de refactor,
hipótese, nome de teste), use o termo como definido em `GLOSSARY.md`. Não derive sinônimos.

Se o conceito não estiver no glossário, isso é sinal de duas coisas: ou é linguagem que o
projeto não usa (reconsidere), ou é uma lacuna real (anote para `domain-modeling`).

Este repo já tem vocabulário próprio antes do glossário existir: os ADRs acima, a
convenção de módulos em `.agents/specs/conventions/estrutura-e-versionamento.md`, e os
rótulos `severity:` / `type:` de [`issue-tracker.md`](./issue-tracker.md). Na dúvida,
o termo do repo ganha do termo genérico.

## Conflito com ADR

Se a saída contradisser um ADR existente, diga isso na cara em vez de sobrescrever em
silêncio:

> _Contradiz o ADR-0001 (boundary DDD/Hexagonal), mas vale reabrir porque…_

Os seis ADRs acima são decisões vigentes: violá-las é erro de review, não preferência.

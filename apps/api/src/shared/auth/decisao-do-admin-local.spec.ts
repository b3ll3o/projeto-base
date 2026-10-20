// apps/api/src/shared/auth/decisao-do-admin-local.spec.ts
//
// pt-BR (PR #115, achado 2 da revisão): a decisão de criar o admin local do
// seed morava INTEIRA dentro de `prisma/seed.ts`, e `apps/api/prisma/` não tem
// um único `*.spec.ts` — o projeto `unit` só include `src/**/*.spec.ts` e
// `test/config/**/*.spec.ts` (`vitest.workspace.ts:45`). Um spec escrito ao lado
// do seed seria verde por NUNCA RODAR, que é pior que não ter spec.
//
// O que esta tabela protege: o admin local tem senha pública (`Admin@123`, em
// texto no repositório), TODAS as permissions e `isAdmin: true`, e o seed
// conecta como DONA — o papel que ignora RLS. A falha deste guard não é um
// perfil errado num banco de dev; é um bypass total num banco de produção.
//
// ⚠️ São TRÊS estados, não dois. `criar` e `ignorar` são o que um booleano
// `podeCriar` consegue dizer; `recusar` é o `throw` — a recusa que ABORTA o
// seed, e a única saída que impede o admin de senha pública de existir. Um
// booleano põe `recusar` e `ignorar` no mesmo `false`, e eles têm consequências
// opostas: um é a garantia (fail-safe fora de dev), o outro é o erro fatal.

import { describe, expect, it } from 'vitest';
import { decisaoDoAdminLocal } from './decisao-do-admin-local.js';

const url = (host: string): string => `postgresql://projeto:projeto@${host}/projeto_base`;

describe('decisaoDoAdminLocal', () => {
  // ── criar ────────────────────────────────────────────────────────────────
  // `postgres` é o nome do serviço do Compose, que é o que o comando
  // documentado em `docs/como-rodar.md` §1.7 usa de dentro do container.
  it.each([
    'postgres',
    'postgres:5432',
    'localhost',
    'localhost:5432',
    '127.0.0.1',
    '127.0.0.1:5432',
  ])('modo dev + destino %s: cria', (host) => {
    expect(decisaoDoAdminLocal('development', url(host))).toBe('criar');
  });

  it('modo dev + query string na URL: cria (o `?schema=` que o compose põe no DATABASE_URL)', () => {
    expect(decisaoDoAdminLocal('development', `${url('postgres')}?schema=public`)).toBe('criar');
  });

  // ── recusar ──────────────────────────────────────────────────────────────
  // `postgres.railway.app` recusa porque o match é EXATO, não por sufixo:
  // `postgres` está na lista e `postgres.railway.app` não é `postgres`.
  it.each(['postgres.railway.app', 'db.remoto.com', 'projeto-base-postgres', '10.0.0.5'])(
    'modo dev + destino %s: recusa',
    (host) => {
      expect(decisaoDoAdminLocal('development', url(host))).toBe('recusar');
    },
  );

  it('modo dev + URL que não parseia: recusa em vez de lançar', () => {
    // O seed real nunca chega aqui — a primeira query (passo 1, `seed.ts:89`)
    // morre antes com `PrismaClientInitializationError`, MEDIDO. O caso é da
    // FUNÇÃO: recusa o que não deu para verificar, que é o lado seguro.
    expect(decisaoDoAdminLocal('development', 'nao-e-url')).toBe('recusar');
  });

  // ── ignorar ──────────────────────────────────────────────────────────────
  // default-deny no modo: fora de `development` o seed não cria E não aborta —
  // o passo 5 (vincular perfil ao primeiro user) segue. É o que permite rodar
  // o seed em staging sem o seed matar o processo.
  //
  // Objetos e não tuplas: `as const` numa lista de tuplas heterogêneas (`''`,
  // `undefined`, `staging`...) faz o `tsc` inferir a tupla como o primeiro
  // elemento, e a spec fica VERDE com o `typecheck` VERMELHO — o par que o
  // CI pega e a suíte não.
  const MODOS_NAO_DEV: readonly { nodeEnv: string | undefined; motivo: string }[] = [
    { nodeEnv: '', motivo: 'NODE_ENV vazio' },
    { nodeEnv: undefined, motivo: 'NODE_ENV ausente' },
    { nodeEnv: 'staging', motivo: 'staging' },
    { nodeEnv: 'production', motivo: 'production' },
    { nodeEnv: 'prod', motivo: 'prod, sem o "uction"' },
    { nodeEnv: 'Development', motivo: 'maiúscula — o match é exato' },
  ];

  it.each(MODOS_NAO_DEV)('$motivo: ignora', ({ nodeEnv }) => {
    expect(decisaoDoAdminLocal(nodeEnv, url('postgres'))).toBe('ignorar');
  });

  // ── os dois "não" são estados diferentes ─────────────────────────────────
  // Para o MESMO destino fora de local, o modo decide: em dev aborta o seed,
  // em staging segue. Se um dia `recusar` e `ignorar` colapsarem num valor só,
  // o seed em dev passa a fechar "OK" sem admin nenhum — o silêncio que o
  // comentário de `seed.ts:156` diz ser "o pior dos dois mundos".
  it('o mesmo destino não-local recusa em dev e ignora fora de dev', () => {
    expect(decisaoDoAdminLocal('development', url('db.remoto.com'))).toBe('recusar');
    expect(decisaoDoAdminLocal('staging', url('db.remoto.com'))).toBe('ignorar');
  });

  it('o mesmo destino local cria em dev e ignora fora de dev', () => {
    expect(decisaoDoAdminLocal('development', url('postgres'))).toBe('criar');
    expect(decisaoDoAdminLocal('production', url('postgres'))).toBe('ignorar');
  });
});

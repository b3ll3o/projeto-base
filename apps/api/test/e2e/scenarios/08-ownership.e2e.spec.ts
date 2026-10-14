// apps/api/test/e2e/scenarios/08-ownership.e2e.spec.ts
//
// Cenário E2E 08: **propriedade do registro** (2026-10-13).
//
// ⚠️ Este arquivo existe porque o defeito que ele mede foi MEDIDO AO VIVO, e
// não lido: antes de `UserOwnershipGuard`, um token válido da conta A recebia
// 200/204 sobre o id da conta B em `GET :id`, `PATCH`, `DELETE`, `restore` e
// `:id/history`. A branch entregava autenticação sem autorização.
//
// As duas contas são reais: criadas pelo `POST /users` público e autenticadas
// por `POST /auth/login` real. Nenhum guard é dublê — o `JwtAuthGuard` valida
// assinatura de verdade e o `UserOwnershipGuard` compara o `sub` publicado por
// ele, que é o mesmo caminho do runtime de produção.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  tokenDe,
  type E2EContext,
  SENHA_DE_TESTE,
} from '../test-app.helper.js';

describe('E2E 08: a pessoa só opera sobre o próprio registro', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e);
  });

  /** Cria uma conta pelo endpoint público e devolve `{ id, token }` — dono. */
  async function conta(nome: string, email: string) {
    const { injetar } = e2e;
    const cadastro = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome, email, senha: SENHA_DE_TESTE },
    });
    expect(cadastro.statusCode).toBe(201);
    const { id } = JSON.parse(cadastro.body) as { id: string };
    return { id, token: await tokenDe(e2e.app, { email, senha: SENHA_DE_TESTE }) };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('o dono continua operando no próprio registro nas 5 rotas por-id', async () => {
    // ⚠️ A METADE POSITIVA existe para que a negativa abaixo não seja
    // "passa porque a rota quebrou". Um 403 verde nos dois lados é o modo
    // mais barato de um gate medir nada.
    const { injetar } = e2e;
    const eu = await conta('Dono', 'dono@e2e.test');

    const g = await injetar({
      method: 'GET',
      url: `/api/v1/users/${eu.id}`,
      headers: auth(eu.token),
    });
    expect(g.statusCode).toBe(200);

    const u = await injetar({
      method: 'PATCH',
      url: `/api/v1/users/${eu.id}`,
      headers: { ...auth(eu.token), 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Dono Renomeado' },
    });
    expect(u.statusCode).toBe(200);

    const h = await injetar({
      method: 'GET',
      url: `/api/v1/users/${eu.id}/history`,
      headers: auth(eu.token),
    });
    expect(h.statusCode).toBe(200);

    const d = await injetar({
      method: 'DELETE',
      url: `/api/v1/users/${eu.id}`,
      headers: { ...auth(eu.token), 'if-match': 'W/"v2"' },
    });
    expect(d.statusCode).toBe(204);

    const r = await injetar({
      method: 'POST',
      url: `/api/v1/users/${eu.id}/restore`,
      headers: { ...auth(eu.token), 'if-match': 'W/"v3"' },
    });
    expect(r.statusCode).toBe(201);
  });

  it('o atacante NÃO lê, renomeia, apaga, restaura nem lê o histórico da vítima', async () => {
    const { injetar } = e2e;
    const vitima = await conta('Vitima', 'vitima@e2e.test');
    const atacante = await conta('Atacante', 'atacante@e2e.test');

    const leitura = await injetar({
      method: 'GET',
      url: `/api/v1/users/${vitima.id}`,
      headers: auth(atacante.token),
    });
    expect(leitura.statusCode).toBe(403);
    expect(JSON.parse(leitura.body).code).toBe('USER_OWNERSHIP_VIOLATION');

    // ⚠️ O `if-match` correto (`v1`) é o detalhe que dá peso à medição: com o
    // header ERRADO o `PATCH` cairia em 412 e o teste passaria por um motivo
    // que não é autorização. Aqui o 403 vem antes do optimistic locking.
    const renomear = await injetar({
      method: 'PATCH',
      url: `/api/v1/users/${vitima.id}`,
      headers: { ...auth(atacante.token), 'if-match': 'W/"v1"' },
      payload: { novoNome: 'RENOMEADO PELO ATACANTE' },
    });
    expect(renomear.statusCode).toBe(403);

    const apagar = await injetar({
      method: 'DELETE',
      url: `/api/v1/users/${vitima.id}`,
      headers: { ...auth(atacante.token), 'if-match': 'W/"v1"' },
    });
    expect(apagar.statusCode).toBe(403);

    const restaurar = await injetar({
      method: 'POST',
      url: `/api/v1/users/${vitima.id}/restore`,
      headers: { ...auth(atacante.token), 'if-match': 'W/"v1"' },
    });
    expect(restaurar.statusCode).toBe(403);

    const historico = await injetar({
      method: 'GET',
      url: `/api/v1/users/${vitima.id}/history`,
      headers: auth(atacante.token),
    });
    expect(historico.statusCode).toBe(403);

    // ⚠️ O efeito, não só o status: o nome da vítima tem de estar intacto na
    // base. Um 403 no response com o PATCH tendo acontece antes seria um gate
    // que não mede o que diz medir.
    const depois = await injetar({
      method: 'GET',
      url: `/api/v1/users/${vitima.id}`,
      headers: auth(vitima.token),
    });
    expect(depois.statusCode).toBe(200);
    expect((JSON.parse(depois.body) as { nome: string }).nome).toBe('Vitima');
  });

  it('o corpo do 403 NÃO devolve PII do registro alheio', async () => {
    const { injetar } = e2e;
    const vitima = await conta('Vitima Silenciosa', 'silenciosa@e2e.test');
    const atacante = await conta('Atacante Dois', 'atacante2@e2e.test');

    const r = await injetar({
      method: 'GET',
      url: `/api/v1/users/${vitima.id}`,
      headers: auth(atacante.token),
    });
    expect(r.statusCode).toBe(403);
    const corpo = r.body;
    // Nome e e-mail são dado que o atacante NÃO tinha — devolvê-los seria
    // responder à pergunta que ele fez.
    expect(corpo).not.toContain('silenciosa@e2e.test');
    expect(corpo).not.toContain('Vitima Silenciosa');

    // ⚠️ O `id` NÃO é exigido ausente, e a primeira versão deste teste o
    // exigia — medido: `instance` é `"${method} ${url}"`
    // (`global-exception.filter.ts:55`), ou seja, o id volta porque O
    // ATACANTE O DIGITOU NA URL. Proibi-lo exigiria reescrever o filtro
    // inteiro para esconder a própria requisição de quem a fez. A distinção
    // que importa é esta: o corpo não devolve nada que o caller não tivesse
    // antes de perguntar.
    expect(JSON.parse(corpo).instance).toBe(`GET /api/v1/users/${vitima.id}`);
    expect(JSON.parse(corpo).code).toBe('USER_OWNERSHIP_VIOLATION');
  });

  it('`:id` malformado continua 400 VALIDATION_ERROR, não vira 403 de autorização', async () => {
    // ⚠️ Este teste existe porque o guard introduziu uma regressão real: com
    // `exigirPropriedade` aplicado a qualquer string, `/users/not-a-uuid`
    // respondia 403 e mandava quem errou o formato procurar bug de
    // autorização. O guard agora defere o id não-UUID ao domínio.
    //
    // A deferência só é segura porque `UserId.create` recusa o MESMO regex.
    // Se um dia ele aceitar, este teste fica vermelho — que é o ponto.
    const { injetar } = e2e;
    const eu = await conta('Dono Do Id', 'dono-id@e2e.test');

    const r = await injetar({
      method: 'GET',
      url: '/api/v1/users/not-a-uuid',
      headers: auth(eu.token),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).code).toBe('VALIDATION_ERROR');
  });

  it('o cadastro e a listagem seguem ABERTOS — a política é por-id, e isso é deliberado', async () => {
    // ⚠️ Este teste trava uma ESCOLHA, não um comportamento herdado. A
    // listagem é o diretório da tela `/users`; aplicar "só o próprio" nela
    // devolveria uma linha e apagaria a tela. A exclusão está documentada no
    // guard e registrada como pendência — se alguém "consertar" a listagem
    // depois, este teste cai e a mudança vem com a decisão de produto que a
    // acompanha.
    const { injetar } = e2e;
    await conta('Alfa', 'alfa@e2e.test');
    const eu = await conta('Bravo', 'bravo@e2e.test');

    const lista = await injetar({
      method: 'GET',
      url: '/api/v1/users?limit=50',
      headers: auth(eu.token),
    });
    expect(lista.statusCode).toBe(200);
    const { users } = JSON.parse(lista.body) as { users: Array<{ email: string }> };
    expect(users.map((u) => u.email).sort()).toEqual(['alfa@e2e.test', 'bravo@e2e.test']);
  });
});

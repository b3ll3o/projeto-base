// apps/api/src/shared/domain/uuid.ts
//
// A forma "é um UUID" — o DONO único dessa forma no repo.
//
// pt-BR (#136): antes desta file, o mesmo regex vivia em TRÊS lugares —
// `modules/profiles/domain/value-objects/profile-id.vo.ts` (o `UUID_REGEX`),
// `modules/auth/infrastructure/http/jwt-auth.guard.ts` (um `UUID_RE` local) e
// `modules/users/infrastructure/http/users.schemas.ts` (que usava a do VO de
// id de usuário). MEDIDO: as duas primeiras são IDÊNTICAS — e a terceira
// diverge, porque a do VO de id exige a VERSÃO 7.
//
// E a divergência não era teórica: `GET /users/:id/history` devolvia um
// `nextCursor` que era o `users_history.id` — um UUID **v4** (o
// `gen_random_uuid()` do banco) — e a rota recusava o próprio cursor com 400
// na segunda página. O servidor devolvia um token que ele mesmo rejeitava.
//
// ⚠️ A FORMA do UUID é uma coisa; a VERSÃO é outra. O `UserId` do BC `users`
// exige **v7** porque é um id de DOMÍNIO com ordem temporal (o id é
// gerado pelo agregado, e a ordem de inserção importa). Um CURSOR é opaco:
// a única exigência é que o banco aceite a string como chave — e a tabela que
// o produz decide a versão. Por isso o cursor usa ESTE regex, e não o do VO.
//
// Este regex NÃO é o do VO de id: `user-id.vo.ts` continua sendo o dono da
// regra "id de usuário = UUID v7", e quem valida um id de usuário continua
// importando de lá.

/**
 * Um UUID em forma canônica, de **qualquer versão** (v4, v7, …).
 *
 * O nibble de versão NÃO é verificado de propósito — a versão é um detalhe
 * do gerador, e a forma canônica (8-4-4-4-12, hex) é o que o Postgres
 * exige para aceitar a string como chave.
 */
export const UUID_RE_QUALQUER_VERSAO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

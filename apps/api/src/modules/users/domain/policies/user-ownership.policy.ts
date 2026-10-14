// apps/api/src/modules/users/domain/policies/user-ownership.policy.ts
//
// Política de DDD: **de quem é este registro?**
//
// pt-BR — por que isto é domínio e não um `if` no controller:
//
// A pergunta "esta pessoa pode mexer neste registro?" é uma regra de negócio
// do BC Users. Ela não depende de HTTP, de JWT nem de Fastify: depende do que
// o agregado significa. Um dia o mesmo `exigirPropriedade` será chamado por um
// consumer de fila ou por um comando de CLI, e a regra tem de ser a mesma.
//
// ⚠️ MEDIDO 2026-10-13 (o que motivou a política): antes dela, `findOne` era
// `findOne(@Param('id') id)` — sem `@Req()`, logo sem como comparar com o `sub`
// do token. Um token válido da conta A recebia 200/204 sobre o id da conta B
// em `GET :id`, `PATCH`, `DELETE`, `restore` e `:id/history`. O repositório não
// tem NENHUM modelo de papel/permissão medido em código, então "só o próprio"
// é a única política que os fatos do repo sustentam — inventar um papel aqui
// seria autorização sem modelo, que é a forma mais comum de controlá-lo errado.
//
// ⚠️ A MEDIÇÃO DESTA AFIRMAÇÃO, CORRIGIDA NO MESMO DIA. A primeira versão
// dizia: `grep -rn "role|papel|permissao|admin|RBAC" apps/api/src` → 0
// ocorrências. Rodando o comando hoje, são 4 — e nenhuma delas é um modelo de
// papel: três são ESTE comentário citando a própria medição, e a quarta é a
// palavra "sem permissão" em `jwt-auth.guard.ts:22`. Ou seja, escrever a
// medição no arquivo a invalidou: o comando agora casa a frase que o
// documenta. Um grep que devolve o próprio enunciado não mede o repo.
//
// A medição que sobrevive é a que não se auto-referencia:
//
//   grep -rnE "\b(role|papel|permissao|permissão|admin|RBAC)\b" \
//     apps/api/src --include=*.ts | grep -v "policies/user-ownership.policy.ts"
//
// → **1**, e essa 1 é comentário do `jwt-auth.guard.ts`, não código. Também
// por isso o grep sem fronteira de palavra não serve: `role` é substring de
// "controle", e `tracing.ts:58` ("mantém o controle de inicialização") entra
// como se fosse um papel.
//
// A função é PURA e lança. Devolver `boolean` faria o chamador poder ignorar o
// resultado em silêncio — e um `if (pode) { ... } else { segue em frente }` é o
// defeito original com outro nome.

import { UserOwnershipViolationException } from '../exceptions/user.exceptions.js';

/**
 * Exige que `actorId` seja o dono de `alvoId`. Lança
 * `UserOwnershipViolationException` quando não é.
 *
 * `actorId` é `string | undefined` porque o `@CurrentUser()` é tipado assim:
 * ele roda em rotas `@Public()` onde não há subject. Nessas, `undefined` é
 * "ninguém" — e "ninguém" não é o dono de nada.
 *
 * ⚠️ Comparação por IGUALDADE de string, sem normalizar. Os dois valores são
 * UUIDs canônicos emitidos pelo mesmo gerador (`UserId`), então não existe
 * variante de caixa ou com traço a normalizar. Se um dia `actorId` vier de
 * fora, esta função precisa de `UserId` de verdade — e o tipo passa a dizer
 * isso, em vez de o teste passar por acaso.
 */
export function exigirPropriedade(actorId: string | undefined, alvoId: string): void {
  if (actorId === undefined || actorId !== alvoId) {
    throw new UserOwnershipViolationException();
  }
}

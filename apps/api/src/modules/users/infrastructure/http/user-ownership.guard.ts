// apps/api/src/modules/users/infrastructure/http/user-ownership.guard.ts
//
// pt-BR: este guard é a CASCA que liga a política de domínio
// (`exigirPropriedade`) ao transporte HTTP. Ele só lê dois campos —
// `request.user.sub` e `request.params.id` — e delega a decisão.
//
// ⚠️ Por que um guard e não um `if` dentro de cada handler:
//
//   1. O controller tem 5 rotas por-id (`findOne`, `update`, `remove`,
//      `restore`, `history`). Um `if` em cada um é a mesma regra escrita 5
//      vezes, e a 6ª rota que alguém forgetsar nasce sem proteção —
//      silenciosamente, porque o código compila e os testes antigos passam.
//   2. O decorator `@UseGuards` na rota é VISÍVEL na assinatura do handler.
//      A lista de rotas protegidas é legível olhando o controller.
//
// ⚠️ Ordem de execução: `JwtAuthGuard` está na CLASSE e roda antes deste
// (a ordem de declaration nos metadados do Nest). Este guard pressupõe que
// `request.user` já foi publicado — e por isso mesmo assim trata `undefined`
// como negação, em vez de assumir. Um guard que assume o que o outro fez é um
// guard que quebra em silêncio se a ordem mudar.
//
// ⚠️ `POST /users` (o cadastro) e `GET /users` (a listagem) NÃO recebem este
// guard, e a exclusão é deliberada:
//   - o cadastro é `@Public()` por decisão de projeto D-2: é a porta de
//     entrada, e exigir token dele trancaria a criação da primeira conta;
//   - a listagem é o diretório. Aplicar "só o próprio" nela devolveria uma
//     lista de um item e apagaria a tela `/users`. Isso é uma decisão de
//     PRODUTO, não um detalhe de guard — está registrada em
//     `docs/superpowers/plans/2026-10-13-idor-rate-limit.md`, e o cenário e2e
//     08 trava a escolha: se a listagem for "corrigida", esse teste cai.

import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import type { TokenSubject } from '../../../auth/domain/ports/token-issuer.port.js';
import { exigirPropriedade } from '../../domain/policies/user-ownership.policy.js';
import { UUID_RE } from '../../domain/value-objects/user-id.vo.js';

interface RequestComParamEToken {
  params?: { id?: string };
  user?: TokenSubject;
}

@Injectable()
export class UserOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestComParamEToken>();
    const alvo = request.params?.id;

    // ⚠️ Rota por-id SEM param `id` é rota mal anotada, não "ninguém é o
    // dono". Deixar passar seria devolver o guard inteiro. Negar é o
    // comportamento seguro, e o 403 nomeia o motivo — que é a mesma coisa que
    // dizer "esta rota precisa do guard".
    if (typeof alvo !== 'string' || alvo === '') {
      exigirPropriedade(undefined, '');
      return false;
    }

    // ⚠️ `:id` que NÃO é UUID v7 não é "registro de outra pessoa" — é
    // "identificador malformado", e a resposta honesta é 400
    // VALIDATION_ERROR, que é o que `UserId.create` devolve. Cobrar
    // propriedade de `not-a-uuid` devolveria 403 e mandaria quem só errou o
    // formato procurar um bug de autorização que não existe (MEDIDO: o cenário
    // 04 caía aqui — `GET /users/not-a-uuid` virou 403).
    //
    // A deferência é segura: `UserId.create` recusa o mesmo `UUID_RE`, então
    // o request nunca chega ao use case. E se um dia essa recusa sumir, o
    // cenário 08 mede `not-a-uuid` de novo e fica vermelho — o acoplamento
    // está preso por teste, não por comentário.
    if (!UUID_RE.test(alvo)) {
      return true;
    }

    exigirPropriedade(request.user?.sub, alvo);
    return true;
  }
}

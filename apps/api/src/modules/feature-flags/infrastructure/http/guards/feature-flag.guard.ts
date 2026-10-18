// apps/api/src/modules/feature-flags/infrastructure/http/guards/feature-flag.guard.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 4): guard que transforma a decisão do
// administrador do sistema em comportamento de rota.
//
// Lógica:
//  - sem `@RequireFeatureFlag` => passa (o mesmo "sem requisito = passa" do
//    `PermissionsGuard`), e não consulta o banco;
//  - sem `req.user` => 403, fail-closed: este guard não substitui autenticação;
//  - chave SEM LINHA => ATIVADA (D4). O sistema nasce ligado; a linha só existe
//    para dizer "desligada", então quem não aparece na lista não bloqueia;
//  - chave COM `ativada: false` => 404. A rota não responde "desligado": para o
//    cliente a funcionalidade simplesmente não existe.
//
// Várias chaves são E (todas ligadas), não OU como no `@RequirePermission`:
// permissão é "basta uma destas", flag é "a funcionalidade depende destas".
//
// ⚠️ O RAIO DE ALCANCE de `tenancy.invites` NÃO é só `POST /tenants/:id/
// invitations`. MEDIDO 2026-10-18 (revisão adversarial, achado F8): `POST /users`
// com `destino: {tipo: 'convite', token}` cria conta e membership COM A FLAG
// DESLIGADA — resposta 201. É de propósito (desligar convites não pode trancar
// quem JÁ tem o token; esse `POST /users` é o `accept` por outra porta), mas a
// herança era silenciosa: nem este cabeçalho nem o do controller a mencionavam.
// Se um dia "desligar convites" precisar significar "parar de dar entrada", é
// aqui que o raio muda — e este é o caminho que teria de mudar junto.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEYS_METADATA } from '../decorators/require-feature-flag.decorator.js';
import {
  FEATURE_FLAG_REPOSITORY_PORT,
  type FeatureFlagRepositoryPort,
} from '../../../domain/ports/feature-flag-repository.port.js';
import type { FeatureFlagKey } from '../../../../../shared/auth/feature-flag-catalog.js';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  // `@Inject` EXPLÍCITO nos dois: `tsx` (esbuild) não emite
  // `design:paramtypes`, o Nest passa `undefined`, e o guard morre com
  // `Cannot read properties of undefined` no primeiro request — o mesmo
  // defeito medido no `PermissionsGuard` (`permissions.guard.ts:28-36`), que
  // nenhuma spec unitária pegou porque ela monta o guard com `new`.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    // D13: a PORTA, não a use case. `listar`/`definir` exigem admin do sistema
    // (D2) e o ator de `convidar` é o dono de uma empresa — pela use case ele
    // levaria 403 de tudo.
    @Inject(FEATURE_FLAG_REPOSITORY_PORT)
    private readonly repositorio: FeatureFlagRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly FeatureFlagKey[] | undefined>(
      FEATURE_FLAG_KEYS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (req.user === undefined) {
      throw new ForbiddenException('autenticação requerida');
    }

    // D4 em UMA linha: só entra no conjunto o que está explicitamente
    // desligado, então a ausência vira "passa" sem `if` por chave.
    const desligadas = new Set(
      (await this.repositorio.listar()).filter((l) => !l.ativada).map((l) => l.chave),
    );
    const bloqueada = required.find((chave) => desligadas.has(chave));
    if (bloqueada !== undefined) {
      throw new NotFoundException();
    }
    return true;
  }
}

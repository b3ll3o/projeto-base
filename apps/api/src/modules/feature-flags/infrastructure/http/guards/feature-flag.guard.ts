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
// ⚠️ O RAIO DE ALCANCE de `tenancy.invites` tem TRÊS portas, e as três estão
// fechadas (2026-10-19). MEDIDO 2026-10-18 (revisão adversarial, achado F8):
// `POST /users` com `destino: {tipo: 'convite', token}` criava conta e
// membership com a flag DESLIGADA — resposta 201 — e `POST /invitations/accept`
// tinha o mesmo furo. As duas eram "de propósito", sob o argumento de que
// desligar convites não pode trancar quem JÁ tem o token. Isso é uma escolha de
// produto, não uma propriedade do sistema — e um comportamento que não está no
// código é um comportamento que ninguém reverte. Hoje as duas respondem 404 com a
// flag desligada, e a descrição no catálogo diz o que a chave cobre, sem cláusula
// de exceção.
//
// O `FeatureFlagGuard` NÃO serve para a porta `@Public()`: `canActivate` exige
// `req.user` (fail-closed, `feature-flag.guard.spec.ts:91-97`) e o `JwtAuthGuard`
// retorna ANTES de publicar `req.user` em rota pública (`jwt-auth.guard.ts:170-172`).
// Por isso `POST /users` checa a chave em `create()`, depois do Zod — é o único
// ponto onde `destino.tipo` é conhecido. As DUAS checagens usam `chaveDesligada`:
// D4 em um lugar só — MEDIDO 2026-10-19: o guard NÃO usava, tinha um `Set` inline
// que era a segunda cópia da semântica. A frase era verdade só no outro sentido.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { trace } from '@opentelemetry/api';
import { FEATURE_FLAG_KEYS_METADATA } from '../decorators/require-feature-flag.decorator.js';
import {
  FEATURE_FLAG_REPOSITORY_PORT,
  type FeatureFlagRepositoryPort,
} from '../../../domain/ports/feature-flag-repository.port.js';
import type { FeatureFlagKey } from '../../../../../shared/auth/feature-flag-catalog.js';

// Em escopo de módulo, como `profiles.use-cases.ts:47`: `tsx` (esbuild) não
// emite `design:paramtypes`, então um `Logger` recebido por construtor chega
// `undefined` — o mesmo defeito que os `@Inject` explícitos abaixo evitam.
const loggerBloqueio = new Logger('FeatureFlagBloqueio');

/**
 * D4 em UMA função: chave SEM LINHA é ATIVADA, chave COM `ativada: false` é
 * desligada.
 *
 * Exportada porque a semântica não pode ter duas cópias, e porque a única
 * "`FeatureFlagGuard` cobre o que o decorator cobre" não dá: esta é a segunda
 * porta de `tenancy.invites`, a que `@Public()` torna inalcançável para o guard.
 * D4 é exatamente o detalhe que a segunda cópia esquece — ela passa a exigir a
 * linha, e o sistema passa a nascer desligado.
 *
 * ⚠️ O guard chama isto UMA VEZ POR CHAVE, então `listar()` sai uma vez por
 * chave em `required` em vez de uma vez no total. São 1-2 chaves por rota hoje.
 * Se um dia houver dezenas, a otimização vai reintroduzir a segunda cópia — e
 * reintroduzi-la é justamente o defeito que esta função existe para evitar.
 */
export async function chaveDesligada(
  repositorio: FeatureFlagRepositoryPort,
  chave: FeatureFlagKey,
): Promise<boolean> {
  return (await repositorio.listar()).some((l) => !l.ativada && l.chave === chave);
}

/**
 * O 404 de bloqueio é idêntico ao 404 de rota inexistente, e **nenhum dos dois
 * é logado** — o filtro global só registra `>= 500`. Um dono de empresa que
 * manda um convite e recebe "não encontrado" não tem de onde começar.
 *
 * Uma função para os DOIS pontos de bloqueio (o guard e o `POST /users`), pelo
 * mesmo motivo de `chaveDesligada`: duas logs do mesmo evento divergem, e a que
 * diverge é a que ninguém lê.
 *
 * ⚠️ NUNCA registrar token. Em `POST /users` ele está literalmente no escopo
 * (`body.destino.token`), e log é onde segredo vaza com mais frequência. O spec
 * injeta um token conhecido e afirma que ele não aparece.
 *
 * O `traceId` é o mesmo que já volta ao cliente no corpo do 404
 * (`global-exception.filter.ts:63`), então a linha de log e o erro que o
 * usuário viu apontam para o mesmo lugar. ⚠️ "No mesmo lugar" nos DOIS
 * primeiros ramos — span OTel ativo, ou `request.id` do Fastify. No último
 * recurso os dois divergem, e MEDIDO 2026-10-19: aqui o fallback é `'-'`, lá
 * é `randomUUID()`. Quando os dois caem, a linha de log e o erro que o
 * usuário viu apontam para identificadores diferentes.
 */
export function registrarBloqueio(
  chave: FeatureFlagKey,
  // Opcional de propósito: um log que derruba a requisição que ele existe para
  // registrar troca um 404 honesto por um 500. MEDIDO 2026-10-19: o spec do
  // controller passa `undefined` (`SEM_TOKEN = undefined as never`), que o tsc
  // aceita porque `never` casa com tudo e que o runtime não aguenta.
  req?: { method?: string; url?: string; id?: string; user?: unknown },
): void {
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? req?.id ?? '-';
  const ator = (req?.user as { sub?: string } | undefined)?.sub ?? 'anônimo';
  // ⚠️ O `try` implementa o invariante que o JSDoc acima já declarava. Sem
  // ele, um `warn` que lança (stdout em pipe morto, disco cheio) impede o
  // `throw new NotFoundException()` de rodar: o filtro global mapeia 500 e
  // LOGA A STACK, trocando um 404 honesto por um 500.
  try {
    loggerBloqueio.warn(
      `[${traceId}] ${req?.method ?? '?'} ${req?.url ?? '?'} -> 404: feature "${chave}" ` +
        `desligada (ator: ${ator})`,
    );
  } catch {
    // Silêncio deliberado: um log que falha não pode virar resposta. O 404 é o
    // contrato desta porta e ele não depende de o log ter funcionado.
  }
}

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  // `@Inject` EXPLÍCITO nos dois: `tsx` (esbuild) não emite
  // `design:paramtypes`, o Nest passa `undefined`, e o guard morre com
  // `Cannot read properties of undefined` no primeiro request — o mesmo
  // defeito medido no `PermissionsGuard` (`permissions.guard.ts:31-43`), que
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

    const req = context.switchToHttp().getRequest<{
      user?: unknown;
      method?: string;
      url?: string;
      id?: string;
    }>();
    if (req.user === undefined) {
      throw new ForbiddenException('autenticação requerida');
    }

    for (const chave of required) {
      if (await chaveDesligada(this.repositorio, chave)) {
        registrarBloqueio(chave, req);
        throw new NotFoundException();
      }
    }
    return true;
  }
}

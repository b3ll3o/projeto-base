// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-membership.repository.ts
//
// pt-BR (Fase 4 — tenancy, 2026-10-16): implementação Prisma do
// TenantMembershipRepositoryPort — a resolução do perfil efetivo por empresa.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import type { TenantMembershipRepositoryPort } from '../../domain/ports/tenant-membership-repository.port.js';

@Injectable()
export class PrismaTenantMembershipRepository implements TenantMembershipRepositoryPort {
  /** pt-BR: mesmo motivo de `PrismaProfileRepository` — o parâmetro é
   *  tipado como `PrismaClient`, apagado em runtime; sem o token o Nest
   *  LANÇA no boot. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /**
   * Duas leituras, um contrato. Ver a porta (`tenant-membership-repository.port.ts`)
   * para o porquê de `tenantId === null` ser o bucket global e não "sem perfil".
   */
  async findProfileId(userId: string, tenantId: string | null): Promise<string | null> {
    if (tenantId === null) {
      // Bucket GLOBAL (D3): `users.profile_id` é a coluna que aponta para os
      // perfis de sistema do seed (`profiles.tenant_id IS NULL`). `deletedAt`
      // no filtro é o fail-closed herdado de `PrismaUserRepository.findById`:
      // conta soft-deleted resolve `null` e para de autorizar imediatamente,
      // em vez de depender do TTL do cache.
      //
      // ⚠️ `profile: { is: { tenantId: null } }` é a MESMA checagem de DONO do
      // ramo de baixo, e ela tem de estar nos dois: este é o filtro que um
      // repositório que devolvesse `users.profile_id` cru não teria. Sem ele,
      // um `profile_id` apontando para o perfil de uma EMPRESA resolveria em
      // qualquer requisição sem header — as permissões da Acme valendo em toda
      // parte, que é o oposto do que a coluna promete.
      // Revisão v1.5.0 (achado 2): a porta diz "a checagem de DONO é do
      // implementador", e só um dos dois ramos a fazia.
      const user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null, profile: { is: { tenantId: null } } },
        select: { profileId: true },
      });
      return user?.profileId ?? null;
    }

    // ⚠️ O `profile: { OR: [...] }` é o isolamento, e ele mora AQUI — não no
    // chamador e não no tipo. Um `profile_id` apontando para o perfil de outra
    // empresa resolveria o perfil alheio, e o sintoma (permissão a mais) é
    // indistinguível de um perfil corretamente configurado. Um filtro que
    // "ninguém pode esquecer" porque está na query é a única forma.
    // `tenantId: null` é aceito porque perfil GLOBAL serve a qualquer empresa
    // por definição (D3) — é o que permite o admin do sistema entrar numa.
    const row = await this.prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenantId,
        // Membership sem perfil atribuído (convite aceito) NÃO pode resolver
        // perfil nenhum. O efeito vem do `?? null` lá embaixo — o `not: null`
        // é redundante hoje e está aqui para o próximo que mexer no `?? null`
        // não abrir essa porta sem perceber. Um teste que afirme que ESTE
        // filtro é o que segura a propriedade mente: com ele removido o
        // resultado é o mesmo.
        profileId: { not: null },
        profile: { OR: [{ tenantId: null }, { tenantId }] },
        // Mesma razão do `deletedAt` do ramo global: a membership sobrevive ao
        // soft-delete do usuário, e sem este filtro uma conta apagada com token
        // ainda válido (15 min) voltaria a ter permissões na empresa — o
        // fail-closed do bucket `null` ficaria só pela metade.
        user: { deletedAt: null },
      },
      select: { profileId: true },
    });
    return row?.profileId ?? null;
  }

  async countByProfile(profileId: string): Promise<number> {
    // Sem `tenantId`: a trava de `ProfileUseCases.deletar` é global.
    return this.prisma.tenantMembership.count({ where: { profileId } });
  }
}

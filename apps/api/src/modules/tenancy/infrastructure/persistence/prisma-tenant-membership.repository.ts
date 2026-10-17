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

  /**
   * pt-BR (Fase 6): a escrita do perfil por empresa. `updateMany` e não
   * `update` porque o `where` é o PORTÃO — perfil de outra empresa ou pessoa
   * que não é membro caem em `count === 0` e viram `false`, em vez de uma
   * escrita que a leitura rejeitaria em silêncio (200 que não muda nada, que é
   * exatamente o defeito que esta fase fecha).
   *
   * O filtro de DONA é o MESMO conjunto do `findProfileId` acima, e mora na
   * query pelo mesmo motivo: um filtro que ninguém pode esquecer porque está
   * no `where`.
   */
  async atribuirPerfil(
    userId: string,
    tenantId: string,
    profileId: string | null,
  ): Promise<boolean> {
    // ⚠️ POR QUE A DONA DO PERFIL É VERIFICADA FORA DO `where` — e é o que o
    // spec de integração mediu. Duas mecanicas do Prisma empurram para cá:
    //
    //   1. `where` de `updateMany` NÃO pode filtrar pelo valor que está sendo
    //      ESCRITO — ele casaria linhas que JÁ têm aquele valor, e `count`
    //      daria 0 para toda escrita nova. (MEDIDO: `profileId` no `where`
    //      fazia `atribuirPerfil` devolver `false` em 100% dos casos.)
    //   2. `where` filtra a linha que EXISTE, e a linha pertence à membership,
    //      não ao perfil novo. Filtrar `profile: { OR: [...] }` ali protege a
    //      membership que hoje carrega o perfil — nada a ver com o perfil que
    //      está entrando. (MEDIDO: vestir o perfil da GLOBEX numa membership da
    //      ACME devolvia `true` e escrevia.)
    //
    // Sem o pré-acerto, a checagem de DONA só existiria na camada de cima
    // (`ProfileUseCases` R1), e a porta perderia a propriedade de "ninguém
    // esquece porque está aqui". `profile.tenant_id` é imutável no agregado
    // (`readonly #tenantId`, sem mutador), então ler-e-depois-escrever não tem
    // corrida a fechar: nenhuma escrita concorrente muda a dona entre as duas
    // queries. Por isso NÃO há `$transaction` aqui — uma transação custaria
    // uma conexão extra por atribuição sem fechar nada.
    if (profileId !== null) {
      const dona = await this.prisma.profile.findFirst({
        where: { id: profileId, OR: [{ tenantId: null }, { tenantId }] },
        select: { id: true },
      });
      if (dona === null) {
        return false;
      }
    }
    const r = await this.prisma.tenantMembership.updateMany({
      where: {
        userId,
        tenantId,
        // Mesmo fail-closed do `findProfileId`: a membership sobrevive ao
        // soft-delete, e sem este filtro uma conta apagada com token ainda
        // válido (15 min) voltaria a ter permissões na empresa.
        user: { deletedAt: null },
      },
      data: { profileId },
    });
    return r.count === 1;
  }

  async findRole(userId: string, tenantId: string): Promise<string | null> {
    // `user: { deletedAt: null }` pelo mesmo motivo do `findProfileId`: a
    // membership sobrevive ao soft-delete, e sem este filtro uma conta
    // apagada continuaria "administrando" a empresa até a membership ser
    // removida à mão.
    const row = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId, user: { deletedAt: null } },
      select: { role: true },
    });
    return row?.role ?? null;
  }
}

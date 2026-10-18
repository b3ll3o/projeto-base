// apps/api/src/modules/profiles/infrastructure/persistence/prisma-profile.repository.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): implementação Prisma do
// ProfileRepositoryPort. Cada operação carrega também as
// Authorizations em transação para o agregado vir completo.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import { Profile } from '../../domain/profile.aggregate.js';
import type { ProfileRepositoryPort } from '../../domain/ports/profile-repository.port.js';
import { profileId as makeProfileId } from '../../domain/value-objects/profile-id.vo.js';
import { profileSlug as makeProfileSlug } from '../../domain/value-objects/profile-slug.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/profile.exceptions.js';
import {
  abrirEscopo,
  comEscopo,
  escopoDoTenant,
} from '../../../../shared/infrastructure/prisma/escopo.js';

@Injectable()
export class PrismaProfileRepository implements ProfileRepositoryPort {
  /**
   * pt-BR: `@Inject(PrismaService)` explícito porque o parâmetro é tipado
   * como `PrismaClient` (interface material, apagada em runtime pelo TS).
   * Sem o token o Nest LANÇA no boot (`Nest can't resolve dependencies
   * of the PrismaProfileRepository (?)`) — não passa `undefined`.
   */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async findById(
    id: ReturnType<typeof makeProfileId>,
    tenantId: string | null,
  ): Promise<Profile | null> {
    // pt-BR (Fase 9 — RLS): o `id` é único no schema, então o filtro de DONA
    // NÃO vai para o `where` — quem o aplica é a policy, e ela aceita tanto a
    // linha da empresa quanto a global (é assim que um ator de empresa veste o
    // perfil global, via `users.profile_id`).
    const row = await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.profile.findUnique({
        where: { id: id.value },
        include: { authorizations: { select: { permissionKey: true } } },
      }),
    );
    if (row === null) {
      return null;
    }
    return this.toDomain(
      row,
      row.authorizations.map((a) => a.permissionKey),
    );
  }

  async findBySlug(
    slug: ReturnType<typeof makeProfileSlug>,
    tenantId: string | null,
  ): Promise<Profile | null> {
    // pt-BR (Fase 2 — tenancy, 2026-10-16): `slug` deixou de ser `@unique` — a
    // D3 exige que duas empresas tenham ambas um perfil "manager", então a
    // unicidade passou para dois índices PARCIAIS em SQL (migration
    // `20261017000000_...`), que o Prisma não sabe expressar em `findUnique`.
    //
    // Quem chama: `obterPorSlug` (`profiles.use-cases.ts:224`, hoje sem rota
    // HTTP) e a checagem de slug duplicado do `criar` (`:267`, que é o
    // `POST /admin/profiles`). NÃO é o `PermissionsGuard` nem o
    // `UserProfileCacheService` — o guard resolve perfil por `findById`, via
    // `users.profile_id`.
    //
    // Por que filtrar `tenantId: null` é o certo AGORA (e não um
    // "deny-by-default" conveniente): `Profile.criar` não tem `tenantId`, então
    // toda escrita da aplicação é global por construção, e
    // `profiles_slug_global_uniq` garante exatamente o mesmo par que este
    // código consulta. Código e índice estão coerentes por construção, não por
    // sorte.
    //
    // curto por natureza: na Fase 4 este método passa a receber o tenant e a
    // checagem de duplicado em `:179` precisa do mesmo escopo de empresa.
    //
    // pt-BR (Fase 8, 2026-10-17): o `tenantId` agora CHEGA do chamador, e o
    // filtro deixou de ser `null` fixo. MEDIDO que a versão anterior dava
    // 409 a um slug que só colide na EMPRESA do ator (o índice parcial
    // `(slug, tenant_id)`exists mas a checagem não o via), e — o inverso —
    // deixava passar o `criar` que depois morria em P2002 → 500.
    const row = await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.profile.findFirst({
        where: { slug: slug.value, tenantId },
        include: { authorizations: { select: { permissionKey: true } } },
      }),
    );
    if (row === null) {
      return null;
    }
    return this.toDomain(
      row,
      row.authorizations.map((a) => a.permissionKey),
    );
  }

  async list(tenantId: string | null): Promise<Profile[]> {
    const rows = await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.profile.findMany({
        // pt-BR (Fase 8): `null` = SEM filtro (o admin global, que é o único
        // que alcança o bucket de sistema); preenchido = só os perfis daquela
        // empresa. Ver a nota de sentido OPOSTO na porta.
        ...(tenantId === null ? {} : { where: { tenantId } }),
        orderBy: { createdAt: 'desc' },
        include: { authorizations: { select: { permissionKey: true } } },
      }),
    );
    return rows.map((r) =>
      this.toDomain(
        r,
        r.authorizations.map((a) => a.permissionKey),
      ),
    );
  }

  async save(profile: Profile): Promise<Profile> {
    const id = profile.id().value;
    // pt-BR (#97): âncora do optimistic lock é a versão em que o agregado
    // foi CARREGADO, não `version() - 1` — um save pode ter vários mutators
    // atrás (atualizar = renomear + alterarDescricao).
    const expectedVersion = profile.loadedVersion();
    const keys = profile.authorizations().toLista();
    const data = {
      slug: profile.slug().value,
      name: profile.nome().value,
      description: profile.descricao(),
      isAdmin: profile.isAdmin(),
      isSystem: profile.isSystem(),
    };

    const isNew = expectedVersion === 0;
    if (isNew) {
      // pt-BR (Fase 9): o escopo vem da DONA do agregado — perfil de empresa
      // abre a empresa, perfil global abre `'*'`. Abrir o bucket de sistema
      // para um perfil de empresa faria o `profiles_insercao`
      // (`aceita_global = false`) aceitar, e abrir a empresa para um perfil
      // global o faria recusar: os dois lados estão trocados.
      const created = await comEscopo(this.prisma, escopoDoTenant(profile.tenantId()), (tx) =>
        tx.profile.create({
          // pt-BR (#97): o nested-write de CREATE aceita só `create` /
          // `createMany` / `connectOrCreate` / `connect` — `deleteMany`
          // pertence ao tipo do UPDATE. Mandá-lo aqui dá
          // `PrismaClientValidationError` em runtime.
          data: {
            id,
            ...data,
            // pt-BR (Fase 8): a dona nasce do AGREGADO, não de parâmetro —
            // sem esta linha todo perfil criado por HTTP nascia
            // `tenant_id = NULL`, isto é, global.
            tenantId: profile.tenantId(),
            authorizations: { create: keys.map((k) => ({ permissionKey: k })) },
          },
          include: { authorizations: { select: { permissionKey: true } } },
        }),
      );
      return this.toDomain(
        created,
        created.authorizations.map((a) => a.permissionKey),
      );
    }

    // pt-BR (#97): as três escritas vão na MESMA `$transaction`. Sem ela,
    // um `createMany` que falha deixa o profile com a version incrementada
    // e ZERO permissões — o aggregate em memória e o banco divergem.
    await this.prisma.$transaction(async (tx) => {
      // pt-BR (Fase 9): mesmo escopo do CREATE, e pela MESMA razão. O
      // `profiles_atualizacao` é `USING (no_escopo_atual(tenant_id, false))` com
      // `WITH CHECK` idêntico — os DOIS lados conferem a dona, e é o `WITH CHECK`
      // que impede uma empresa de converter em dela o perfil global que veste.
      //
      // ⚠️ Este texto antes dizia `USING (aceita_global = true)` com
      // `WITH CHECK (aceita_global = false)`. MEDIDO FALSO: a policy no banco é a
      // de cima, desde o commit `5553ee3` ("a RLS da Fase 9 era legível E
      // apagável"). O comentário descrevia a versão anterior e convencia quem o
      // lessse de que `aceita_global` era o predicado.
      await abrirEscopo(tx, escopoDoTenant(profile.tenantId()));
      const updated = await tx.profile.updateMany({
        // pt-BR (Fase 9): `tenantId` no `where` é a TRAVA de dona, e a
        // ausência dele no `data` é a PROVA. As duas juntas fecham a lacuna
        // que a Fase 8 deixou aberta: `data` carregava `tenantId` do agregado
        // e o `where` não conferia a dona, então um agregado reidratado com
        // outra `tenantId` TRANSFERIA o perfil (ACME → GLOBEX e ACME → global,
        // ambos medidos) sem erro nenhum. O comentário anterior da linha 113
        // afirmava que o `readonly` do agregado garantia isto — garantia que o
        // repositório não verificava, e um comentário que afirma o que o código
        // não garante é pior do que nenhum.
        //
        // Por que `ConcurrencyException` e não uma exceção nova: o `count === 0`
        // abaixo não distingue "outra sessão alterou" de "a linha é de outra
        // dona", e nenhuma rota HTTP alcança a segunda forma hoje (o agregado é
        // `readonly` e nenhum mutador o muda). Pagar uma query extra para
        // nomear um 409 que ninguém alcança não é o que a fase pede.
        where: { id, version: expectedVersion, tenantId: profile.tenantId() },
        data: { ...data, version: profile.version() },
      });
      if (updated.count === 0) {
        throw new ConcurrencyException('Profile', expectedVersion, -1);
      }
      await tx.authorization.deleteMany({ where: { profileId: id } });
      if (keys.length > 0) {
        await tx.authorization.createMany({
          data: keys.map((k) => ({ profileId: id, permissionKey: k })),
        });
      }
    });
    return profile;
  }

  async delete(id: ReturnType<typeof makeProfileId>, tenantId: string | null): Promise<void> {
    await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.profile.delete({ where: { id: id.value } }),
    );
  }

  private toDomain(
    row: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      isAdmin: boolean;
      isSystem: boolean;
      tenantId: string | null;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    },
    authKeys: string[],
  ): Profile {
    return Profile.restaurarDePersistencia({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isAdmin: row.isAdmin,
      isSystem: row.isSystem,
      tenantId: row.tenantId,
      authorizations: authKeys,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    });
  }
}

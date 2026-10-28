// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-membership.repository.ts
//
// pt-BR (Fase 4 — tenancy, 2026-10-16): implementação Prisma do
// TenantMembershipRepositoryPort — a resolução do perfil efetivo por empresa.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import {
  comEscopoDeEmpresa,
  comEscopoDeSistema,
} from '../../../../shared/infrastructure/prisma/escopo.js';
import type {
  EmpresaDoUsuario,
  TenantMembershipRepositoryPort,
} from '../../domain/ports/tenant-membership-repository.port.js';

/**
 * A membership tem perfil EFETIVO?
 *
 * ⚠️ É o MESMO critério do `findProfileId` (o filtro `profile: { OR: [{ tenantId:
 * null }, { tenantId }] }`): o perfil precisa ser GLOBAL — que serve a qualquer
 * empresa por definição — ou DAQUELA empresa. A coluna CRUA (`profile_id` não
 * nulo) não basta: um `profile_id` apontado para o perfil de outra empresa não
 * resolve nada na API, e a empresa seria escolhida pelo funil do login sem que
 * a pessoa pudesse fazer nada nela.
 */
function temPerfilEfetivo(linha: {
  profile: { tenantId: string | null } | null;
  tenant: { id: string };
}): boolean {
  if (linha.profile === null) return false;
  return linha.profile.tenantId === null || linha.profile.tenantId === linha.tenant.id;
}

@Injectable()
export class PrismaTenantMembershipRepository implements TenantMembershipRepositoryPort {
  /** pt-BR: mesmo motivo de `PrismaProfileRepository` — o parâmetro é
   *  tipado como `PrismaClient`, apagado em runtime; sem o token o Nest
   *  LANÇA no boot. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /**
   * Duas leituras, um contrato. Ver a porta (`tenant-membership-repository.port.ts`)
   * para o porquê de `tenantId === null` ser o bucket global e não "sem perfil".
   *
   * pt-BR (Fase 9 — RLS): cada ramo abre o escopo ANTES de tocar a tabela, e é
   * por isso que o filtro de DONA do perfil e o `OR: [{tenantId: null}, …]` do
   * ramo de baixo dizem a mesma coisa que as policies dizem. Com a conexão de
   * runtime, `escopoDoTenant(tenantId)` deixa passar o perfil DAQUELA empresa e o
   * global — e a subquery `profile` do Prisma é o mesmo perfil que a policy
   * `profiles_leitura` filtra. Sem o `comEscopo`, a policy devolveria zero linhas
   * e este método resolveria `null` para qualquer pessoa.
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
      const user = await comEscopoDeSistema((tx) =>
        tx.user.findFirst({
          where: { id: userId, deletedAt: null, profile: { is: { tenantId: null } } },
          select: { profileId: true },
        }),
      );
      return user?.profileId ?? null;
    }

    // ⚠️ O `profile: { OR: [...] }` é o isolamento, e ele mora AQUI — não no
    // chamador e não no tipo. Um `profile_id` apontando para o perfil de outra
    // empresa resolveria o perfil alheio, e o sintoma (permissão a mais) é
    // indistinguível de um perfil corretamente configurado. Um filtro que
    // "ninguém pode esquecer" porque está na query é a única forma.
    // `tenantId: null` é aceito porque perfil GLOBAL serve a qualquer empresa
    // por definição (D3) — é o que permite o admin do sistema entrar numa.
    const row = await comEscopoDeEmpresa(this.prisma, tenantId, (tx) =>
      tx.tenantMembership.findFirst({
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
      }),
    );
    return row?.profileId ?? null;
  }

  async countByProfile(profileId: string): Promise<number> {
    // Sem `tenantId`: a trava de `ProfileUseCases.deletar` é global — um perfil
    // usado na empresa B não pode ser apagado só porque a empresa A não usa.
    //
    // pt-BR (Fase 9): por isso o escopo é o de SISTEMA e não o da empresa do
    // ator. É uma leitura de contagem, sem dado pessoal, e restricting ao tenant
    // do ator transformaria "a trava é global" em "a trava é por empresa" — o
    // que a porta diz que NÃO é. A porta `tenant-membership-repository.port.ts`
    // documenta essa escolha; quem mudar uma coisa sem a outra quebra a
    // semântica de `deletar` sem nenhum teste ficar vermelho.
    return comEscopoDeSistema((tx) => tx.tenantMembership.count({ where: { profileId } }));
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
    // queries.
    //
    // pt-BR (Fase 9): agora HÁ `$transaction`, e por um motivo novo — as duas
    // queries precisam do MESMO escopo, e o escopo só existe dentro de uma
    // transação (ver `escopo.ts`). O comentário anterior ("uma transação
    // custaria uma conexão extra por atribuição sem fechar nada") foi escrito
    // quando não havia policy; hoje ela é a que garante que a checagem de DONA
    // e a escrita estão no mesmo escopo, e portanto que `count === 0` significa
    // "fora do meu escopo" e não "outra sessão".
    return comEscopoDeEmpresa(this.prisma, tenantId, async (tx) => {
      if (profileId !== null) {
        const dona = await tx.profile.findFirst({
          where: { id: profileId, OR: [{ tenantId: null }, { tenantId }] },
          select: { id: true },
        });
        if (dona === null) {
          return false;
        }
      }
      const r = await tx.tenantMembership.updateMany({
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
    });
  }

  // ⚠️ "TEM LINHA" ≡ "É MEMBRO" hoje, e isso é uma propriedade medida, não um
  // atalho. Medido 2026-10-17:
  //   - Convite PENDENTE não mora aqui — vive na tabela `Invitation`
  //     (`prisma-tenant-onboarding.repository.ts:337`), e só vira linha aqui
  //     quando o `criar_membership` roda, o que exige aceitar o convite.
  //   - `tenant_memberships` não tem coluna de status: medido no schema, a
  //     escrita de status não tem NENHUM escritor. Adicionar a coluna agora
  //     produz um schema que mente — `status = 'ativo'` em todo lugar, e a
  //     primeira vez que alguém usar a coluna descobre que nada a preenche.
  //
  // Quando a remoção de membro existir, o `REVOKE DELETE` da migration
  // `20261020000005` (linha 74) precisa mudar e aí ESTE método é o lugar que
  // passa a precisar de status. Até lá, uma coluna nova aqui é peso sem dono.
  async findRole(userId: string, tenantId: string): Promise<string | null> {
    // `user: { deletedAt: null }` pelo mesmo motivo do `findProfileId`: a
    // membership sobrevive ao soft-delete, e sem este filtro uma conta
    // apagada continuaria "administrando" a empresa até a membership ser
    // removida à mão.
    const row = await comEscopoDeEmpresa(this.prisma, tenantId, (tx) =>
      tx.tenantMembership.findFirst({
        where: { userId, tenantId, user: { deletedAt: null } },
        select: { role: true },
      }),
    );
    return row?.role ?? null;
  }

  /**
   * As empresas a que o usuário pertence, com o papel dele em cada uma.
   *
   * ⚠️ O escopo é o de SISTEMA, e o filtro é o `userId` DENTRO do `where`.
   * Não é uma abertura: a lista atravessa empresas, e o que a restringe é o
   * filtro — o id do ator vem do token de sessão, e a linha devolvida é só a
   * dele. Mesma justificativa de `buscarConvitePorToken`.
   *
   * `user: { deletedAt: null }` pelo mesmo motivo dos outros métodos: a
   * membership sobrevive ao soft-delete, e uma conta apagada não deve ver as
   * empresas na listagem.
   */
  async listarEmpresasDoUsuario(userId: string): Promise<EmpresaDoUsuario[]> {
    const linhas = await comEscopoDeSistema((tx) =>
      tx.tenantMembership.findMany({
        where: { userId, user: { deletedAt: null } },
        select: {
          role: true,
          profile: { select: { tenantId: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
        // ⚠️ A ORDEM É FUNCIONAL, não estética: o funil do login (no web) leva a
        // pessoa para a PRIMEIRA empresa da lista. A membership SEM perfil
        // efetivo — o convidado que ainda não recebeu perfil — vai para o FIM.
        //
        // MEDIDO 2026-10-21: ordenando só por data, quem tinha sido convidada
        // numa empresa ANTES de criar a empresa própria era levada para a
        // empresa da UNTIGUAL, onde não pode fazer nada, em vez da empresa de
        // que é DONA. O sintoma é um 403 na tela principal, sem causa nomeada.
        //
        // ⚠️ A chave de ordenação no BANCO é só a data. `profileId` é um UUID
        // DISTINTO por membership, então ele NÃO desempata: colocá-lo como
        // primeira chave entregava a ordem ao ALEATÓRIO do UUID, e a recência
        // que o texto prometia não existia. A partição (com perfil efetivo
        // antes de sem) é feita em JS, logo abaixo, sobre a lista já
        // ordenada por data.
        orderBy: [{ createdAt: 'desc' }],
      }),
    );

    // Com perfil efetivo ANTES de sem perfil: quem ainda não recebeu perfil
    // não pode fazer nada na empresa, e o funil não pode levá-lo para lá.
    // Entre as que TÊM perfil, a ordem é a da data — a mais recente primeiro,
    // que é a em que a pessoa está agora.
    //
    // ⚠️ "Perfil efetivo" é o MESMO critério do `findProfileId` (linha 78): o
    // perfil precisa ser GLOBAL (`tenantId` nulo) ou DAQUELA empresa. Ler a
    // coluna crua (`profileId !== null`) contaria como "com perfil" uma
    // membership apontada para o perfil de OUTRA empresa — e o funil escolheria
    // essa empresa, onde a API não resolve perfil nenhum: zero permissões, sem
    // causa nomeada.
    const ordenadas = [
      ...linhas.filter((linha) => temPerfilEfetivo(linha)),
      ...linhas.filter((linha) => !temPerfilEfetivo(linha)),
    ];

    return ordenadas.map((linha) => ({
      id: linha.tenant.id,
      nome: linha.tenant.name,
      slug: linha.tenant.slug,
      role: linha.role,
    }));
  }
}

// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-onboarding.repository.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): a fronteira transacional da D5.
//
// Este arquivo é o ÚNICO do sistema que escreve `users` + `tenants` +
// `profiles` + `tenant_memberships` na mesma transação, e isso é
// deliberado: `$transaction` é um detalhe do Prisma, então ele só pode
// morar aqui — um `application/` que chamasse dois repositórios não teria
// como prometer "tudo ou nada", e o estado intermediário (conta sem
// empresa) é observável de fora.
//
// Precedente do bloco `$transaction`: `prisma-profile.repository.ts:125`.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import {
  type ConviteParaAceitar,
  type ConviteParaEmitir,
  type ConvitePendente,
  type EmpresaParaAbrir,
  type TenantOnboardingPort,
  type UsuarioParaProvisionar,
} from '../../domain/ports/tenant-onboarding.port.js';
import {
  ConviteInvalidoException,
  ConviteJaEmitidoException,
  EmpresaJaExisteException,
} from '../../domain/exceptions/tenancy.exceptions.js';
import { listAllPermissions } from '../../../../shared/auth/permissions-catalog.js';
import {
  abrirEscopo,
  comEscopo,
  escopoDoTenant,
} from '../../../../shared/infrastructure/prisma/escopo.js';
import { Prisma } from '@prisma/client';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * `P2002` cru vira **500**, e o cliente não tem como distinguir "empresa já
 * existe" de "banco fora do ar". O repo já pagou essa conta em
 * `prisma-user.repository.ts` (`traduzirFalhaDeUnicidade`), que existe pela
 * MESMA razão.
 *
 * Cada chamador traduz o SEU: `tx.tenant.create` só tem `slug` único, e
 * `invitation.create` só tem `(tenantId, email)` realisticamente colidível — o
 * `token` é `randomBytes(32)`. Traduzir aqui, e não por `meta.target`, evita
 * depender do formato que o Prisma usa para nomear a constraint.
 */
function ehViolacaoDeUnicidade(erro: unknown): erro is Prisma.PrismaClientKnownRequestError {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/**
 * Nome da constraint que estourou, normalizado para string.
 *
 * O Prisma muda o formato de `meta.target` entre versões (`'token'`,
 * `['tenantId','email']`, `'tenantId_email'`), então a checagem é por
 * **substring** e não por igualdade: o objetivo é só separar "colidiu o
 * token" de "colidiu o par empresa+e-mail", e não reproduzir o formato.
 */
function constraintQueEstourou(erro: Prisma.PrismaClientKnownRequestError): string {
  const alvo = (erro.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(alvo) ? alvo.join(',') : String(alvo ?? '');
}

@Injectable()
export class PrismaTenantOnboardingRepository implements TenantOnboardingPort {
  /** pt-BR: `@Inject` EXPLÍCITO pelo mesmo motivo de
   *  `PrismaTenantMembershipRepository` — `tsx` (esbuild) não emite
   *  `design:paramtypes`, então sem o token o Nest injeta `undefined` aqui e a
   *  falha só aparece no primeiro `POST /users { destino: … }`. O parâmetro é
   *  tipado como `PrismaClient` (apagado em runtime), que é o que o spec de
   *  integração consegue passar. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async provisionarEmpresaPropria(
    usuario: UsuarioParaProvisionar,
    empresa: EmpresaParaAbrir,
  ): Promise<void> {
    // O `try` fica FORA do `$transaction`: a tradução é da fronteira HTTP, e
    // uma exceção de domínio jogada de dentro da transação a abortaria do
    // mesmo jeito — mas deixá-la dentro tornaria o `catch` ambíguo entre
    // "falhou o slug" e "falhou a transação".
    try {
      await this.prisma.$transaction(async (tx: Tx) => {
        const tenant = await tx.tenant.create({
          data: { name: empresa.nome, slug: empresa.slug },
        });

        // pt-BR (Fase 9 — RLS): o escopo só pode ser aberto DEPOIS do insert do
        // tenant e ANTES do insert do perfil, e é esta a ordem que a phase exige.
        // O `WITH CHECK` de `profiles_insercao` avalia `no_escopo_atual(tenant_id,
        // false)` no momento do insert, e `tenant.id` é o próprio dado que a
        // policy compara — abrir o escopo depois deixaria a criação da empresa
        // (o caminho D5 inteiro) sem poder produzir o admin que ela exige. O
        // `INSERT` em `tenants` tem `WITH CHECK (true)` justamente para este
        // caso: abrir a própria empresa acontece sem escopo nenhum.
        await abrirEscopo(tx, tenant.id);

        // O admin nasce JUNTO com a empresa, e é DELA (`tenantId`). Ver o
        // port: buscar um admin global traria dois problemas — o seed não roda
        // em teste, e um admin global dentro de uma empresa cliente é um perfil
        // com TODAS as permissões do catálogo fora do alcance daquela empresa.
        const perfil = await tx.profile.create({
          data: {
            slug: 'admin',
            name: 'Administrador',
            isAdmin: true,
            isSystem: true,
            tenantId: tenant.id,
          },
        });

        await tx.authorization.createMany({
          data: listAllPermissions().map((permissionKey) => ({
            profileId: perfil.id,
            permissionKey,
          })),
        });

        await tx.user.create({
          data: {
            id: usuario.id,
            name: usuario.nome,
            email: usuario.email,
            passwordHash: usuario.senhaHash,
            // `users.profile_id` fica NULL: sem header a pessoa não está em
            // empresa nenhuma, e a Fase 4 resolve esse bucket para zero
            // permissões. Encher esta coluna seria desfazer a Fase 4.
            profileId: null,
            createdAt: usuario.createdAt,
            updatedAt: usuario.createdAt,
            version: 1,
          },
        });

        await tx.tenantMembership.create({
          data: {
            userId: usuario.id,
            tenantId: tenant.id,
            role: 'owner',
            profileId: perfil.id,
          },
        });
      });
    } catch (erro) {
      // pt-BR (Fase 5, revisão — achado 2): o comentário anterior dizia que
      // "`slug` é o ÚNICO unique de `tenants`, então qualquer P2002 aqui é o
      // slug". Isso era FALSO e o código fazia o que o comentário dizia não
      // fazer: `tx.user.create` (linha 109) está dentro deste mesmo `try` e
      // `users.email` também é único. MEDIDO: `provisionarEmpresaPropria` com
      // email já em uso respondia 409 EMPRESA_JA_EXISTE / "Já existe uma
      // empresa com este identificador" — o cliente é mandado mudar o SLUG
      // quando o que colide é o EMAIL, e seguir a dica dá retry infinito.
      //
      // O discriminador já existia, 70 linhas abaixo, criado por
      // `emitirConvite` para exatamente isto. `consumirEEntrar` fica sem catch
      // de propósito: lá o P2002 de `users.email` sobe cru, e o 500 resultante
      // está documentado como `shortcut:` — só sob CORRIDA, porque o caminho
      // comum já devolve 409 por `findByEmail` antes de chegar aqui.
      if (ehViolacaoDeUnicidade(erro) && constraintQueEstourou(erro).includes('slug')) {
        throw new EmpresaJaExisteException(empresa.slug);
      }
      throw erro;
    }
  }

  async entrarPorConvite(convite: ConviteParaAceitar): Promise<void> {
    await this.consumirEEntrar(convite, null);
  }

  async criarContaPorConvite(
    convite: ConviteParaAceitar,
    usuario: UsuarioParaProvisionar,
  ): Promise<void> {
    await this.consumirEEntrar(convite, usuario);
  }

  /**
   * Núcleo transacional dos dois caminhos de entrada por convite. `novaConta`
   * `null` = a conta já existe (D4: 1 conta, N empresas).
   *
   * MEDIDO 2026-10-17: o caminho de conta nova reusava só `entrarPorConvite` e
   * morria com `tenant_memberships_user_id_fkey` — a membership era criada sem
   * a linha em `users`, porque a escrita do usuário só existe no caminho da
   * empresa própria. Um `users` e uma membership caem ou caem juntos.
   */
  private async consumirEEntrar(
    convite: ConviteParaAceitar,
    novaConta: UsuarioParaProvisionar | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: Tx) => {
      // pt-BR (Fase 9 — RLS): o escopo começa em SISTEMA e é APERFEIÇOADO assim
      // que o convite revela a empresa. Isso não é um atalho: o `tenant_id` só
      // é conhecido DEPOIS de ler o convite, e a `invitations_leitura` já está
      // filtrando por escopo. Abrir `'*'` é a única forma de sair do
      // chicken-and-egg — e o token (ou o id de convite, que o caso de uso só
      // teve porque já leu o convite) é a credencial desse acesso. A partir da
      // linha seguinte a sessão está no escopo da empresa e todo o resto é
      // filtrado normalmente.
      await abrirEscopo(tx, escopoDoTenant(null));

      // Relido dentro da transação, e não reusado o que o caso de uso viu:
      // entre a validação e aqui o convite pode ter sido usado por outra
      // pessoa. O `updateMany` condicionado a `accepted_at IS NULL` é o que
      // transforma essa janela em erro em vez de membership duplicada.
      const atual = await tx.invitation.findUnique({ where: { id: convite.invitationId } });
      if (atual === null) {
        throw new ConviteInvalidoException('nao-encontrado');
      }

      // A partir daqui a sessão é a DA empresa do convite, e o `updateMany`
      // abaixo só alcança o convite dela.
      await abrirEscopo(tx, escopoDoTenant(atual.tenantId));

      const consumido = await tx.invitation.updateMany({
        where: { id: atual.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (consumido.count !== 1) {
        throw new ConviteInvalidoException('ja-aceito');
      }

      if (novaConta !== null) {
        await tx.user.create({
          data: {
            id: novaConta.id,
            name: novaConta.nome,
            email: novaConta.email,
            passwordHash: novaConta.senhaHash,
            // Mesma razão de `provisionarEmpresaPropria`: sem header a pessoa
            // não está em empresa nenhuma, e a Fase 4 resolve esse bucket para
            // zero permissões. O perfil vem da membership, não daqui.
            profileId: null,
            createdAt: novaConta.createdAt,
            updatedAt: novaConta.createdAt,
            version: 1,
          },
        });
      }

      await tx.tenantMembership.create({
        data: {
          userId: convite.userId,
          tenantId: atual.tenantId,
          // O papel vem do CONVITE, nunca do chamador: um port que aceitasse
          // `role` da entrada transformaria o aceite em escalada — qualquer um
          // com um token próprio criaria o próprio owner.
          role: atual.role,
          // `profile_id` NULL: quem entra por convite não tem perfil até o
          // admin da empresa atribuir (Fase 4: NULL = zero permissões).
          profileId: null,
        },
      });
    });
  }

  async emitirConvite(convite: ConviteParaEmitir): Promise<void> {
    try {
      await comEscopo(this.prisma, escopoDoTenant(convite.tenantId), (tx) =>
        tx.invitation.create({
          data: {
            tenantId: convite.tenantId,
            email: convite.email,
            role: convite.role,
            token: convite.token,
            expiresAt: convite.expiresAt,
          },
        }),
      );
    } catch (erro) {
      // Dois uniques existem em `invitations`: `token` e `(tenantId, email)`, e
      // a resposta HTTP correta é DIFERENTE para cada um. Traduzir os dois
      // como "já emitido" mentiria sobre o token — que está no corpo da
      // resposta de quem emite, e dizer "convite já emitido" para uma colisão
      // de token aponta o cliente para o campo errado.
      //
      // Colisão de token é, na prática, impossível: o segredo sai de
      // `randomBytes(32)` e o produtor é quem o gera. Ela continua sendo
      // propagada crua de propósito — é o estado que o `randomBytes` no use
      // case é quem protege.
      if (ehViolacaoDeUnicidade(erro)) {
        if (constraintQueEstourou(erro).includes('token')) {
          throw erro;
        }
        throw new ConviteJaEmitidoException(convite.tenantId, convite.email);
      }
      throw erro;
    }
  }

  async buscarConvitePorToken(token: string): Promise<ConvitePendente | null> {
    // pt-BR (Fase 9 — RLS): escopo de SISTEMA, e é a única leitura do sistema que
    // é legitimamente ampla. O `token` é a CREDENCIAL: `randomBytes(32)` gerado
    // fora do banco, impossível de adivinhar e de colidir (`emitirConvite` trata
    // colisão como erro cru). A query é um `findUnique` por esse token — o
    // resultado é a linha do convite ou nada.
    //
    // O que isto NÃO é: uma abertura para listar convites de outras empresas. O
    // primeiro `it()` de `prisma-rls.integration.spec.ts` mede o fail-closed do
    // escopo ausente; o escopo `'*'` aqui é uma ESCOLHA, e ela está escrita
    // aqui — quem achar que é engano lê este comentário antes de mudar.
    const linha = await comEscopo(this.prisma, escopoDoTenant(null), (tx) =>
      tx.invitation.findUnique({
        where: { token },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          acceptedAt: true,
          expiresAt: true,
        },
      }),
    );
    return linha;
  }
}

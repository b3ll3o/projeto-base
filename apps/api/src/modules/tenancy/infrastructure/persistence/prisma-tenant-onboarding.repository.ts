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
import { AssinaturaDeMembership } from '../../../../shared/infrastructure/prisma/assinatura-de-membership.js';
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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    @Inject(AssinaturaDeMembership) private readonly assinatura: AssinaturaDeMembership,
  ) {}

  /**
   * Grava a vínculo de empresa — por FUNÇÃO, nunca por `INSERT` direto.
   *
   * A migration `20261020000004` revoga `INSERT` em `tenant_memberships` do
   * `app_runtime`. Motivo: a membership é a credencial que
   * `usuario_no_escopo(alvo)` mede, e `memberships_insercao` conferia só o
   * `tenant_id` — o `user_id` era dado do cliente. Um ator de qualquer empresa
   * criava o próprio vínculo com a conta de terceiro e passava a enxergar
   * `users` dela (MEDIDO: `SELECT name FROM users` ia de `[alice]` para
   * `[alice, bruno]`).
   *
   * Os DOIS caminhos legítimos passam por aqui: `provisionarEmpresaPropria`
   * (a empresa acabou de nascer nesta transação) e `consumirEEntrar` (o convite
   * pendente acabou de ser consumido nesta transação). Nenhum dos dois é "um
   * membro adicionando outro membro", e é por isso que o banco não tem como
   * separá-los por policy — não há predicado que distinga "owner criando o
   * primeiro admin" de "membro adicionando um desconhecido".
   *
   * ⚠️ `criar_membership` é `SECURITY DEFINER`: ela grava com os privilégios do
   * dono, porque a credencial que autoriza esta escrita não é legível sob a RLS
   * de quem escreve. Ver a §"POR QUE REVOKE E NÃO UM PREDICADO NA POLICY" da
   * migration.
   *
   * ⚠️ E a FUNÇÃO SOZINHA NÃO FECHAVA. Com `REVOKE INSERT` e uma função sem
   * assinatura, a escalada continuava inteira — MEDIDO, chamando a função com o
   * `user_id` alheio, `SELECT name FROM users` ia de `[alice]` para
   * `[alice, bruno]`. A função era o `INSERT` revogado com um caminho mais
   * curto. Por isso o 5º parâmetro: um HMAC do corpo assinado, que o
   * `app_runtime` não consegue produzir porque não consegue ler a chave.
   */
  private async criarMembership(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    role: string,
    profileId: string | null,
  ): Promise<void> {
    // ⚠️ Os casts `::uuid` não são cosmeticamente iguais ao resto: o Prisma
    // envia todo parâmetro de `$queryRaw` como `text`, e a função é
    // `(uuid, uuid, text, uuid, text)`. MEDIDO sem os casts: 500 com
    // `criar_membership(text, text, text, text, text) does not exist` — que é a
    // falha mais invisível possível, porque o nome da função está certo e a
    // migration aplica sem erro.
    const assinatura = this.assinatura.assinar(userId, tenantId, role, profileId);
    await tx.$queryRaw`SELECT criar_membership(${userId}::uuid, ${tenantId}::uuid, ${role}::text, ${profileId}::uuid, ${assinatura}::text)`;
  }

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
        // pt-BR (Fase 10 — a correção): a sessão nasce em SISTEMA, na PRIMEIRA
        // linha, e só desce para a empresa quando a empresa já existe.
        //
        // MEDIDO 2026-10-17, e a causa não é a que o texto sugeria. Não é a
        // `WITH CHECK` da policy: `INSERT` cru em `tenants` SEM escopo nenhum
        // PASSA (a `tenants_insercao` é `WITH CHECK (true)`). O que barra é o
        // `RETURNING` — o Prisma emite `INSERT ... RETURNING`, e a linha do
        // RETURNING é avaliada pela policy de **SELECT**, `tenants_leitura`
        // → `no_escopo_atual(id, false)` → FALSE sem escopo. O Postgres reporta
        // isso como "new row violates row-level security policy".
        //
        // Ou seja: em tabela com RLS, toda escrita do Prisma precisa de um
        // escopo onde a linha também seja LEGÍVEL — o `RETURNING` não perdoa.
        // E o mesmo vale para `users_insercao`, que exige `escopo_atual() = '*'`
        // e barrava o `tx.user.create` logo abaixo (o `POST /users` com destino
        // 'empresa' e o cadastro por convite, as DUAS portas de entrada,
        // respondendo 500).
        //
        // A policy NÃO afrouxa para acomodar: `memberships_insercao`
        // (`no_escopo_atual(tenant_id, false)`) já deixa uma sessão de empresa
        // criar membership na PRÓPRIA empresa, então permitir INSERT em `users`
        // sob escopo de empresa daria "cria conta + cria membership = herda o
        // perfil da casa".
        await abrirEscopo(tx, escopoDoTenant(null));

        const tenant = await tx.tenant.create({
          data: { name: empresa.nome, slug: empresa.slug },
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

        // pt-BR (Fase 9 — RLS): daqui em diante a sessão é a DA empresa nova, e
        // o `INSERT` do perfil avalia `no_escopo_atual(tenant_id, false)` no
        // momento do insert — `tenant.id` é o próprio dado que a policy
        // compara, então abrir o escopo depois deixaria a criação da empresa
        // (o caminho D5 inteiro) sem poder produzir o admin que ela exige.
        //
        // O segundo `abrirEscopo` sobrescreve o primeiro: `set_config(..., true)`
        // é LOCAL, e a última chamada dentro da transação é a que vale.
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

        await this.criarMembership(tx, usuario.id, tenant.id, 'owner', perfil.id);
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

      // pt-BR (Fase 10 — a correção): a conta nova nasce no bucket de SISTEMA,
      // que é onde a sessão ainda está (a linha 222). MEDIDO: escrita depois do
      // estreitamento, ela morria em `42501` — a `users_insercao` exige
      // `escopo_atual() = '*'`. Mesma razão de `provisionarEmpresaPropria`, e
      // pelo mesmo motivo a policy não afrouxa: `memberships_insercao` já deixa
      // a sessão de empresa criar membership na própria empresa.
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

      await this.criarMembership(
        tx,
        convite.userId,
        atual.tenantId,
        // O papel vem do CONVITE, nunca do chamador: um port que aceitasse
        // `role` da entrada transformaria o aceite em escalada — qualquer um
        // com um token próprio criaria o próprio owner.
        atual.role,
        // `profile_id` NULL: quem entra por convite não tem perfil até o
        // admin da empresa atribuir (Fase 4: NULL = zero permissões).
        null,
      );
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

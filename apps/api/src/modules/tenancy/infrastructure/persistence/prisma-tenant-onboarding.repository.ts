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
  type EmpresaAberta,
  type EmpresaParaAbrir,
  type TenantOnboardingPort,
  type UsuarioParaProvisionar,
} from '../../domain/ports/tenant-onboarding.port.js';
import {
  ConviteInvalidoException,
  ConviteJaEmitidoException,
  EmpresaJaExisteException,
} from '../../domain/exceptions/tenancy.exceptions.js';
import { perfisDaEmpresa } from '../../domain/perfis-da-empresa.js';
import { EmailAlreadyInUseException } from '../../../users/domain/exceptions/user.exceptions.js';
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
 * ⚠️ A tradução é por ONDE a escrita falhou, e NUNCA pelo nome da constraint.
 * `meta.target` do Prisma é o nome do CAMPO — e ele vem **NULL** quando o
 * Postgres tem a unicidade como ÍNDICE e não como constraint, que é como as
 * migrations deste repo criam o `@unique` do `users.email`.
 *
 * MEDIDO 2026-10-22, contra o banco local (o mesmo shape do de produção): o
 * `meta` do P2002 é `{"modelName":"User","target":null}` e a mensagem é
 * "Unique constraint failed on the (not available)". O `catch` que casava com
 * o nome casava com a STRING VAZIA, e o P2002 subia cru como **500** — o
 * cadastro com e-mail repetido respondia "banco fora do ar" num pedido que
 * era um CONFLITO.
 *
 * A suíte de integração NÃO pegou isso: no banco de testcontainers o `target`
 * vem preenchido, e o mesmo código passava verde. Um discriminador que só
 * funciona num dos dois bancos é pior do que nenhum — é um que mente sobre o
 * banco em que a aplicação roda.
 *
 * O que sobra é o que `prisma-user.repository.ts` já faz: a ESCRITA diz qual
 * é a constraint. `tx.tenant.create` só tem `slug` único; `tx.user.create` só
 * tem `email` (o `id` é um UUID novo). E `invitation.create` é o único caso
 * com DOIS uniques na MESMA escrita — `token` e `(tenantId, email)` — e ele é
 * decidido por LEITURA, não por nome.
 */
function ehViolacaoDeUnicidade(erro: unknown): erro is Prisma.PrismaClientKnownRequestError {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/**
 * A membership bateu na unicidade de `(user_id, tenant_id)`?
 *
 * ⚠️ NÃO é um P2002: o `INSERT` é `tx.$queryRaw` (a função `criar_membership`),
 * e o Prisma reporta a falha de uma query CRUA como **P2010**, com o código do
 * Postgres no `meta.code` (23505 = unique_violation). MEDIDO 2026-10-21:
 * `PrismaClientKnownRequestError`, `code: 'P2010'`, `meta.code: '23505'`,
 * mensagem `Key (user_id, tenant_id)=(…) already exists.`
 *
 * ⚠️ Por que a mensagem é conferida: o P2010 cobre QUALQUER falha de query
 * crua, e traduzir todas por 409 esconderia um banco fora do ar.
 */
function ehViolacaoDeUnicidadeDaMembership(
  erro: unknown,
): erro is Prisma.PrismaClientKnownRequestError {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2010')
    return false;
  const meta = erro.meta as { code?: unknown; message?: unknown } | undefined;
  return meta?.code === '23505' && String(meta?.message ?? '').includes('user_id, tenant_id');
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
    // ⚠️ SEM `try`/`catch` em volta: as DUAS escritas que podem violar
    // unicidade traduzem o P2002 NO PRÓPRIO LUGAR — `criarEmpresa` (o slug) e
    // o `tx.user.create` (o e-mail) abaixo. A tradução é da fronteira HTTP, e
    // uma exceção de domínio jogada de dentro da transação a aborta do mesmo
    // jeito — e é por isso que ela é lançada de onde o erro aconteceu, e não
    // de um `catch` em volta, que não saberia qual das duas constraints
    // estourou.
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

      const empresaCriada = await this.criarEmpresa(tx, empresa);

      // ⚠️ A CORRIDA do e-mail: dois cadastros com o MESMO e-mail passam pelo
      // `findByEmail` antes de qualquer commit, e o segundo morre aqui. O
      // `P2002` cru subiria como **500** — e 500 é "banco fora do ar", a
      // mensagem mais falsa que existe num pedido de cadastro.
      //
      // A tradução mora NO LUGAR da escrita, e não num `catch` em volta da
      // transação: o `email` é o ÚNICO `@unique` de `users` que pode colidir
      // aqui (o `id` é um UUID novo), então um P2002 neste ponto É o e-mail.
      // E o `GlobalExceptionFilter` já sabe traduzir a exceção de
      // `users/domain` em 409 `EMAIL_IN_USE` — a mensagem que o formulário
      // sabe mostrar. O caminho sequencial já devolve 409 pelo `findByEmail`;
      // este `catch` é a rede da janela.
      try {
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
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) {
          throw new EmailAlreadyInUseException(usuario.email);
        }
        throw erro;
      }

      // pt-BR (Fase 9 — RLS): daqui em diante a sessão é a DA empresa nova, e
      // o `INSERT` do perfil avalia `no_escopo_atual(tenant_id, false)` no
      // momento do insert — `tenant.id` é o próprio dado que a policy
      // compara, então abrir o escopo depois deixaria a criação da empresa
      // (o caminho D5 inteiro) sem poder produzir o admin que ela exige.
      //
      // O segundo `abrirEscopo` sobrescreve o primeiro: `set_config(..., true)`
      // é LOCAL, e a última chamada dentro da transação é a que vale.
      await abrirEscopo(tx, empresaCriada.id);

      const perfilId = await this.criarPerfisDaEmpresa(tx, empresaCriada.id);

      await this.criarMembership(tx, usuario.id, empresaCriada.id, 'gerente', perfilId);
    });
  }

  /**
   * Abre a empresa para uma conta que **JÁ EXISTE** — a segunda etapa do
   * onboarding (a página de criação de empresa).
   *
   * O MESMO núcleo de `provisionarEmpresaPropria`, sem a escrita de `users`:
   * empresa → os TRÊS perfis da empresa (`gerente`, `coordenador`,
   * `funcionario`) → membership de `gerente` vestindo o perfil `gerente`. A
   * única diferença é que a conta
   * vem de fora.
   */
  async abrirEmpresaParaUsuario(userId: string, empresa: EmpresaParaAbrir): Promise<EmpresaAberta> {
    // A tradução do `slug` acontece em `criarEmpresa`, que é a PRIMEIRA
    // escrita — e aqui o `users.email` nem participa, porque a conta já
    // existe e não é tocada. Por isso não há `catch` em volta.
    return await this.prisma.$transaction(async (tx: Tx) => {
      // A sessão nasce em SISTEMA: o `RETURNING` do `INSERT` em `tenants` é
      // avaliado pela policy de SELECT, que sem escopo devolve zero linhas.
      // Mesma razão de `provisionarEmpresaPropria`.
      await abrirEscopo(tx, escopoDoTenant(null));

      const empresaCriada = await this.criarEmpresa(tx, empresa);

      // Daqui em diante a sessão é a DA empresa nova — o `INSERT` do perfil e
      // a `criar_membership` comparam o `tenant_id` com o GUC.
      await abrirEscopo(tx, empresaCriada.id);

      const perfilId = await this.criarPerfisDaEmpresa(tx, empresaCriada.id);

      await this.criarMembership(tx, userId, empresaCriada.id, 'gerente', perfilId);

      return { id: empresaCriada.id, nome: empresa.nome, slug: empresaCriada.slug };
    });
  }

  /**
   * A primeira escrita do caminho de empresa: a linha em `tenants`.
   *
   * Fica isolada porque as DUAS entradas de empresa precisam dela no MESMO
   * ponto — antes de o escopo descer, e antes de a conta ser gravada.
   *
   * ⚠️ A tradução do P2002 mora AQUI, e não num `catch` em volta da
   * transação: o `slug` é o ÚNICO `@unique` de `tenants`, e a empresa é a
   * PRIMEIRA escrita — então um P2002 neste ponto é o slug, e só o slug. É a
   * ESCRITA que diz qual é a constraint, e não o nome dela (ver
   * `ehViolacaoDeUnicidade` para por que o nome não serve).
   */
  private async criarEmpresa(
    tx: Tx,
    empresa: EmpresaParaAbrir,
  ): Promise<{ id: string; slug: string }> {
    try {
      const tenant = await tx.tenant.create({
        data: { name: empresa.nome, slug: empresa.slug },
      });
      return { id: tenant.id, slug: tenant.slug };
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new EmpresaJaExisteException(empresa.slug);
      }
      throw erro;
    }
  }

  /**
   * Os TRÊS perfis DA empresa — gerente, coordenador e funcionário — e o id do
   * `gerente`, que é o perfil de quem cria a empresa.
   *
   * ⚠️ O `slug` é `gerente`, e não `admin`: o conjunto da empresa tem três
   * perfis, e o "administrador" deixou de ser o ÚNICO papel — ele virou o
   * GERENTE, ao lado do coordenador e do funcionário. Ver
   * `domain/perfis-da-empresa.ts`
   * para o conjunto e para a escolha de cada um.
   *
   * Os perfis nascem JUNTO com a empresa, e são DELA (`tenantId`). Ver o port:
   * buscar um admin global traria dois problemas — o seed não roda em teste, e
   * um admin global dentro de uma empresa cliente é um perfil com TODAS as
   * permissões do catálogo fora do alcance daquela empresa.
   *
   * ⚠️ Precisa do escopo DA empresa: a `profiles_insercao` compara
   * `tenant_id` com o GUC no momento do insert.
   */
  private async criarPerfisDaEmpresa(tx: Tx, tenantId: string): Promise<string> {
    const perfis = perfisDaEmpresa();
    let idDoGerente: string | null = null;

    for (const perfil of perfis) {
      const criado = await tx.profile.create({
        data: {
          slug: perfil.slug,
          name: perfil.nome,
          isAdmin: perfil.isAdmin,
          // ⚠️ `isSystem: true` CONGELA o perfil: `atribuir`, `revogar`,
          // `atualizar` e `deletar` recusam com 403
          // `PROFILE_SYSTEM_PROTECTED`. É deliberado — o trio é o CATÁLOGO, e
          // uma empresa que apaga o seu `coordenador` deixa de ter os três perfis
          // que toda empresa tem. Quem precisa de um papel sob medida CRIA um
          // perfil novo (`POST /admin/profiles`), e esse não é de sistema.
          //
          // MEDIDO 2026-10-21: o arquivo de domínio prometia o contrário
          // ("o dono pode ajustar as permissões depois") — e a promessa era
          // falsa. O código estava certo; a prosa é que mentia.
          isSystem: true,
          tenantId,
        },
      });

      if (perfil.permissoes.length > 0) {
        await tx.authorization.createMany({
          data: perfil.permissoes.map((permissionKey) => ({
            profileId: criado.id,
            permissionKey,
          })),
        });
      }

      if (perfil.slug === 'gerente') idDoGerente = criado.id;
    }

    // O conjunto do catálogo TEM o `gerente`, então isto só acontece se o
    // catálogo mudar. Falhar alto é melhor do que devolver `null` como id de
    // perfil: a membership nasceria com `profile_id` NULL e o gerente ficaria
    // sem nenhuma permissão, sem erro em lugar nenhum.
    if (idDoGerente === null) {
      throw new Error('perfil "gerente" ausente do conjunto de perfis da empresa');
    }
    return idDoGerente;
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

      // ⚠️ A VALIDADE é revalidada AQUI, e não só no caso de uso. A checagem de
      // `exigirConviteValido` (tenancy.use-cases.ts) roda ANTES desta
      // transação, numa conexão diferente: um convite que vence na janela entre
      // as duas é aceito por uma transação já VENCIDA — a membership é criada e
      // o convite fica CONSUMIDO (irrecuperável para as outras tentativas).
      //
      // A revalidação do `acceptedAt` já era atômica (`updateMany` condicionado
      // a `accepted_at IS NULL` + contagem); a do `expiresAt` não era, e é a
      // mesma classe de janela.
      if (atual.expiresAt !== null && atual.expiresAt.getTime() <= Date.now()) {
        throw new ConviteInvalidoException('expirado');
      }

      // pt-BR (Fase 10 — a correção): a conta nova nasce no bucket de SISTEMA,
      // que é onde a sessão ainda está (a linha 222). MEDIDO: escrita depois do
      // estreitamento, ela morria em `42501` — a `users_insercao` exige
      // `escopo_atual() = '*'`. Mesma razão de `provisionarEmpresaPropria`, e
      // pelo mesmo motivo a policy não afrouxa: `memberships_insercao` já deixa
      // a sessão de empresa criar membership na própria empresa.
      if (novaConta !== null) {
        try {
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
        } catch (erro) {
          // ⚠️ A CORRIDA do e-mail: dois cadastros com o MESMO e-mail passam
          // pelo `findByEmail` antes de qualquer commit, e o segundo morre
          // aqui. O `P2002` cru subia como **500** — e 500 é "banco fora do
          // ar", a mensagem mais falsa que existe num pedido de cadastro.
          //
          // A exceção é a de `users/domain` (que `tenancy` já importa, como
          // importa o `UserNotFoundException`), e não uma nova aqui: a regra
          // do e-mail é do módulo de USUÁRIOS, e é o `GlobalExceptionFilter`
          // que já sabe traduzir `EmailAlreadyInUseException` em 409
          // `EMAIL_IN_USE` — que é a mensagem que o formulário sabe mostrar.
          //
          // O caminho sequencial já devolve 409 pelo `findByEmail`; este
          // `catch` é a rede da janela.
          //
          // ⚠️ O discriminador é a ESCRITA, e não o nome da constraint: o
          // `email` é o único `@unique` de `users` que pode colidir aqui (o
          // `id` é um UUID novo), e `meta.target` vem NULL quando o Postgres
          // tem a unicidade como índice (ver `ehViolacaoDeUnicidade`).
          if (ehViolacaoDeUnicidade(erro)) {
            throw new EmailAlreadyInUseException(novaConta.email);
          }
          throw erro;
        }
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

      try {
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
      } catch (erro) {
        // ⚠️ A conta JÁ é membro da empresa: o dono pode se convidar, e o
        // `@@unique([userId, tenantId])` barra o vínculo duplicado. Sem esta
        // tradução, o erro do banco subia como **500** — indistinguível de
        // banco fora do ar, para um pedido que é um CONFLITO (409).
        //
        // ⚠️ O `P2010` (query crua) é distinguido pelo `meta.code` 23505 e
        // pela chave da mensagem — ver `ehViolacaoDeUnicidadeDaMembership`.
        if (ehViolacaoDeUnicidadeDaMembership(erro)) {
          throw new ConviteInvalidoException('ja-membro');
        }
        throw erro;
      }
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
      // ⚠️ A distinção é por LEITURA, e não pelo nome da constraint: o
      // `meta.target` do Prisma vem NULL quando o Postgres tem a unicidade
      // como ÍNDICE e não como constraint (ver `ehViolacaoDeUnicidade`), e aí
      // o nome não diz nada — o `catch` casava com a string vazia e a colisão
      // de e-mail subia crua como **500**. A pergunta é factual, e a resposta
      // é determinística: o convite para (empresa, e-mail) EXISTE? Se existe,
      // foi ele que colidiu; se não existe, o que colidiu foi o `token`.
      //
      // Colisão de token é, na prática, impossível: o segredo sai de
      // `randomBytes(32)` e o produtor é quem o gera. Ela continua sendo
      // propagada crua de propósito — é o estado que o `randomBytes` no use
      // case é quem protege.
      if (ehViolacaoDeUnicidade(erro)) {
        if (await this.existeConvitePara(convite.tenantId, convite.email)) {
          throw new ConviteJaEmitidoException(convite.tenantId, convite.email);
        }
        throw erro;
      }
      throw erro;
    }
  }

  /**
   * Já existe um convite para o par (empresa, e-mail)?
   *
   * É a pergunta que decide o 409 do convite, e ela é respondida por LEITURA
   * — não pelo nome da constraint (ver `ehViolacaoDeUnicidade`).
   *
   * ⚠️ A leitura é FORA da transação que morreu: uma transação abortada não
   * responde a `findUnique` ("current transaction is aborted"), e o P2002
   * aborta. Por isso ela abre a sua própria, no escopo da empresa.
   */
  private async existeConvitePara(tenantId: string, email: string): Promise<boolean> {
    const encontrado = await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.invitation.findUnique({ where: { tenantId_email: { tenantId, email } } }),
    );
    return encontrado !== null;
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

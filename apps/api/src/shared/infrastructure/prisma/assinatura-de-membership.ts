// apps/api/src/shared/infrastructure/prisma/assinatura-de-membership.ts
//
// pt-BR (Fase 10+ — RLS, 2026-10-17): a assinatura que a aplicação entrega a
// `criar_membership`.
//
// ⚠️ Este arquivo é o OUTRO LADO de um contrato medido. A função
// `criar_membership` (migration `20261020000004`) só grava se o corpo que ela
// monta casar com um HMAC-SHA256 de uma chave que o papel `app_runtime` não lê.
// Se os dois lados divergirem em um byte, o onboarding cai com
// `42501 assinatura invalida` — e nada mais quebra. Por isso o formato está
// escrito uma vez aqui e uma vez lá, e os dois lados têm teste.
//
// POR QUE A CHAVE VEM DO BANCO E NÃO DO ENV
// A chave precisa estar num lugar que `app_runtime` NÃO alcance, e o papel de
// runtime é justamente quem roda a aplicação: um segredo em `env` está a um
// `SELECT` de distância de quem conseguir injetar SQL — que é exatamente o
// atacante que este controle existe para travar. Na tabela, ele lê a linha e
// recebe `42501`.
//
// ⚠️ A leitura acontece NO BOOT, e o cache não é otimização: é o que torna
// possível ler em algum momento (dentro da transação do onboarding a sessão é
// `app_runtime` numa policy de empresa, e a chave não pertence a nenhuma).
//
// ⚠️ (issue #180) A leitura é por uma FUNÇÃO `SECURITY DEFINER`
// (`ler_chave_de_assinatura`, migration `20261126000000`), e NÃO por uma
// conexão de DONO. MEDIDO: a URI de dono (`DIRECT_DATABASE_URL`) chegava ao
// container da api pelo `env_file`, e o próprio código a lia — de modo que o
// processo que expõe a API carregava a credencial que ignora RLS, e quem
// conseguisse ler o `env` (SSRF reflexivo, erro que imprima o env, o
// comprometimento de qualquer dependência) tinha acesso a TODAS as empresas.
// A função roda com o poder do dono e devolve UM segredo; o papel de runtime
// só precisa de `EXECUTE` — e a aplicação nunca vê a senha do dono.

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from './prisma.service.js';

/** Nome da chave. Tem de bater com o `INSERT` da migration `20261020000004`. */
const NOME_DA_CHAVE = 'membership';

/**
 * O corpo assinado, byte a byte, como a migration monta.
 *
 * O formato é COMO CONTAGEM, não separador: cada campo vira `<bytes>:<valor>`.
 * `corpo_de_membership` (SQL) faz o mesmo com `octet_length`.
 *
 * ⚠️ A primeira versão usava `\n` entre os campos, com a justificativa de que
 * assim nenhuma permutação colidiria. MEDIDO: era falso —
 * `corpo('a\nb', 'c', 'member', null)` e `corpo('a', 'b', 'c\nmember', '')`
 * davam o mesmo corpo. `profile_id` vira `''` quando é nulo (e não `'null'`),
 * e a assinatura normaliza do MESMO lado que grava, senão a role gravada e a
 * role assinada divergem.
 *
 * ⚠️ O `??` no `role` NÃO é o mesmo que o `||`, e a primeira versão usava `||`.
 * O SQL é `COALESCE(p_role, 'member')`, e `COALESCE` trata SÓ `NULL`: para a
 * string vazia ele devolve a própria vazia. O `||` do JavaScript trata `''` como
 * falsy e normaliza para `'member'`. Com `role = ''` os dois lados assinariam
 * corpos diferentes — o Node `6:member`, o Postgres `0:` — e o `criar_membership`
 * cairia com `42501 assinatura invalida`. MEDIDO o alcance: `role` não é alcançável
 * vazio hoje (os dois únicos produtores passam os literais `'gerente'`, em
 * `prisma-tenant-onboarding.repository.ts:215`, e `'member'`, em
 * `tenancy.use-cases.ts:90`), então isto é latente; mas o spec desta função
 * FIXAVA a forma errada como esperada, e viraria armadilha no dia em que `role`
 * passasse a ser configurável.
 */
export function corpoDaAssinatura(
  userId: string,
  tenantId: string,
  role: string,
  profileId: string | null,
): string {
  // ⚠️ `Buffer.byteLength` e não `String.length`: o SQL usa `octet_length`, e os
  // dois só coincidem em ASCII. Uma role com acento faria a assinatura do Node
  // e a do Postgres divergirem, e o sintoma seria `42501` no onboarding.
  const campo = (valor: string): string => `${Buffer.byteLength(valor, 'utf8')}:${valor}`;
  return campo(userId) + campo(tenantId) + campo(role ?? 'member') + campo(profileId ?? '');
}

@Injectable()
export class AssinaturaDeMembership implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssinaturaDeMembership.name);
  private segredo: Buffer | undefined;

  // ⚠️ (issue #180) O cliente é o de RUNTIME (`PrismaService`) — o mesmo que
  // serve as requisições. Antes, este módulo abria um `PrismaClient` com a
  // URI de DONO, e a credencial de superuser ficava dentro do processo.
  // pt-BR: `@Inject(PrismaService)` é NECESSÁRIO — o param é uma CLASSE, e
  // o `tsx` (esbuild) não emite `design:paramtypes`, então sem o token o Nest
  // resolve `undefined` e o defeito só se manifesta em dev, no primeiro boot
  // (o mesmo motivo do `PrismaUserRepository`).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Falha ALTO e no boot, nunca no primeiro onboarding.
   *
   * O sintoma de uma chave ausente adiada é o pior possível: a aplicação sobe,
   * passa no health check, e morre no primeiro cadastro de empresa — em
   * produção, com um 500 que não aponta para a causa. Ler a chave aqui troca
   * esse 500 por um processo que não sobe.
   */
  async onModuleInit(): Promise<void> {
    // ⚠️ (issue #180) A leitura vai pela FUNÇÃO `SECURITY DEFINER`, com a
    // credencial de RUNTIME — e NÃO por uma conexão de DONO. A URI de dono
    // (`DIRECT_DATABASE_URL`) não é lida aqui, nem em nenhum outro ponto do
    // processo: ela é do CLI do Prisma (`migrate`), e o `compose` a remove do
    // ambiente do processo Node antes do `exec` (ver o ENTRYPOINT da imagem).
    try {
      const linhas = await this.prisma.$queryRaw<Array<{ segredo: Buffer }>>`
        SELECT ler_chave_de_assinatura(${NOME_DA_CHAVE}::text) AS segredo
      `;
      const segredo = linhas[0]?.segredo;
      if (!segredo) {
        throw new Error(
          `chaves_de_assinatura não tem a linha '${NOME_DA_CHAVE}'. As migrations rodaram? A tabela é criada pela 20261020000004.`,
        );
      }
      if (segredo.byteLength < 32) {
        throw new Error(
          `a chave de assinatura de membership tem ${segredo.byteLength} bytes; o mínimo útil para HMAC-SHA256 é 32.`,
        );
      }
      this.segredo = segredo;
      this.logger.log('Chave de assinatura de membership carregada');
    } catch (erro) {
      // ⚠️ A falha ALTO e no boot: a chave ausente adiada vira um 500 no
      // primeiro cadastro de empresa, em produção. E a mensagem precisa dizer
      // a CAUSA — a função não existir (migration rodou?) e a chave não
      // existir (a migration que a semeia rodou?) são defeitos diferentes.
      throw new Error(
        `chave de assinatura de membership ilegível: ${erro instanceof Error ? erro.message : String(erro)}. ` +
          'A função `ler_chave_de_assinatura` existe (migration 20261126000000) e a linha `membership` foi semeada (migration 20261020000004)?',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.segredo = undefined;
  }

  /**
   * Assina uma chamada de `criar_membership`.
   *
   * Síncrona de propósito: o segredo está em memória desde o boot, e tornar
   * isto `Promise` só faria o repository esperar por algo que já está pronto.
   */
  assinar(userId: string, tenantId: string, role: string, profileId: string | null): string {
    if (!this.segredo) {
      throw new Error(
        'chave de assinatura de membership não carregada: `AssinaturaDeMembership.onModuleInit` não rodou.',
      );
    }
    return createHmac('sha256', this.segredo)
      .update(corpoDaAssinatura(userId, tenantId, role, profileId), 'utf8')
      .digest('hex');
  }
}

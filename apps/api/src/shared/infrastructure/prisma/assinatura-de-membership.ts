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
// A função roda com o poder do dono e devolve UM segredo — e a aplicação nunca
// vê a senha do dono.
//
// ⚠️ (issue #180, 2ª revisão) QUEM LÊ A CHAVE É O PAPEL DE SISTEMA, E O DE
// RUNTIME NÃO PODE.
//
// MEDIDO: a 1ª versão deste PR lia a chave pelo cliente de RUNTIME, e a
// migration dava `EXECUTE` da função ao runtime. Aí a escalada é INTEIRA: o
// runtime lê o segredo (32 bytes), monta o corpo, assina com `hmac()` e
// chama `criar_membership` — MEDIDO, a vítima ganhou `role: owner` numa
// empresa alheia.
//
// E a leitura é pelo papel de SISTEMA porque a assinatura só tem valor como
// assinatura de um corpo que a APLICAÇÃO pediu: o material que só ela tem é a
// chave. O papel de sistema é a credencial ELEVADA da aplicação (a que o
// bucket de sistema exige por conceito, #118), e MEDIDO: ele já insere
// membership direto — a escalada que a assinatura impede é a do papel de
// RUNTIME, que é o que serve as requisições.

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { clienteDeSistema } from './escopo.js';

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

  // ⚠️ (issue #180, 2ª revisão) O cliente é o de SISTEMA
  // (`clienteDeSistema()`), e NÃO o de runtime.
  //
  // MEDIDO: a 1ª versão deste PR lia a chave pelo `PrismaService` (o cliente
  // de RUNTIME), e a migration dava `EXECUTE` da função de leitura ao
  // runtime. Aí a escalada é inteira: o runtime lê o segredo (32 bytes),
  // assina um corpo com `hmac()` e chama `criar_membership` — MEDIDO, a
  // vítima ganhou `role: owner` numa empresa alheia.
  //
  // A assinatura é a barreira que impede o runtime de escrever membership
  // onde não pode (a RLS filtra a escrita direta — MEDIDO, `42501`), e por
  // isso a chave tem de ficar FORA do alcance do runtime. O papel de SISTEMA
  // é a credencial elevada da APLICAÇÃO (a que o bucket de sistema exige por
  // conceito, #118), e ela já está no ambiente dela.
  //
  // pt-BR: SEM CONSTRUTOR, e sem `PrismaService` — o cliente vem do
  // AMBIENTE (`clienteDeSistema()` resolve a `SYSTEM_DATABASE_URL`), e é o
  // mesmo padrão do `PrismaLoginLockoutRepository`. Injetar o `PrismaService`
  // (o cliente de RUNTIME) seria ruído que sugere o oposto do que o código
  // faz.
  constructor() {}

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
    // credencial de SISTEMA — e NÃO por uma conexão de DONO nem pelo cliente
    // de runtime. A URI de dono (`DIRECT_DATABASE_URL`) não é lida aqui, nem
    // em nenhum outro ponto do processo: ela é do CLI do Prisma (`migrate`),
    // e o `compose` a remove do ambiente do processo Node antes do `exec`
    // (ver o ENTRYPOINT da imagem).
    //
    // E o runtime NÃO pode ler a chave (migration
    // `20261127000000_leitura_da_chave_fora_do_runtime`): MEDIDO, quando
    // podia, a escalada era inteira.
    try {
      const linhas = await clienteDeSistema().$queryRaw<Array<{ segredo: Buffer }>>`
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

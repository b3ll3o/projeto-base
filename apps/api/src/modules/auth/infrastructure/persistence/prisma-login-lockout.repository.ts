// apps/api/src/modules/auth/infrastructure/persistence/prisma-login-lockout.repository.ts
//
// Adapter Prisma do CONTADOR de tentativas de login por conta (issue #182).
//
// ── POR QUE A CREDENCIAL DE SISTEMA, E NÃO A DE RUNTIME ─────────────────────
//
// O login acontece ANTES de existir empresa: não há header de tenant, e a
// busca do usuário é no bucket de SISTEMA (`findByEmail(email, null)` →
// `escopoDoTenant(null)` → `'*'`). O contador vive no mesmo caminho.
//
// E a migration `20261125000000_tentativas_de_login` faz
// `REVOKE ALL … FROM app_runtime`: a credencial que a doc do repo classifica
// como "a que mais vaza" NÃO alcança esta tabela.
//
// ⚠️ A tabela tem `email` e NÃO tem `tenant_id`, e por isso NÃO tem RLS: o
// predicado de escopo do banco (`no_escopo_atual`) compara a coluna com a
// EMPRESA (`app.tenant_id`), e aqui a coluna é a CONTA. Não há policy que
// case as duas — e uma policy que não filtra nada é pior do que nenhuma.

import { Injectable } from '@nestjs/common';
import { comEscopoDeSistema } from '../../../../shared/infrastructure/prisma/escopo.js';
import {
  JANELA_DE_LOCKOUT_DE_LOGIN_MS,
  type LoginLockoutPort,
} from '../../domain/ports/login-lockout.port.js';

@Injectable()
export class PrismaLoginLockoutRepository implements LoginLockoutPort {
  // ⚠️ SEM CONSTRUTOR, e sem `PrismaService`: o cliente que esta classe usa
  // é o de SISTEMA, e ele vem do AMBIENTE (`comEscopoDeSistema` resolve o
  // `SYSTEM_DATABASE_URL`). Injetar o `PrismaService` (o cliente de RUNTIME)
  // seria ruído que sugere o oposto do que o código faz.

  async tentativas(email: string): Promise<number> {
    const linha = await comEscopoDeSistema(async (tx) =>
      tx.tentativaDeLogin.findUnique({
        where: { email },
        select: { tentativas: true, janelaIniciadaEm: true },
      }),
    );
    if (linha === null) return 0;
    // ⚠️ A JANELA EXPIRADA conta como ZERO: o contador zera sozinho. Sem
    // isto, uma conta que falhou 5 vezes há um dia continuaria travada para
    // sempre — e o travamento SEMPRE LIBERARIA (o `registrarFalha` é quem
    // reabre a janela) significaria que a conta só destrava com um novo
    // erro, o que é pior do que a trava.
    if (janelaExpirada(linha.janelaIniciadaEm)) return 0;
    return linha.tentativas;
  }

  async registrarFalha(email: string): Promise<void> {
    const agora = new Date();
    const inicioDaJanela = new Date(agora.getTime() - JANELA_DE_LOCKOUT_DE_LOGIN_MS);
    await comEscopoDeSistema(async (tx) => {
      // ⚠️ O INCREMENTO é ATÓMICO e está no próprio SQL (`tentativas + 1`):
      // ler e depois gravar perderia a contagem quando dois logins errados
      // chegassem ao mesmo tempo — e o limite efetivo seria MAIOR do que o
      // declarado.
      //
      // A JANELA é reaberta só quando a anterior EXPIROU: se a janela está
      // viva, as falhas somam na MESMA janela (é o que faz 5 falhas em 15
      // minutos travar a conta, e não 5 falhas em 15 minutos cada).
      await tx.$executeRaw`
        INSERT INTO login_tentativas (email, tentativas, janela_iniciada_em, ultima_tentativa_em)
        VALUES (${email}, 1, ${agora}, ${agora})
        ON CONFLICT (email) DO UPDATE SET
          tentativas = CASE
            WHEN login_tentativas.janela_iniciada_em <= ${inicioDaJanela} THEN 1
            ELSE login_tentativas.tentativas + 1
          END,
          janela_iniciada_em = CASE
            WHEN login_tentativas.janela_iniciada_em <= ${inicioDaJanela} THEN ${agora}
            ELSE login_tentativas.janela_iniciada_em
          END,
          ultima_tentativa_em = ${agora}
      `;
    });
  }

  async limpar(email: string): Promise<void> {
    await comEscopoDeSistema(async (tx) => {
      // ⚠️ O `DELETE` e não um `UPDATE` para zero: a linha some, e a próxima
      // falha recomeça a contagem do 1 numa janela nova. Um `UPDATE` para 0
      // manteria a `janela_iniciada_em` antiga — e a janela velha (que já
      // expirou) reabriria o contador com o valor ZERO, que é o mesmo
      // efeito, mas com uma linha a mais para podar.
      await tx.tentativaDeLogin.deleteMany({ where: { email } });
    });
  }
}

/** A janela começou há mais de `JANELA_DE_LOCKOUT_DE_LOGIN_MS`? */
function janelaExpirada(inicioDaJanela: Date): boolean {
  const agora = Date.now();
  return agora - inicioDaJanela.getTime() > JANELA_DE_LOCKOUT_DE_LOGIN_MS;
}

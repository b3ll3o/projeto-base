// apps/api/src/shared/idempotency/infrastructure/prisma-idempotency.service.ts
//
// pt-BR (2026-11-10 — conformidade do system design): a implementação Prisma
// do registro de idempotência.
//
// ⚠️ POR QUE A CREDENCIAL DE SISTEMA, E NÃO A DE RUNTIME
//
// A resposta guardada é PII de outra empresa — o corpo do `POST /users` tem
// nome, e-mail e id. A RLS é o que impede o papel de runtime de ler a base de
// outra empresa, e uma tabela SEM RLS legível pelo runtime seria a primeira
// brecha desse controle. Por isso a tabela é do caminho de SISTEMA — o mesmo
// do `refresh_tokens` (ADR-0007) — e o preço é o de usar o pool do cliente de
// sistema, e não o do runtime.
//
// Ver `docs/adr/0011-idempotencia-de-escrita.md`.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { comEscopoDeSistema } from '../../infrastructure/prisma/escopo.js';
import {
  VALIDADE_DA_CHAVE_HORAS,
  type HeadersDaResposta,
  type IdempotencyPort,
  type ImpressaoDePedido,
  type ReservaDeChave,
} from '../application/idempotency.port.js';

const VALIDADE_EM_MS = VALIDADE_DA_CHAVE_HORAS * 60 * 60 * 1000;

@Injectable()
export class PrismaIdempotencyService implements IdempotencyPort {
  async reservar(pedido: ImpressaoDePedido): Promise<ReservaDeChave> {
    // Duas tentativas: a segunda existe para o caso em que a linha estava
    // EXPIRADA. A poda roda no boot do container (`prepara-papeis.sh`), e não
    // a cada request — então uma chave expirada pode ainda estar na tabela
    // quando o cliente a reusa.
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      if (await this.tentarReservar(pedido)) return { estado: 'livre' };

      const linha = await this.ler(pedido.chave, pedido.ator);
      // A linha sumiu entre o INSERT e o SELECT (poda concorrente): tenta de novo.
      if (linha === null) continue;
      // A linha EXPIROU: ela não vale mais, e a chave pode ser reusada.
      if (linha.expiresAt.getTime() <= Date.now()) {
        await this.liberar({ chave: pedido.chave, ator: pedido.ator });
        continue;
      }
      // A chave existe com OUTRO pedido: o cliente reusou a chave por engano.
      if (linha.fingerprint !== pedido.impressao) return { estado: 'conflito' };
      // A chave está reservada e a operação não terminou.
      if (linha.status === null) return { estado: 'em_voo' };
      // A resposta guardada é o ENVELOPE: o corpo e os headers que a
      // aplicação escreveu.
      const envelope = (linha.response ?? {}) as {
        body?: unknown;
        headers?: HeadersDaResposta;
      };
      return {
        estado: 'replay',
        status: linha.status,
        resposta: envelope.body ?? null,
        headers: envelope.headers ?? {},
      };
    }

    // As duas tentativas falharam sem estado legível: a resposta segura é
    // "em voo" — o cliente recebe 409 e repete depois.
    return { estado: 'em_voo' };
  }

  async guardar(input: {
    chave: string;
    ator: string;
    status: number;
    resposta: unknown;
    headers: HeadersDaResposta;
  }): Promise<void> {
    await comEscopoDeSistema(async (tx) => {
      await tx.idempotencyKey.update({
        where: { key_actor: { key: input.chave, actor: input.ator } },
        data: {
          status: input.status,
          // A coluna `response` guarda a resposta INTEIRA: o corpo e os
          // headers que a aplicação escreveu. O replay repõe os dois — sem
          // os headers, a resposta do retry não seria a mesma da original
          // (o `ETag` do `POST /users` é um deles).
          response: {
            body: input.resposta === undefined ? null : input.resposta,
            headers: input.headers,
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  async liberar(input: { chave: string; ator: string }): Promise<void> {
    await comEscopoDeSistema(async (tx) => {
      await tx.idempotencyKey.deleteMany({
        where: { key: input.chave, actor: input.ator },
      });
    });
  }

  /**
   * Tenta reservar a chave — e diz se RESERVOU.
   *
   * O `P2002` é o "a chave já existe": ele não é erro aqui, é o caminho
   * normal do replay. Qualquer outro erro propaga.
   */
  private async tentarReservar(pedido: ImpressaoDePedido): Promise<boolean> {
    try {
      await comEscopoDeSistema(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            key: pedido.chave,
            actor: pedido.ator,
            route: pedido.rota,
            fingerprint: pedido.impressao,
            expiresAt: new Date(Date.now() + VALIDADE_EM_MS),
          },
        });
      });
      return true;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return false;
      }
      throw erro;
    }
  }

  private async ler(chave: string, ator: string) {
    return comEscopoDeSistema((tx) =>
      tx.idempotencyKey.findUnique({ where: { key_actor: { key: chave, actor: ator } } }),
    );
  }
}

// apps/api/src/shared/idempotency/infrastructure/http/idempotency.interceptor.ts
//
// pt-BR (2026-11-10 — conformidade do system design): o INTERCEPTOR que
// torna o retry de escrita SEGURO.
//
// O QUE ELE FECHA
//
// A lacuna que `docs/system-design/dados.md` §6 descrevia — "retry não é
// seguro: um cliente que repete por timeout **não tem como saber** se a
// primeira gravou, e recebe 409 no lugar de 201" — está fechada desde
// 2026-11-10: a mesma chave com o mesmo pedido devolve a MESMA resposta.
//
// COMO FUNCIONA
//
//   cliente ──► POST /api/v1/users
//              Idempotency-Key: 8f1c…
//
//   ┌─ este interceptor ─────────────────────────────────────────────┐
//   │ 1. sem header, ou método ≠ POST, ou rota de /auth → passa      │
//   │    direto (o comportamento de hoje, intacto)                    │
//   │ 2. imprime o PEDIDO (método + rota CONCRETA + escopo + corpo)  │
//   │ 3. reserva a chave                                              │
//   │    livre    → executa                                          │
//   │    replay   → devolve a MESMA resposta, sem executar           │
//   │    conflito → 409 (a chave foi reusada com outro pedido)       │
//   │    em_voo   → 409 (a chave está reservada)                     │
//   │ 4. guarda a resposta (só quando deu 2xx)                       │
//   │    erro → libera a chave (o cliente pode repetir)              │
//   └────────────────────────────────────────────────────────────────┘
//
// ⚠️ A reserva é COMMITADA antes de a operação rodar: é isso que impede
// dois requests com a mesma chave de executarem ao mesmo tempo.
//
// ⚠️ `/auth` fica de fora: o bloco de auth tem semântica de SESSÃO (o
// refresh token é de uso único e é rotacionado), e um replay ali devolveria
// um token já consumido. A decisão está no ADR-0011.

import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { of, type Observable } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import {
  ATOR_ANONIMO,
  HEADER_DE_IDEMPOTENCIA,
  HEADER_DE_REPLAY,
  TAMANHO_MAXIMO_DA_CHAVE,
  TAMANHO_MINIMO_DA_CHAVE,
  type HeadersDaResposta,
  type IdempotencyPort,
} from '../../application/idempotency.port.js';
import { IDEMPOTENCY_PORT } from '../../shared/idempotency.tokens.js';
import { segredoDeServico } from '../../../auth/segredo-de-servico.js';

/**
 * O request que o interceptor lê.
 *
 * ⚠️ É uma forma estrutural, e não o tipo do Fastify: `fastify` não é
 * dependência direta do `@projeto/api` (é do `@nestjs/platform-fastify`), e
 * o resto do repo extrai o que precisa do adapter — o mesmo caminho de
 * `users.controller.ts` (`type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0]`).
 */
export interface RequestComIdempotencia {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  /**
   * O TEMPLATE da rota (`/api/v1/users`) — o Fastify 5 o expõe em
   * `request.routeOptions.url`. É ele que diz **qual** rota é; a URL
   * concreta é o que diz **qual recurso** (e as duas entram na impressão).
   */
  routeOptions?: { url?: string };
  /** O ator — o `JwtAuthGuard` publica o `sub` aqui. */
  user?: { sub?: string; tenantId?: string | null };
}

/** O reply — o mínimo que o interceptor escreve. */
export interface ReplyComIdempotencia {
  statusCode: number;
  status(codigo: number): unknown;
  header(nome: string, valor: string): unknown;
  /** Os headers que o reply tem AGORA (Fastify). */
  getHeaders(): Record<string, string | string[] | number>;
}

/**
 * As rotas de `/auth` ficam de fora da idempotência.
 *
 * ⚠️ O casamento é por SEGMENTO (`/auth/` no fim ou no meio), e não por
 * prefixo de caminho — o prefixo global (`api/v1`) é do `main.ts` e não
 * mora aqui.
 */
const ROTAS_SEM_IDEMPOTENCIA = /\/auth(\/|$)/;

/**
 * A separação de domínio do pepper.
 *
 * ⚠️ O pepper é o `JWT_SECRET` (ver `pepperDoFingerprint`), e a separação de
 * domínio é o que impede que a mesma chave seja usada para duas purposes
 * diferentes: a assinatura de token e a impressão do pedido são chaves
 * distintas, mesmo que venham do mesmo segredo.
 */
const DOMINIO_DO_FINGERPRINT = 'idempotencia:fingerprint:v1';

/** O header da chave: `string`, ou `undefined` quando não veio. */
function headerDe(req: FastifyRequestMinimo, nome: string): string | undefined {
  const bruto = req.headers[nome];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== 'string') return undefined;
  const limpo = valor.trim();
  return limpo === '' ? undefined : limpo;
}

/** O tipo mínimo do request que o `headerDe` usa. */
type FastifyRequestMinimo = Pick<RequestComIdempotencia, 'headers'>;

/**
 * O JSON com as chaves ORDENADAS — a impressão do pedido não pode depender
 * da ordem em que o cliente serializou o corpo.
 */
function jsonEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  const chaves = Object.keys(objeto).sort();
  return `{${chaves
    .map((chave) => `${JSON.stringify(chave)}:${jsonEstavel(objeto[chave])}`)
    .join(',')}}`;
}

/**
 * A rota CONCRETA — com os path params resolvidos.
 *
 * ⚠️ O TEMPLATE (`routeOptions.url`) **não** basta: `POST /tenants/:id/
 * invitations` tem o mesmo template para toda empresa, e a impressão que
 * ignorasse o `:id` faria o replay da resposta da empresa A responder na
 * empresa B. A URL concreta é o que distingue o recurso.
 */
export function rotaConcretaDo(req: RequestComIdempotencia): string {
  const semQuery = req.url.split('?')[0];
  return semQuery ?? req.url;
}

/** A rota TEMPLATE — qual rota é (a da doc e da coluna `route`). */
export function rotaDo(req: RequestComIdempotencia): string {
  return req.routeOptions?.url ?? rotaConcretaDo(req);
}

/**
 * A impressão do pedido: método + rota concreta + escopo + corpo.
 *
 * ⚠️ O ESCOPO entra porque o `tenantId` (o `X-Tenant-Id` que o guard
 * validou) não está na URL: sem ele, a mesma chave no mesmo recurso em
 * empresas diferentes seria a mesma impressão — e o replay devolveria a
 * resposta da empresa A no contexto da empresa B.
 *
 * ⚠️ O HASH é um **HMAC**, e não um SHA-256: o corpo cru carrega a `senha`
 * em texto plano (`POST /users`), e um SHA-256 simples seria um oráculo de
 * senha **barato** para quem lesse a tabela (um dump, um backup) — mais
 * fraco que o `argon2id` de `users.password_hash`. Com o pepper, quem lê a
 * tabela não consegue testar senhas sem o segredo.
 */
export function impressaoDoPedido(req: RequestComIdempotencia, pepper: string): string {
  const material = [
    DOMINIO_DO_FINGERPRINT,
    req.method,
    rotaConcretaDo(req),
    req.user?.tenantId ?? '',
    jsonEstavel(req.body),
  ].join('\n');
  return createHmac('sha256', pepper).update(material).digest('hex');
}

/**
 * Os headers que o **handler** escreveu — e só eles.
 *
 * ⚠️ A comparação é com o estado do reply ANTES do handler: o que já
 * estava lá é de infraestrutura (o helmet, o rate limit), e header de
 * infraestrutura é do REQUEST, não da resposta — o replay tem os seus.
 *
 * O que o handler escreve é o `ETag` (`users.controller.ts`), e é ele que o
 * replay precisa repôr: sem o `ETag`, a resposta do retry não seria a mesma
 * da original, e um cliente que monta o `If-Match` a partir dele levaria
 * 400.
 */
export function headersQueOHandlerEscreveu(
  depois: Record<string, string | string[] | number>,
  antes: Record<string, string | string[] | number>,
): HeadersDaResposta {
  const escritos: HeadersDaResposta = {};
  for (const [nome, valor] of Object.entries(depois)) {
    if (antes[nome] === valor) continue;
    escritos[nome] = Array.isArray(valor) ? valor.join(', ') : String(valor);
  }
  return escritos;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  /** O segredo do HMAC da impressão (ver `pepperDoFingerprint`). */
  private readonly pepper: string;

  constructor(@Inject(IDEMPOTENCY_PORT) private readonly idempotencia: IdempotencyPort) {
    this.pepper = pepperDoFingerprint();
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<RequestComIdempotencia>();
    const reply = context.switchToHttp().getResponse<ReplyComIdempotencia>();

    const chave = headerDe(req, HEADER_DE_IDEMPOTENCIA);
    // Sem chave, o pedido é o que era: o cliente não pediu retry seguro.
    if (chave === undefined) return next.handle();
    if (req.method !== 'POST') return next.handle();
    if (chave.length > TAMANHO_MAXIMO_DA_CHAVE) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_TOO_LONG',
        detail: `A chave de idempotência passa de ${TAMANHO_MAXIMO_DA_CHAVE} caracteres.`,
      });
    }
    // ⚠️ O MÍNIMO é uma defesa de ENTROPIA, e não de hygiene: o ator
    // anônimo é a MESMA constante para todos os clientes, e uma chave
    // adivinhável deixa quem adivinha bloquear a escrita de outra pessoa
    // (409 por até 24 h) — e, com o corpo exato, receber a resposta
    // guardada. MEDIDO: sem o mínimo, quem usasse a chave da vítima antes
    // dela recebia 409 na escrita legítima da vítima.
    if (chave.length < TAMANHO_MINIMO_DA_CHAVE) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_TOO_SHORT',
        detail: `A chave de idempotência tem menos de ${TAMANHO_MINIMO_DA_CHAVE} caracteres.`,
      });
    }

    const rota = rotaDo(req);
    if (ROTAS_SEM_IDEMPOTENCIA.test(rota)) return next.handle();

    const ator = req.user?.sub ?? ATOR_ANONIMO;
    const impressao = impressaoDoPedido(req, this.pepper);

    const reserva = await this.idempotencia.reservar({
      chave,
      ator,
      rota,
      impressao,
    });

    if (reserva.estado === 'replay') {
      // A MESMA resposta da primeira vez: o status, o corpo e os headers que
      // a aplicação escreveu (o `ETag`) — e o header que diz que ela veio
      // da reserva, para o cliente (e para o log) saber.
      reply.status(reserva.status);
      for (const [nome, valor] of Object.entries(reserva.headers)) {
        reply.header(nome, valor);
      }
      reply.header(HEADER_DE_REPLAY, 'true');
      return of(reserva.resposta);
    }

    if (reserva.estado === 'conflito') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        detail: 'A chave de idempotência já foi usada com outro pedido.',
      });
    }

    if (reserva.estado === 'em_voo') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_IN_FLIGHT',
        detail: 'A chave de idempotência está em uso por outra requisição.',
      });
    }

    // Os headers do reply ANTES do handler: o que já está aqui é de
    // infraestrutura (helmet, rate limit) e é do request, não da resposta.
    const headersAntes = { ...reply.getHeaders() };

    return next.handle().pipe(
      mergeMap(async (corpo: unknown) => {
        // ⚠️ SÓ O 2xx É GUARDADO. Um 4xx devolvido sem exceção (a primeira
        // rota que fizer isso) seria replayado como se fosse resultado — e a
        // chave ficaria presa. O `catchError` abaixo é o caminho do erro
        // LANÇADO; este é o do status.
        if (reply.statusCode < 200 || reply.statusCode >= 300) {
          await this.liberar(chave, ator);
          return corpo;
        }
        try {
          await this.idempotencia.guardar({
            chave,
            ator,
            status: reply.statusCode,
            resposta: corpo,
            headers: headersQueOHandlerEscreveu(reply.getHeaders(), headersAntes),
          });
        } catch (erro) {
          // ⚠️ A operação JÁ ACONTECEU (o handler devolveu 2xx). Guardar a
          // resposta é o que permite o replay — e falhar aqui NÃO pode
          // virar 500: o cliente repetiria, e o retry faria a operação
          // DUAS vezes. A chave fica reservada (o retry leva 409), que é
          // melhor do que duplicar.
          this.logger.error(
            `[Idempotencia] a resposta da chave ${prefixoDaChave(chave, this.pepper)} não foi guardada`,
            erro instanceof Error ? erro.stack : String(erro),
          );
        }
        return corpo;
      }),
      catchError(async (erro: unknown) => {
        // A operação NÃO deu 2xx: a chave é liberada, para o cliente poder
        // repetir com a mesma chave.
        await this.liberar(chave, ator);
        throw erro;
      }),
    );
  }

  /** Libera a chave — e registra a falha, sem abafar o erro original. */
  private async liberar(chave: string, ator: string): Promise<void> {
    try {
      await this.idempotencia.liberar({ chave, ator });
    } catch (falha) {
      this.logger.error(
        `[Idempotencia] a chave ${prefixoDaChave(chave, this.pepper)} não foi liberada`,
        falha instanceof Error ? falha.stack : String(falha),
      );
    }
  }
}

/**
 * O prefixo da chave que vai para o log — **nunca** a chave crua.
 *
 * ⚠️ A chave é do cliente e é parte da capacidade de replay (junto com o
 * corpo e o ator). Um log que a traz em claro é um log que entrega a
 * capacidade — e o repo classifica credencial em log como o vetor nº 1.
 *
 * ⚠️ O prefixo é um HMAC com o **pepper** (o mesmo da impressão): com uma
 * chave fixa no código, o prefixo viraria um **oráculo de verificação** —
 * quem lesse o log poderia testar um palpite de chave e saber se acertou.
 */
export function prefixoDaChave(chave: string, pepper: string): string {
  return createHmac('sha256', pepper).update(chave).digest('hex').slice(0, 8);
}

/**
 * O pepper do HMAC da impressão.
 *
 * ⚠️ O segredo é o `JWT_SECRET` — que o repo já exige (sem default, recusando
 * placeholder, `segredoDeServico`), e que **não** está no banco: um dump ou
 * um backup das tabelas não o traz. A separação de domínio está na
 * mensagem do HMAC (`DOMINIO_DO_FINGERPRINT`), e é ela que impede que a
 * mesma chave serve para assinar token e para imprimir pedido.
 *
 * ⚠️ A rotação do `JWT_SECRET` invalida as impressões antigas: um retry de
 * uma chave guardada antes da rotação cai em "conflito" (409) em vez de
 * replay. É o preço de não criar um segundo segredo — e é um evento raro.
 */
export function pepperDoFingerprint(): string {
  const veredito = segredoDeServico(process.env['JWT_SECRET'], 'JWT_SECRET');
  if (!veredito.ok) {
    throw new Error(`Idempotencia: ${veredito.motivo}`);
  }
  return veredito.valor;
}

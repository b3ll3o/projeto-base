// apps/api/src/modules/auth/infrastructure/security/jwt-token.service.spec.ts
//
// Testa o `JwtTokenService` contra um `JwtService` REAL (não mock): o que
// está em jogo aqui é criptografia, e um mock de `verifyAsync` que
// devolve `true` para o que o teste mandar passaria com a verificação
// inteiramente ausente.
//
// O caso que este arquivo existe para prender é o `typ`: um par de
// access/refresh sem `typ` separado é equivalente a emitir um token só,
// e o atacante que rouba o refresh token ganha 7 dias em vez de 15
// minutos. Por isso "typ trocado é rejeitado" aparece nos dois sentidos.
//
// ── POR QUE SÓ A ConfigService É DUBLÊ ────────────────────────────────────
//
// O `ConfigModule.forRoot({ isGlobal: true })` só roda dentro do AppModule —
// subir o AppModule aqui arrastaria Testcontainers para uma spec unitária.
// O `JwtService` é real justamente porque um dublê não assina nada.

import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JwtTokenService } from './jwt-token.service.js';
import type { TokenIssuerPort } from '../../domain/ports/token-issuer.port.js';
import { InvalidTokenException } from '../../domain/exceptions/token.exceptions.js';

const SEGREDO = 'segredo-de-teste-com-tamanho-razoavel-0001';
const OUTRO_SEGREDO = 'segredo-diferente-com-tamanho-razoavel-9';

const ASSUNTO = { sub: 'usr_01HZX9K2M3', email: 'pessoa@exemplo.com' } as const;

type Env = Record<string, string | undefined>;

function configDe(env: Env): ConfigService {
  return { get: (chave: string) => env[chave] } as unknown as ConfigService;
}

/**
 * Monta o serviço com o segredo default, sobrescrevível pelo argumento.
 * Passar `{ JWT_SECRET: undefined }` explicitamente é o que simula a env
 * ausente — `{}` NÃO faz isso, porque o merge abaixo reinsere o default.
 */
function novoServico(env: Env = {}): JwtTokenService {
  return new JwtTokenService(
    new JwtService({ secret: SEGREDO }),
    configDe({ JWT_SECRET: SEGREDO, ...env }),
  );
}

/** Lê o payload de um token SEM verificar assinatura — só para medir TTL. */
function payloadDe(token: string): Record<string, unknown> {
  return new JwtService().decode(token) as Record<string, unknown>;
}

describe('JwtTokenService', () => {
  it('é um TokenIssuerPort (checagem de tipo em tempo de compilação)', () => {
    // A atribuição abaixo É o teste: se a classe deixar de implementar o
    // port, o `tsc --noEmit` falha — e o typecheck roda antes da suíte.
    const port: TokenIssuerPort = novoServico();
    expect(typeof port.emitir).toBe('function');
    expect(typeof port.validarAccessToken).toBe('function');
    expect(typeof port.validarRefreshToken).toBe('function');
  });

  // ─── segredo obrigatório (contrato F) ────────────────────────────────────
  describe('segredo obrigatório', () => {
    it('NÃO boota sem JWT_SECRET em produção', () => {
      // O ponto de 4.3: em produção o serviço RECUSA o boot, não gera
      // token com segredo vazio. `expect(() => ...).toThrow` mede a
      // CONSTRUÇÃO, que é quando o Nest instancia o provider — ou seja, o
      // app morre no boot, e não no primeiro login.
      expect(() => novoServico({ NODE_ENV: 'production', JWT_SECRET: undefined })).toThrow(
        /JWT_SECRET/,
      );
    });

    it('NÃO boota sem JWT_SECRET em nenhum ambiente (não existe default)', () => {
      // Um default de desenvolvimento é a porta de entrada clássica do
      // "segredo JWT padrão" — o mesmo motivo pelo qual o repo já trata
      // `DATABASE_URL` como obrigatória e sem valor utilizável.
      expect(() => novoServico({ JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
      expect(() => novoServico({ NODE_ENV: 'development', JWT_SECRET: undefined })).toThrow(
        /JWT_SECRET/,
      );
    });

    it('recusa segredo em branco ou só com espaços', () => {
      // `JWT_SECRET=` numa linha de .env é string vazia, não `undefined`.
      // Se a checagem fosse só `if (!bruto)` ela pegaria; o teste existe
      // para travar a regressão de alguém trocar por `bruto.length > 0`,
      // que aceitaria " " e assinaria com um segredo de um caractere.
      expect(() => novoServico({ JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
      expect(() => novoServico({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
    });

    it('a mensagem de recusa NÃO embute o segredo', () => {
      // Se o segredo aparecer na mensagem de erro, ele vai para o log de
      // boot — e log de boot rotineiramente acaba em observabilidade com
      // retenção de dias.
      let mensagem = '';
      try {
        novoServico({ JWT_SECRET: '   ' });
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(mensagem).not.toContain(SEGREDO);
      expect(mensagem).not.toMatch(/secredo\s*[:=]/i);
    });
  });

  // ─── emitir ─────────────────────────────────────────────────────────────
  describe('emitir()', () => {
    it('devolve os DOIS tokens, não vazios e distintos', async () => {
      const service = novoServico();

      const par = await service.emitir({ ...ASSUNTO });

      expect(typeof par.accessToken).toBe('string');
      expect(typeof par.refreshToken).toBe('string');
      expect(par.accessToken.length).toBeGreaterThan(0);
      expect(par.refreshToken.length).toBeGreaterThan(0);
      expect(par.accessToken).not.toBe(par.refreshToken);
    });

    it('o access carrega sub, email e typ="access"', async () => {
      const service = novoServico();

      const { accessToken } = await service.emitir({ ...ASSUNTO });

      const payload = payloadDe(accessToken);
      expect(payload['sub']).toBe(ASSUNTO.sub);
      expect(payload['email']).toBe(ASSUNTO.email);
      expect(payload['typ']).toBe('access');
    });

    it('o refresh carrega typ="refresh" e NUNCA "access"', async () => {
      const service = novoServico();

      const { refreshToken } = await service.emitir({ ...ASSUNTO });

      const payload = payloadDe(refreshToken);
      expect(payload['typ']).toBe('refresh');
      expect(payload['sub']).toBe(ASSUNTO.sub);
      expect(payload['email']).toBe(ASSUNTO.email);
    });

    it('aplica 15m no access e 7d no refresh por default', async () => {
      // Contrato F: JWT_ACCESS_TTL=15m, JWT_REFRESH_TTL=7d. Um
      // `expiresIn` esquecido produz token que NÃO expira nunca — e um
      // spec que só olhasse o payload passaria, porque o payload tem `iat`
      // mas não `exp` quando o expiresIn falta.
      const service = novoServico();
      const antes = Math.floor(Date.now() / 1000);

      const par = await service.emitir({ ...ASSUNTO });

      const access = payloadDe(par.accessToken);
      const refresh = payloadDe(par.refreshToken);
      const iat = Number(access['iat']);
      // Tolerância de 2s para o relógio entre o sign e a leitura.
      expect(Math.abs(iat - antes)).toBeLessThanOrEqual(2);

      expect(Number(access['exp']) - iat).toBe(15 * 60);
      // ⚠️ O `exp` do refresh é medido contra o `iat` DO PRÓPRIO refresh, e
      // não contra o do access. `emitir()` assina DOIS tokens, e cada `sign`
      // recebe o `iat` do instante em que roda: na virada de segundo os dois
      // caem em segundos diferentes, e a subtração cruzada dá 7d + 1.
      // MEDIDO 2026-10-19 no CI: `expected 604801 to be 604800` — a falha é do
      // spec, não do TTL, e é a razão de ele ser flaky e não falho.
      const iatRefresh = Number(refresh['iat']);
      expect(Math.abs(iatRefresh - iat)).toBeLessThanOrEqual(2);
      expect(Number(refresh['exp']) - iatRefresh).toBe(7 * 24 * 60 * 60);
    });

    it('respeita JWT_ACCESS_TTL e JWT_REFRESH_TTL do env', async () => {
      const service = novoServico({ JWT_ACCESS_TTL: '30s', JWT_REFRESH_TTL: '2h' });

      const par = await service.emitir({ ...ASSUNTO });

      const iat = Number(payloadDe(par.accessToken)['iat']);
      expect(Number(payloadDe(par.accessToken)['exp']) - iat).toBe(30);
      // Mesmo `iat` próprio do refresh, pelo mesmo motivo do teste anterior.
      const iatRefresh = Number(payloadDe(par.refreshToken)['iat']);
      expect(Number(payloadDe(par.refreshToken)['exp']) - iatRefresh).toBe(2 * 60 * 60);
    });

    it('cai nos defaults quando as env de TTL vêm vazias', async () => {
      // `JWT_ACCESS_TTL=` numa linha de .env é string vazia; um
      // `env.TTL ?? '15m'` NÃO pega isso e o jsonwebtoken explode com
      // erro de timespan no primeiro login. O fallback tem de ser `||`.
      const service = novoServico({ JWT_ACCESS_TTL: '', JWT_REFRESH_TTL: '' });

      const par = await service.emitir({ ...ASSUNTO });

      const iat = Number(payloadDe(par.accessToken)['iat']);
      expect(Number(payloadDe(par.accessToken)['exp']) - iat).toBe(15 * 60);
    });

    it('é DETERMINÍSTICO dentro do mesmo segundo — sem `jti`, o par repete', async () => {
      // Fato medido, não defeito: o payload é {sub, email, typ} e o
      // `iat`/`exp` do jsonwebtoken tem granularidade de segundo, então
      // dois `emitir()` na mesma segunda devolvem byte a byte o mesmo
      // token. Registrado aqui DE PROPÓSITO, para que a fase 5 (rotação
      // de refresh token) não descubra isso em produção: uma rotação
      // dentro do mesmo segundo não muda o refresh token. Se a rotação
      // precisar ser observável, o payload tem de ganhar um `jti`
      // aleatório — mudança de contrato que não cabe nesta fase.
      const service = novoServico();

      const a = await service.emitir({ ...ASSUNTO });
      const b = await service.emitir({ ...ASSUNTO });

      const identicos = a.accessToken === b.accessToken && a.refreshToken === b.refreshToken;
      expect(identicos).toBe(true);
      // …e no segundo seguinte já não são.
      await new Promise((r) => setTimeout(r, 1_100));
      const c = await service.emitir({ ...ASSUNTO });
      expect(c.accessToken).not.toBe(a.accessToken);
    });
  });

  // ─── validarAccessToken ──────────────────────────────────────────────────
  describe('validarAccessToken()', () => {
    it('devolve o TokenSubject de um access válido', async () => {
      const service = novoServico();
      const { accessToken } = await service.emitir({ ...ASSUNTO });

      await expect(service.validarAccessToken(accessToken)).resolves.toEqual({
        sub: ASSUNTO.sub,
        email: ASSUNTO.email,
        typ: 'access',
      });
    });

    it('REJEITA um refresh token — a proteção central desta suíte', async () => {
      // O refresh vive 7 dias. Se `validarAccessToken` aceitasse um
      // refresh, quem lesse o storage da pessoa teria acesso à API por uma
      // semana sem nunca passar pelo login.
      const service = novoServico();
      const { refreshToken } = await service.emitir({ ...ASSUNTO });

      await expect(service.validarAccessToken(refreshToken)).rejects.toThrow(InvalidTokenException);
    });

    it('REJEITA token sem `typ` (assinado direto, fora do emitir())', async () => {
      // Um token emitido por outro sistema — ou por uma rota esquecida
      // que assinou só {sub, email} — não tem `typ`. Aceitar abriria um
      // caminho sem classificação.
      const service = novoServico();
      const token = new JwtService().sign(
        { sub: ASSUNTO.sub, email: ASSUNTO.email },
        { secret: SEGREDO },
      );

      await expect(service.validarAccessToken(token)).rejects.toThrow(InvalidTokenException);
    });

    it('REJEITA token assinado com outro segredo', async () => {
      const service = novoServico();
      const token = new JwtService().sign(
        { sub: ASSUNTO.sub, email: ASSUNTO.email, typ: 'access' },
        { secret: OUTRO_SEGREDO },
      );

      await expect(service.validarAccessToken(token)).rejects.toThrow(InvalidTokenException);
    });

    it('REJEITA token expirado', async () => {
      const service = novoServico({ JWT_ACCESS_TTL: '-10s' });
      const { accessToken } = await service.emitir({ ...ASSUNTO });

      await expect(service.validarAccessToken(accessToken)).rejects.toThrow(InvalidTokenException);
    });

    it.each([
      ['sub numérico', { sub: 42, email: ASSUNTO.email, typ: 'access' }],
      ['email ausente', { sub: ASSUNTO.sub, typ: 'access' }],
      ['email numérico', { sub: ASSUNTO.sub, email: 99, typ: 'access' }],
    ])('REJEITA payload com campo fora do tipo: %s', async (_caso, payload) => {
      // Ramo que `emitir()` nunca produz — ele sempre escreve string. É o
      // portão para quem assina com o MESMO segredo por outro caminho (uma
      // rota antiga, um script de backfill, um serviço irmão) e escreve
      // `sub` como número: a assinatura passa, `typ` passa, e o `TokenSubject`
      // sairia com o tipo errado para o consumidor. Um teste que só passasse
      // por `emitir()` nunca alcançaria estas linhas.
      const service = novoServico();
      const token = new JwtService().sign(payload, { secret: SEGREDO });

      await expect(service.validarAccessToken(token)).rejects.toThrow(InvalidTokenException);
    });

    it.each([
      ['string vazia', ''],
      ['lixo', 'nao-e-um-jwt'],
      ['só os dois pontos', '..'],
      ['assinatura cortada', 'eyJzdWIiOiJ4In0.cortado'],
    ])('REJEITA entrada malformada: %s', async (_caso, token) => {
      const service = novoServico();

      await expect(service.validarAccessToken(token)).rejects.toThrow(InvalidTokenException);
    });
  });

  // ─── validarRefreshToken ─────────────────────────────────────────────────
  describe('validarRefreshToken()', () => {
    it('devolve o TokenSubject de um refresh válido', async () => {
      const service = novoServico();
      const { refreshToken } = await service.emitir({ ...ASSUNTO });

      await expect(service.validarRefreshToken(refreshToken)).resolves.toEqual({
        sub: ASSUNTO.sub,
        email: ASSUNTO.email,
        typ: 'refresh',
      });
    });

    it('REJEITA um access token — o caminho inverso também fecha', async () => {
      const service = novoServico();
      const { accessToken } = await service.emitir({ ...ASSUNTO });

      await expect(service.validarRefreshToken(accessToken)).rejects.toThrow(InvalidTokenException);
    });

    it('REJEITA refresh assinado com outro segredo', async () => {
      const service = novoServico();
      const token = new JwtService().sign(
        { sub: ASSUNTO.sub, email: ASSUNTO.email, typ: 'refresh' },
        { secret: OUTRO_SEGREDO },
      );

      await expect(service.validarRefreshToken(token)).rejects.toThrow(InvalidTokenException);
    });

    it('REJEITA refresh expirado', async () => {
      const service = novoServico({ JWT_REFRESH_TTL: '-10s' });
      const { refreshToken } = await service.emitir({ ...ASSUNTO });

      await expect(service.validarRefreshToken(refreshToken)).rejects.toThrow(
        InvalidTokenException,
      );
    });
  });

  // ─── wiring de DI ────────────────────────────────────────────────────────
  describe('resolução pelo container NestJS', () => {
    it('resolve sem depender de design:paramtypes (que o tsx NÃO emite)', async () => {
      // MEDIDO neste repo: em dev o tsx/esbuild não emite metadata de
      // decorator, então um provider NestJS sem `@Inject(TOKEN)` explícito
      // recebe `undefined` em vez da dependência — e o defeito só
      // aparece quando o código USA a dependência, nunca no build.
      // Compilar pelo container é a única forma de o gate pegar isso.
      const moduleRef = await Test.createTestingModule({
        providers: [
          JwtTokenService,
          { provide: JwtService, useValue: new JwtService({ secret: SEGREDO }) },
          { provide: ConfigService, useValue: configDe({ JWT_SECRET: SEGREDO }) },
        ],
      }).compile();

      const service = moduleRef.get(JwtTokenService);
      const par = await service.emitir({ ...ASSUNTO });

      await expect(service.validarAccessToken(par.accessToken)).resolves.toMatchObject({
        typ: 'access',
      });
      await moduleRef.close();
    });

    it('falha o compile() quando ConfigService não está disponível', async () => {
      // O contrapositivo do teste acima: sem o provider, o container tem
      // de recusar. Um teste que passasse nos dois sentidos não estaria
      // medindo o wiring.
      await expect(
        Test.createTestingModule({
          providers: [
            JwtTokenService,
            { provide: JwtService, useValue: new JwtService({ secret: SEGREDO }) },
          ],
        }).compile(),
      ).rejects.toThrow();
    });
  });
});

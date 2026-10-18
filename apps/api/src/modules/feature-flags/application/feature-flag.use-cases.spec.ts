// apps/api/src/modules/feature-flags/application/feature-flag.use-cases.spec.ts
//
// pt-BR (feature-flags, 2026-10-18): os 2 use cases do BC.
//
// POR QUE UM SPEC DE USE CASE E NÃO SÓ DE GUARD
// O guard (F4) lê a porta direto e não passa pelo use case, porque o ator de
// `convidar` é o dono de uma empresa e `listar`/`definir` exigem admin do
// sistema (D13). Ou seja: **o caminho do admin é o único que passa aqui**, e
// é exatamente ele que nenhum outro spec cobre.
//
// O QUE ESTE SPEC TRAVA
//   1) D2 — quem alterna: `tenantId === null && isAdmin`. Os 3 casos NEGATIVOS
//      (usuário comum, admin de EMPRESA, admin sem empresa) são o portão real
//      desta feature, porque `admin.manage-feature-flags` já é concedida a
//      todo dono de empresa no signup (R6/C4) — a permissão não segura nada
//      aqui, a use case segura.
//   2) D4 — a união catálogo x linhas. Chave sem linha aparece como ATIVADA;
//      chave com linha `false` aparece como DESATIVADA. É o que a tela consome.
//   3) O fake **registra** o que gravou. Um fake que só devolve o input faz o
//      teste passar mesmo com a use case chamando a porta errada.

import { describe, expect, it } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { FeatureFlagUseCases } from './feature-flag.use-cases.js';
import type {
  FeatureFlagRepositoryPort,
  FeatureFlagEstado,
} from '../domain/ports/feature-flag-repository.port.js';
import { type AtorAutenticado } from '../../../shared/auth/eh-administrador-de-sistema.js';

/**
 * Fake in-memory da porta. Guarda as linhas num Map e **also** em `gravadas`,
 * para o spec poder afirmar tanto o efeito observável (a listagem seguinte)
 * quanto o pedido feito à porta (a chave e o valor gravados).
 */
class PortaEmMemoria implements FeatureFlagRepositoryPort {
  readonly linhas = new Map<string, boolean>();
  readonly gravadas: FeatureFlagEstado[] = [];

  async listar(): Promise<FeatureFlagEstado[]> {
    return [...this.linhas].map(([chave, ativada]) => ({ chave, ativada }));
  }

  async definir(chave: string, ativada: boolean): Promise<void> {
    this.gravadas.push({ chave, ativada });
    this.linhas.set(chave, ativada);
  }
}

const ADMIN_SISTEMA: AtorAutenticado = {
  userId: 'u-admin',
  tenantId: null,
  isAdmin: true,
};

/** Admin de EMPRESA: `isAdmin` verdadeiro, mas com bucket. Não passa em D2. */
const ADMIN_DA_EMPRESA: AtorAutenticado = {
  userId: 'u-dono',
  tenantId: 'empresa-acme',
  isAdmin: true,
};

/** Sem `isAdmin` — falta a metade da regra. */
const SEM_ISADMIN: AtorAutenticado = {
  userId: 'u-comum',
  tenantId: null,
  isAdmin: false,
};

function comPorta(): { porta: PortaEmMemoria; useCases: FeatureFlagUseCases } {
  const porta = new PortaEmMemoria();
  return { porta, useCases: new FeatureFlagUseCases(porta) };
}

/**
 * Descrição esperada — constante LITERAL, não `FEATURE_FLAGS[0].descricao`.
 *
 * `expect.any(String)` aceitaria `''`, que é o modo como "não achei a
 * descrição" costuma aparecer sem quebrar o tipo. Comparar contra o catálogo
 * seria o outro extremo: se as duas fossem trocadas juntas, o teste confirma a
 * troca. A string literal só quebra quando alguém **reescreve a microcopy** —
 * e aí o vermelho é o aviso de que uma frase que o admin lê mudou.
 */
const DESCRICAO_INVITES = 'Convite de usuário para uma empresa (POST /tenants/:id/invitations).';

describe('FeatureFlagUseCases', () => {
  describe('D2 — quem alterna', () => {
    it('recusa o usuário comum', async () => {
      const { porta, useCases } = comPorta();

      await expect(useCases.listar(SEM_ISADMIN)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(useCases.definir(SEM_ISADMIN, 'tenancy.invites', false)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      // A porta não pode ter sido tocada: a recusa é ANTES do banco, senão
      // "recusou depois de gravar" deixa a tela dando erro com o dado mudado.
      expect(porta.gravadas).toEqual([]);
    });

    it('recusa o admin de EMPRESA (tem isAdmin, mas tem bucket)', async () => {
      const { porta, useCases } = comPorta();

      await expect(useCases.listar(ADMIN_DA_EMPRESA)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        useCases.definir(ADMIN_DA_EMPRESA, 'tenancy.invites', false),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(porta.gravadas).toEqual([]);
    });

    it('deixa passar o admin do sistema', async () => {
      const { useCases } = comPorta();

      await expect(useCases.listar(ADMIN_SISTEMA)).resolves.toEqual([
        { chave: 'tenancy.invites', descricao: DESCRICAO_INVITES, ativada: true },
      ]);
    });
  });

  describe('listar — a união catálogo x linhas (D4)', () => {
    it('devolve TODA chave do catálogo; sem linha = ATIVADA', async () => {
      const { useCases } = comPorta();

      const lista = await useCases.listar(ADMIN_SISTEMA);

      // O esperado é uma constante literal, não `listAllFeatureFlags().length`:
      // comparar contra o próprio catálogo só prova que o catálogo se copia
      // sozinho. Aqui a lista tem que ter exatamente a chave que existe hoje.
      expect(lista).toHaveLength(1);
      expect(lista[0]).toEqual({
        chave: 'tenancy.invites',
        descricao: DESCRICAO_INVITES,
        ativada: true,
      });
    });

    it('a linha desligada sobrepõe o default do catálogo', async () => {
      const { porta, useCases } = comPorta();
      await porta.definir('tenancy.invites', false);

      await expect(useCases.listar(ADMIN_SISTEMA)).resolves.toEqual([
        { chave: 'tenancy.invites', descricao: DESCRICAO_INVITES, ativada: false },
      ]);
    });

    it('linha com chave FORA do catálogo não vira flag na tela', async () => {
      const { porta, useCases } = comPorta();
      // Um `INSERT` cru da F1 grava isso; a lista é catálogo x linhas, então a
      // linha órfã não pode aparecer. Sem este teste, `listar` que devolvesse as
      // linhas direto passaria todos os outros.
      await porta.definir('tenancy.linha_orfa', false);

      const lista = await useCases.listar(ADMIN_SISTEMA);

      expect(lista.map((f) => f.chave)).toEqual(['tenancy.invites']);
    });
  });

  describe('definir', () => {
    it('grava e a listagem seguinte devolve o valor novo', async () => {
      const { porta, useCases } = comPorta();

      await useCases.definir(ADMIN_SISTEMA, 'tenancy.invites', false);

      expect(porta.gravadas).toEqual([{ chave: 'tenancy.invites', ativada: false }]);
      const lista = await useCases.listar(ADMIN_SISTEMA);
      expect(lista[0]?.ativada).toBe(false);
    });

    it('devolve o DTO montado do input + descrição do catálogo (sem reler o banco)', async () => {
      const { porta, useCases } = comPorta();

      const dto = await useCases.definir(ADMIN_SISTEMA, 'tenancy.invites', false);

      expect(dto).toEqual({
        chave: 'tenancy.invites',
        descricao: DESCRICAO_INVITES,
        ativada: false,
      });
      // `definir` grava e monta a resposta: uma releitura seria um `listar`
      // inteiro a mais por clique, e o valor de retorno é o MESMO que a
      // listagem seguinte mostraria — é isso que o `porta.gravadas` acima fixa.
      expect(porta.gravadas).toHaveLength(1);
    });

    it('religar devolve `ativada: true` e a listagem CONCORDA com o PUT', async () => {
      const { porta, useCases } = comPorta();
      // Começa desligada, para o caminho RELIGAR existir: sem esta preparação
      // TODAS as chamadas de `definir` deste spec passavam `false`, e o caminho
      // inverso ficava sem medição nenhuma.
      //
      // MEDIDO 2026-10-18 (revisão adversarial da F2): mutar `definir` para
      // devolver `ativada: false` fixo deixava **10/10 verdes** — e num probe
      // contra o módulo real o PUT respondia `false` depois de gravar `true`,
      // enquanto a listagem seguinte dizia `true`. A resposta do PUT e a
      // listagem discordavam, e o invariante que o próprio código nomeia
      // ("é exatamente o que a listagem seguinte mostraria") era só prosa.
      await porta.definir('tenancy.invites', false);

      const dto = await useCases.definir(ADMIN_SISTEMA, 'tenancy.invites', true);

      expect(dto.ativada).toBe(true);
      expect(porta.gravadas).toEqual([
        { chave: 'tenancy.invites', ativada: false },
        { chave: 'tenancy.invites', ativada: true },
      ]);

      const lista = await useCases.listar(ADMIN_SISTEMA);
      expect(lista[0]?.ativada).toBe(dto.ativada);
    });

    it('a AUTORIZAÇÃO vem antes da validação da chave (403 vence 400)', async () => {
      const { porta, useCases } = comPorta();

      // MEDIDO 2026-10-18: mover `exigeAdministradorDoSistema` para DEPOIS da
      // validação deixava 10/10 verdes — a ordem não tinha dente. Invertida, um
      // ator não autorizado descobre quais chaves existem (400 em vez de 403),
      // que é um oráculo de validação exposto antes da autorização.
      await expect(useCases.definir(SEM_ISADMIN, 'tenancy.invit', false)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        useCases.definir(ADMIN_DA_EMPRESA, 'tenancy.invit', false),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // E `listar`, que não valida chave nenhuma, não tem o que inverter.
      await expect(useCases.listar(SEM_ISADMIN)).rejects.toBeInstanceOf(ForbiddenException);

      expect(porta.gravadas).toEqual([]);
    });

    it('chave fora do catálogo recusa e não grava', async () => {
      const { porta, useCases } = comPorta();

      // Prefixo plausível e a chave de PERMISSÃO — a confusão entre os dois
      // catálogos é o erro que a tela de admin mais facilite.
      await expect(useCases.definir(ADMIN_SISTEMA, 'tenancy.invit', false)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        useCases.definir(ADMIN_SISTEMA, 'admin.manage-feature-flags', false),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(porta.gravadas).toEqual([]);
    });

    it('a validação vem ANTES da gravação (a ordem não é cosmética)', async () => {
      const { porta, useCases } = comPorta();

      await expect(useCases.definir(ADMIN_SISTEMA, 'tenancy.invit', false)).rejects.toThrow();

      // Se a use case gravasse e só depois validasse, a tela mostraria erro e
      // o estado estaria mudado. `gravadas` vazio é a prova.
      expect(porta.gravadas).toEqual([]);
    });
  });
});

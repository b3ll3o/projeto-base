// apps/api/src/modules/feature-flags/application/feature-flag.use-cases.ts
//
// pt-BR (feature-flags, 2026-10-18): os 2 use cases do BC.
//
// A tela de admin chama estes dois; o guard de `convidar` NÃO (D13) — ele lê a
// porta direto, porque o ator de `convidar` é o dono de uma empresa e o portão
// D2 barraria todo mundo. Ver `feature-flag.guard.ts`.

import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { FeatureFlagDto } from '@projeto/shared-types';
import {
  FEATURE_FLAG_REPOSITORY_PORT,
  type FeatureFlagRepositoryPort,
} from '../domain/ports/feature-flag-repository.port.js';
import {
  descricaoDe,
  isFeatureFlagKey,
  listAllFeatureFlags,
} from '../../../shared/auth/feature-flag-catalog.js';
import {
  ehAdministradorDeSistema,
  type AtorAutenticado,
} from '../../../shared/auth/eh-administrador-de-sistema.js';

@Injectable()
export class FeatureFlagUseCases {
  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY_PORT)
    private readonly repositorio: FeatureFlagRepositoryPort,
  ) {}

  /**
   * O estado de TODA chave do catálogo, para a tela renderizar a lista.
   *
   * D4 mora aqui e não na porta: o repositório devolve só as LINHAS, e a
   * junção com o catálogo acontece nesta camada. Chave sem linha é ATIVADA —
   * o default é o estado que o sistema já tem, então uma chave nova no
   * catálogo não apaga funcionalidade nenhuma.
   */
  async listar(ator: AtorAutenticado): Promise<FeatureFlagDto[]> {
    this.exigeAdministradorDoSistema(ator);

    const linhas = await this.repositorio.listar();
    const gravadas = new Map(linhas.map((linha) => [linha.chave, linha.ativada]));

    return listAllFeatureFlags().map((definicao) => ({
      chave: definicao.chave,
      descricao: definicao.descricao,
      ativada: gravadas.get(definicao.chave) ?? true,
    }));
  }

  /**
   * Liga ou desliga UMA chave e devolve o estado gravado.
   *
   * Não relê o banco depois de gravar: o DTO devolvido é montado do input +
   * catálogo, e é exatamente o que a listagem seguinte mostraria. Uma releitura
   * seria um `listar` inteiro a mais por clique do admin.
   */
  async definir(ator: AtorAutenticado, chave: string, ativada: boolean): Promise<FeatureFlagDto> {
    this.exigeAdministradorDoSistema(ator);

    // Validação ANTES da gravação, e a ordem é load-bearing: gravar e só
    // depois recusar deixaria a tela dando erro com o estado já mudado.
    if (!isFeatureFlagKey(chave)) {
      throw new BadRequestException({
        code: 'FEATURE_FLAG_CHAVE_INVALIDA',
        detail: 'a chave precisa constar no catálogo de flags',
        chave,
      });
    }

    await this.repositorio.definir(chave, ativada);

    return { chave, descricao: descricaoDe(chave), ativada };
  }

  /**
   * D2 — o portão real desta feature.
   *
   * ⚠️ `admin.manage-feature-flags` NÃO segura nada aqui: o signup de empresa
   * concede `listAllPermissions()` ao dono de cada empresa nova
   * (`prisma-tenant-onboarding.repository.ts:209`), então todo dono tem essa
   * chave no banco desde a Fase 0. O `@RequirePermission` da rota é defense in
   * depth e rastreabilidade; quem barra de fato é esta linha.
   *
   * `ForbiddenException` do Nest e não uma exceção de domínio nova: o
   * `GlobalExceptionFilter` resolve `HttpException` ANTES de
   * `mapExceptionToHttp` (`global-exception.filter.ts:77`), então a recusa sai
   * 403 RFC 7807 sem uma linha nova no mapper — e os guards do repositório
   * (`permissions.guard.ts:110`) já lançam a mesma.
   */
  private exigeAdministradorDoSistema(ator: AtorAutenticado): void {
    if (!ehAdministradorDeSistema(ator)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        detail: 'só o administrador do sistema alterna funcionalidades do sistema',
      });
    }
  }
}

// apps/api/src/shared/infrastructure/prisma/papel-de-runtime.ts
//
// pt-BR (Fase 9 — RLS, 2026-10-17): o papel Postgres que a APLICAÇÃO usa em
// tempo de execução, e o parâmetro de sessão que carrega o escopo da empresa.
//
// Por que existe um papel e não é a mesma conta das migrations: superuser tem
// BYPASS de RLS por construção (MEDIDO nesta campanha, antes desta fase), então
// uma policy escrita e lida por superuser não protege nada — é código que
// aparenta proteger. O dono do schema continua conectando para migrar e semear; a
// aplicação conecta por aqui, e é sobre esta sessão que as policies valem.
//
// ⚠️ `SENHA_DE_RUNTIME_DEV` está numa migration e não pode ser lida de env
// (migration não recebe parâmetro). As duas cópias — esta e o SQL — são
// guardadas por `papel-de-runtime.spec.ts`, que compara a migration com estas
// constantes. Se alguém trocar num lado só, o spec fica vermelho.

/** Nome do papel de runtime. Tem de bater com o `CREATE ROLE` da migration. */
export const PAPEL_DE_RUNTIME = 'app_runtime';

/**
 * Senha do papel de runtime. **É DE DESENVOLVIMENTO** — o container de teste e
 * o `docker-compose.dev.yml` nascem do zero, então nenhuma é segredo. Em
 * produção a senha é trocada por fora e esta constante não vale; o que continua
 * valendo é que o papel NÃO pode ser superuser.
 */
export const SENHA_DE_RUNTIME_DEV = 'app_runtime_dev';

/**
 * Escopo que significa "bucket de sistema": o admin global, que enxerga todas
 * as empresas. É o valor com que o bucket `tenantId === null` da aplicação
 * entra no banco, e é o que faz o seed alcançar tudo.
 */
export const ESCOPO_DE_SISTEMA = '*';

/**
 * Parâmetro de sessão (GUC) que carrega o escopo. `'*'` = sistema, um UUID =
 * aquela empresa, **ausente ou vazio = fail-closed** (não vê nada).
 */
export const PARAMETRO_DE_ESCOPO = 'app.tenant_id';

/** Troca o usuário da URI pelo papel de runtime, preservando host/porta/banco. */
export function uriComoPapelDeRuntime(uriDoDono: string): string {
  const url = new URL(uriDoDono);
  url.username = PAPEL_DE_RUNTIME;
  url.password = SENHA_DE_RUNTIME_DEV;
  return url.toString();
}

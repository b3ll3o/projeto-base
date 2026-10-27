// apps/api/src/shared/auth/decisao-do-admin-local.ts
//
// pt-BR (PR #115, achado 2 da revisão): extraída de `prisma/seed.ts`, onde a
// decisão vivia inline e sem spec — `apps/api/prisma/` não tem um único
// `*.spec.ts` e o projeto `unit` do Vitest só enxerga `src/`, então um spec ao
// lado do seed seria verde por nunca rodar.
//
// O que esta função decide: se o seed pode criar `admin@admin.com`, a conta de
// senha pública (`Admin@123`, no repositório) com TODAS as permissions e
// `isAdmin: true`, conectando como DONA — o papel que ignora RLS.
//
// ⚠️ TRÊS estados porque são três comportamentos, não dois. Um booleano
// `podeCriar` diria `false` para `recusar` e para `ignorar`, e a diferença é o
// exit code do seed inteiro: `ignorar` deixa o passo 5 seguir, `recusar` mata o
// processo. Colapsar os dois é o seed fechando "OK" sem admin nenhum em dev.

/** O que o seed faz com o admin local. */
export type DecisaoAdminLocal = 'criar' | 'recusar' | 'ignorar';

/**
 * Hostnames que contam como destino local.
 *
 * `postgres` NÃO é um host de loopback: é o nome do serviço do Compose, que é
 * o hostname que a `DIRECT_DATABASE_URL` tem de dentro do container. A
 * comparação é de STRING — o guard não resolve DNS, e é por isso que um
 * Postgres remoto de dev que se chame `postgres` passa, e que o
 * `projeto-base-postgres` (que resolve para o MESMO Postgres) é recusado.
 *
 * ⚠️ EXPORTADA porque a spec precisa PRENDER a lista. Sem isso, um hostname
 * acrescentado por engano — `db-producao`, um typo — entra como destino "local"
 * e o admin de senha pública nasce num banco que não é de dev, e NENHUM teste
 * cai: MEDIDO 2026-10-20, a mutação de acrescentar um host remoto à lista
 * deixava a spec INTEIRA verde (20 de 20). A lista é a decisão de segurança
 * deste arquivo — ela decide se o bypass total do seed acontece — e uma
 * decisão de segurança não pode depender de alguém lembrar de testar.
 */
export const HOSTS_DESTINO_LOCAL: readonly string[] = ['localhost', '127.0.0.1', 'postgres'];

/**
 * Modo default-deny: só `development` cria. Ausente, vazio, `staging`, `prod` ou
 * `Development` (o match é exato) saem por `ignorar` — o seed segue sem tocar em
 * usuário. Mesmo padrão do `JWT_SECRET` no ADR-0002.
 */
export function decisaoDoAdminLocal(nodeEnv: string | undefined, url: string): DecisaoAdminLocal {
  if (nodeEnv !== 'development') return 'ignorar';

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Não parseou, logo não deu para verificar que é local: recusa. O seed real
    // não chega aqui — a primeira query (passo 1, `seed.ts:89`) morre antes com
    // `PrismaClientInitializationError`, MEDIDO. A recusa é o comportamento da
    // função pura, não uma mudança no seed.
    return 'recusar';
  }

  return HOSTS_DESTINO_LOCAL.includes(host) ? 'criar' : 'recusar';
}

/**
 * O que o seed faz com o PRIMEIRO usuário cadastrado (o passo 5).
 *
 * #121: este passo promove o primeiro user a admin GLOBAL, e ele não tinha
 * guard nenhum. `POST /users` é `@Public()` — ou seja, a primeira conta da
 * fila pode ser de qualquer pessoa que se cadastrou, e o seed a promovia a
 * administradora global do sistema.
 *
 * A decisão é a DO PASSO 4, e pela mesma razão: o admin local e a promoção do
 * primeiro usuário são o mesmo risco (uma conta sem dono, com poder total),
 * e as duas respostas são as mesmas — em dev local, promotes; fora de dev,
 * não promove e aponta o caminho auditado.
 *
 * ⚠️ `recusar` (dev apontando para um banco que não é local) NÃO aparece
 * aqui: o passo 4 já aborta o processo nesse caso, e o passo 5 nunca é
 * alcançado. A função é escrita sobre a decisão de TRÊS estados para não
 * ter um segundo vocabulário — mas o `throw` do passo 4 é a garantia.
 */
export type DecisaoPrimeiroUser = 'promover' | 'nao-promover';

/**
 * Decide se o passo 5 do seed promove o primeiro usuário a admin global.
 *
 * O `promover` só acontece em `development` apontando para um destino local
 * — a MESMA condição do admin local, e pela MESMA razão.
 */
export function decisaoDoPrimeiroUser(
  nodeEnv: string | undefined,
  url: string,
): DecisaoPrimeiroUser {
  return decisaoDoAdminLocal(nodeEnv, url) === 'criar' ? 'promover' : 'nao-promover';
}

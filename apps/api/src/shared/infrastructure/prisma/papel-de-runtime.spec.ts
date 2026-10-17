// apps/api/src/shared/infrastructure/prisma/papel-de-runtime.spec.ts
//
// pt-BR (Fase 9 — RLS, 2026-10-17): o guard de DRIFT entre a migration e as
// constantes TypeScript.
//
// POR QUE ESTE ARQUIVO EXISTE
// `SENHA_DE_RUNTIME_DEV` e `PAPEL_DE_RUNTIME` existem em DOIS lugares — o
// TypeScript e o `CREATE ROLE` da migration — porque migration não recebe
// parâmetro de env. Nenhum dos dois lados sozinho denuncia o outro: trocar a
// senha num lado só não dá erro de compilação, não dá erro de migration, e só
// aparece como `Authentication failed` na suíte de integração, longe da linha
// que causou. Este arquivo compara os dois.
//
// ⚠️ É um teste de ARQUIVO, não de comportamento: ele lê o SQL do disco. Isso é
// proposital — a alternativa (conectar e ver se loga) só diria "a senha está
// errada", nunca "a constante e a migration não são o mesmo nome".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PAPEL_DE_RUNTIME,
  SENHA_DE_RUNTIME_DEV,
  ESCOPO_DE_SISTEMA,
  PARAMETRO_DE_ESCOPO,
  uriComoPapelDeRuntime,
} from './papel-de-runtime.js';

const MIGRATION = new URL(
  '../../../../prisma/migrations/20261020000000_rls_isolation_empresa/migration.sql',
  import.meta.url,
);
const sql = readFileSync(fileURLToPath(MIGRATION), 'utf8');

describe('papel de runtime — a migration e o TypeScript sao o mesmo papel', () => {
  it('o nome do papel na migration e o mesmo da constante', () => {
    expect(sql).toContain(`CREATE ROLE ${PAPEL_DE_RUNTIME}`);
  });

  it('a senha da migration e a mesma da constante', () => {
    expect(sql).toContain(`PASSWORD '${SENHA_DE_RUNTIME_DEV}'`);
  });

  it('o papel nao e superuser e nao tem BYPASSRLS — a propriedade que a fase existe para garantir', () => {
    // Estas duas linhas nao sao "recomendacao": sem elas, a policy e lida por um
    // papel que ve tudo e o arquivo inteiro mede nada. E por isso que o primeiro
    // `it()` de `prisma-rls.integration.spec.ts` confere `rolsuper`/`rolbypassrls`
    // ao vivo. Aqui o mesmo estado e conferido na FONTE, onde a mudanca acontece.
    expect(sql).toMatch(/CREATE ROLE app_runtime[\s\S]*?NOSUPERUSER/);
    expect(sql).toMatch(/CREATE ROLE app_runtime[\s\S]*?NOBYPASSRLS/);
  });

  it('o parametro de escopo do TypeScript e o que a migration le', () => {
    expect(sql).toContain(`current_setting('${PARAMETRO_DE_ESCOPO}', true)`);
  });

  it('o sentinela de sistema do TypeScript e o sentinela do SQL', () => {
    // `'*'` e o bucket que enxerga tudo. Se um lado virar `'todos'`, a
    // seguranca silenciosamente deixa de reconhecer o admin global — e o
    // sintoma e "o seed funciona mas o admin nao ve nenhuma empresa".
    expect(sql).toContain(`escopo_atual() = '${ESCOPO_DE_SISTEMA}'`);
  });

  it('a funcao de escopo e fail-closed: sem parametro, recusa', () => {
    // A mutacao que provaria isto (apagar o `IS NOT NULL`) foi negada pelo
    // classificador de seguranca. O efeito observavel esta em
    // `prisma-rls.integration.spec.ts`; aqui fica a garantia de que a clausula
    // continua no arquivo.
    expect(sql).toMatch(/escopo_atual\(\) IS NOT NULL/);
  });

  it('a funcao devolve booleano, nunca NULL', () => {
    // MEDIDO 2026-10-17: com alvo NULL e `aceita_global = false`, o `OR` produz
    // NULL e a funcao devolvia NULL. Dentro de `USING` isso nao muda nada, mas a
    // funcao promete boolean — e um NULL lido como verdadeiro por quem a reusar
    // e o que o fail-closed veio evitar.
    expect(sql).toMatch(/AND COALESCE\(/);
  });
});

describe('uriComoPapelDeRuntime', () => {
  it('troca o usuario, a senha e preserva host, porta e banco', () => {
    const uri = uriComoPapelDeRuntime('postgresql://dono:segredo-do-dono@localhost:55432/app');

    expect(uri).toBe(
      `postgresql://${PAPEL_DE_RUNTIME}:${SENHA_DE_RUNTIME_DEV}@localhost:55432/app`,
    );
  });

  it('funciona com uma URI que ja traz query string de driver', () => {
    const uri = uriComoPapelDeRuntime('postgresql://dono:x@db:5432/app?schema=public');

    expect(uri).toContain(`//${PAPEL_DE_RUNTIME}:${SENHA_DE_RUNTIME_DEV}@db:5432/app`);
    expect(uri).toContain('schema=public');
  });
});

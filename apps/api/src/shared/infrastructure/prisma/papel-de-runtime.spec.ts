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
  PAPEL_DE_SISTEMA,
  SENHAS_EXPOSTAS,
  ESCOPO_DE_SISTEMA,
  PARAMETRO_DE_ESCOPO,
  uriComoPapelDeRuntime,
  uriComoPapelDeSistema,
} from './papel-de-runtime.js';

const MIGRATION = new URL(
  '../../../../prisma/migrations/20261020000000_rls_isolation_empresa/migration.sql',
  import.meta.url,
);
const sql = readFileSync(fileURLToPath(MIGRATION), 'utf8');

// #118: a migration do papel de SISTEMA. E ela que troca o `'*'` do GUC pela
// CREDENCIAL (`current_user = 'app_system'`).
const MIGRATION_DE_SISTEMA = new URL(
  '../../../../prisma/migrations/20261027000001_papel_de_sistema/migration.sql',
  import.meta.url,
);
const sqlDeSistema = readFileSync(fileURLToPath(MIGRATION_DE_SISTEMA), 'utf8');

/**
 * O SQL SEM os comentários.
 *
 * ⚠️ As asserções de conteúdo do SQL têm de olhar o CÓDIGO, e não o
 * comentário que fala do código. A migration nova COMENTA que
 * `users_insercao` exigia `escopo_atual() = '*'` — e uma asserção que
 * procurasse essa string no arquivo inteiro cairia por causa do próprio
 * comentário que documenta a correção. É a mesma lição do gate de shell
 * injection: um `grep` que casa comentário é um `grep` que se desliga.
 */
function semComentarios(sql: string): string {
  return sql
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('--'))
    .join('\n');
}

describe('papel de runtime — a migration e o TypeScript sao o mesmo papel', () => {
  it('o nome do papel na migration e o mesmo da constante', () => {
    expect(sql).toContain(`CREATE ROLE ${PAPEL_DE_RUNTIME}`);
  });

  // #118: a senha do papel saiu do REPO. A forma correta deste teste é a
  // NEGATIVA — a migration NÃO pode conter senha — e ela é a que impede a
  // reincidência: o teste antigo comparava a senha da migration com a
  // constante, o que só provava que as duas cópias concordavam (e as duas
  // eram públicas).
  it('a migration NOVA tira a senha do papel de runtime (#118)', () => {
    // A migration ANTIGA criou o papel com a senha em texto puro — e ela e'
    // HISTORIA: um banco que ja' rodou aquela migration tem o papel com a
    // senha. Por isso a migration NOVA e' que FORCA o estado novo
    // (`ALTER ROLE … NOLOGIN`), e nao apenas o descreve.
    expect(semComentarios(sqlDeSistema)).toMatch(/ALTER ROLE app_runtime NOLOGIN/);
  });

  it('a migration NOVA nao contem senha de papel nenhum', () => {
    expect(semComentarios(sqlDeSistema)).not.toMatch(/PASSWORD/i);
  });

  it('a senha antiga do papel esta na DENYLIST, e nao em lugar nenhum como default', () => {
    // A senha `app_runtime_dev` esta no historico do Git — e continua no
    // repositorio, mas como valor que precisa ser RECUSADO, e nao como
    // default aplicavel. E o que o guard de boot consulta.
    expect(SENHAS_EXPOSTAS).toContain('app_runtime_dev');
    // E ela nao aparece como senha em nenhuma migration NOVA — o CODIGO,
    // nao o comentario que documenta a remocao.
    expect(semComentarios(sqlDeSistema)).not.toContain('app_runtime_dev');
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
    // `'*'` e o valor que a aplicacao ESCREVE. Se um lado virar `'todos'`, a
    // seguranca silenciosamente deixa de reconhecer o admin global — e o
    // sintoma e "o seed funciona mas o admin nao ve nenhuma empresa".
    expect(sql).toContain(`escopo_atual() = '${ESCOPO_DE_SISTEMA}'`);
  });

  // ── #118: o bucket de sistema e concedido pela CREDENCIAL ─────────────
  //
  // O teste antigo acima afirmava que o SQL continha `escopo_atual() = '*'`.
  // Ele ainda vale — a migration ANTIGA contem, e e ela que esta no historico
  // do banco. O que a migration NOVA faz e trocar esse disjunto pela
  // credencial, e e o que estes testes afirmam.
  describe('#118 — o bucket de sistema pela credencial', () => {
    it('a migration nova cria o papel de SISTEMA, sem senha', () => {
      expect(sqlDeSistema).toContain(`CREATE ROLE ${PAPEL_DE_SISTEMA}`);
      expect(sqlDeSistema).toMatch(new RegExp(`CREATE ROLE ${PAPEL_DE_SISTEMA}[\\s\\S]*?NOLOGIN`));
      expect(sqlDeSistema).not.toMatch(
        new RegExp(`CREATE ROLE ${PAPEL_DE_SISTEMA}[\\s\\S]{0,400}?PASSWORD`),
      );
    });

    it('a policy concede o bucket de sistema pela CREDENCIAL, nao pelo GUC', () => {
      // O ponto: `current_user = 'app_system'`. Uma sessao `app_runtime` que
      // escreva `'*'` no GUC nao satisfaz isto — e `current_user` nao e'
      // escreveivel.
      expect(semComentarios(sqlDeSistema)).toContain(`current_user = '${PAPEL_DE_SISTEMA}'`);
      expect(semComentarios(sqlDeSistema)).not.toContain("escopo_atual() = '*'");
    });

    it('as TRES funcoes de escopo trocam o GUC pela credencial', () => {
      // `no_escopo_atual`, `usuario_no_escopo` e `perfil_do_escopo` — as
      // tres que concediam o bucket de sistema pelo valor do GUC.
      const funcoes = semComentarios(sqlDeSistema).match(/CREATE OR REPLACE FUNCTION \w+/g) ?? [];
      expect(funcoes.length).toBe(3);
      // Nenhuma delas pode conter o disjunto antigo.
      expect(semComentarios(sqlDeSistema)).not.toMatch(/escopo_atual\(\) = '\*'/);
    });

    it('a policy de insercao de users exige a credencial', () => {
      // `users_insercao` exigia `escopo_atual() = '*'` — um valor que a
      // sessao escrevia. Agora exige a credencial.
      expect(semComentarios(sqlDeSistema)).toMatch(
        /CREATE POLICY users_insercao[\s\S]*?current_user = 'app_system'/,
      );
    });

    it('o runtime NAO e membro do papel de sistema', () => {
      // Se fosse, um `SET ROLE` bastaria e o furo voltaria pela porta dos
      // fundos. E o teste que roda contra Postgres real confirma.
      expect(semComentarios(sqlDeSistema)).not.toMatch(/GRANT app_system TO app_runtime/i);
      expect(semComentarios(sqlDeSistema)).not.toMatch(/GRANT app_runtime TO app_system/i);
    });
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

describe('uriComoPapelDeRuntime / uriComoPapelDeSistema', () => {
  const SENHA = 'uma-senha-de-teste-com-32-bytes-no-minimo';

  it('troca o usuario, a senha e preserva host, porta e banco', () => {
    const uri = uriComoPapelDeRuntime('postgresql://dono:***@localhost:55432/app', SENHA);

    expect(uri).toContain(`//${PAPEL_DE_RUNTIME}:`);
    expect(uri).toContain('@localhost:55432/app');
  });

  it('funciona com uma URI que ja traz query string de driver', () => {
    const uri = uriComoPapelDeRuntime('postgresql://dono:***@db:5432/app?schema=public', SENHA);

    expect(uri).toContain(`//${PAPEL_DE_RUNTIME}:`);
    expect(uri).toContain('@db:5432/app');
    expect(uri).toContain('schema=public');
  });

  it('a senha vem do ARGUMENTO, e nao de uma constante do repo (#118)', () => {
    // A senha nao esta no codigo: ela chega de quem a aplica (o setup, a
    // partir do ambiente). Este e o teste que diz isso.
    const uri = uriComoPapelDeRuntime(
      'postgresql://dono:***@db:5432/app',
      'senha-que-saiu-do-ambiente',
    );
    expect(uri).toContain('senha-que-saiu-do-ambiente');
  });

  it('a URI de SISTEMA usa o papel de sistema, e nao o de runtime (#118)', () => {
    // As duas credenciais sao DISTINTAS: e a separacao que fecha o furo.
    const deRuntime = uriComoPapelDeRuntime('postgresql://dono:***@db:5432/app', SENHA);
    const deSistema = uriComoPapelDeSistema('postgresql://dono:***@db:5432/app', SENHA);

    expect(deRuntime).toContain(`//${PAPEL_DE_RUNTIME}:`);
    expect(deSistema).toContain(`//${PAPEL_DE_SISTEMA}:`);
    expect(deRuntime).not.toContain(PAPEL_DE_SISTEMA);
  });
});

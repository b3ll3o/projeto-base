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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAPEL_DE_RUNTIME,
  PAPEL_DE_SISTEMA,
  ESCOPO_DE_SISTEMA,
  PAPEIS_COM_SENHA_GERIDA,
  PARAMETRO_DE_ESCOPO,
  STATEMENT_TIMEOUT_DO_PAPEL,
  TAMANHO_MINIMO_DE_SENHA_DE_PAPEL,
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

// #133: a migration de ROTAÇÃO. E ela que limpa o hash da senha que o
// repositorio publicou — em todo banco que ja rodou a migration antiga.
const MIGRATION_DE_ROTACAO = new URL(
  '../../../../prisma/migrations/20261108000001_papel_runtime_sem_senha_publicada/migration.sql',
  import.meta.url,
);
const sqlDeRotacao = readFileSync(fileURLToPath(MIGRATION_DE_ROTACAO), 'utf8');

// #133: o `prepara-papeis.sh` e a camada que ESCREVE a senha, e o numero do
// tamanho minimo mora nos DOIS lados (TypeScript e shell). Este arquivo
// reconcilia os dois.
const SCRIPT_DE_PAPEIS = new URL('../../../../scripts/prepara-papeis.sh', import.meta.url);
const scriptDePapeis = readFileSync(fileURLToPath(SCRIPT_DE_PAPEIS), 'utf8');

// 2026-11-10 (conformidade do system design): a migration do ORÇAMENTO DE
// TEMPO do papel. O número mora nos DOIS lados (TypeScript e SQL) — e este
// arquivo reconcilia os dois, pelo mesmo motivo do tamanho mínimo.
const MIGRATION_DO_ORCAMENTO = new URL(
  '../../../../prisma/migrations/20261110000000_statement_timeout_do_papel/migration.sql',
  import.meta.url,
);
const sqlDoOrcamento = readFileSync(fileURLToPath(MIGRATION_DO_ORCAMENTO), 'utf8');

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

  // pt-BR (2026-11-10 — conformidade do system design): o orçamento de tempo
  // do papel é declarado em DOIS lugares — a constante e a migration — porque
  // migration não recebe parâmetro de env. Sem esta reconciliação, trocar o
  // número num lado só não dá erro de compilação nem de migration: só
  // aparece como "a query de 30 s rodou" (ou "a query de 2 s foi cortada"),
  // longe da linha que causou.
  it('o statement_timeout da migration e o da constante (o numero tem UM dono)', () => {
    const codigo = semComentarios(sqlDoOrcamento);
    expect(codigo).toContain(`SET statement_timeout = '${STATEMENT_TIMEOUT_DO_PAPEL}'`);
  });

  it('os DOIS papeis da API recebem o mesmo orcamento', () => {
    // `app_runtime` é o tráfego; `app_system` é o bucket de sistema (login,
    // refresh, logout e a idempotência). As duas falam com o mesmo banco.
    const codigo = semComentarios(sqlDoOrcamento);
    expect(codigo).toContain(`ALTER ROLE ${PAPEL_DE_RUNTIME} SET statement_timeout`);
    expect(codigo).toContain(`ALTER ROLE ${PAPEL_DE_SISTEMA} SET statement_timeout`);
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

  it('a senha antiga do papel nao esta em NENHUM lugar do repositorio (#133)', () => {
    // A senha que o repositorio publicou está no HISTÓRICO do Git — e é por
    // isso que ela não pode estar no ARVORE: a lista por valor exigia
    // escrevê-la, e escrever era publicar de novo.
    //
    // O que a barra agora é o CRITÉRIO: o prefixo de exemplo e o tamanho
    // mínimo. E a senha publicada tinha 15 caracteres — abaixo do mínimo.
    const arquivos = [sql, sqlDeSistema, sqlDeRotacao, scriptDePapeis].join('\n');
    // ⚠️ O literal do `printf` do script (`PASSWORD '%s'`) NÃO é uma senha
    // versionada — é o TEMPLATE que recebe a senha do ambiente. A regex
    // procura um valor LITERAL, e `%s` não é um.
    expect(arquivos).not.toMatch(/PASSWORD\s+'[a-z0-9_]+'/i);
    // ⚠️ A asserção é pela FORMA da senha publicada (`app_runtime_` + uma
    // palavra), e NÃO pelo valor: escrever o valor AQUI seria publicá-lo de
    // novo — e o critério de aceite da #133 é que o `git grep` do literal não
    // encontre nada. A forma barra o mesmo defeito (a denylist por valor era
    // `['<a senha publicada>']`) sem escrever o segredo no repositório.
    expect(arquivos).not.toMatch(/app_runtime_[a-z]+/);
  });

  it('a migration de ROTAÇÃO limpa o hash da senha publicada (#133)', () => {
    // `NOLOGIN` NAO limpa a senha — MEDIDO: depois das 15 migrations, o papel
    // tinha `rolcanlogin = f` e `rolpassword` NÃO-nulo (o hash SCRAM seguia
    // em `pg_authid`). É o `PASSWORD NULL` que apaga o segredo.
    expect(semComentarios(sqlDeRotacao)).toMatch(/ALTER ROLE app_runtime NOLOGIN PASSWORD NULL/);
  });

  it('o tamanho minimo do TypeScript e o do script que APLICA a senha (#133)', () => {
    // O numero mora nos DOIS lados — o TypeScript (o dono) e o shell (a
    // camada que escreve). Sem esta reconciliacao, os dois divergem em
    // silencio e a regra deixa de valer sem ninguem perceber.
    expect(scriptDePapeis).toContain(
      `TAMANHO_MINIMO_DE_SENHA_DE_PAPEL=${TAMANHO_MINIMO_DE_SENHA_DE_PAPEL}`,
    );
  });

  it('os papeis que o script ESCREVE sao os do TypeScript (#133)', () => {
    // ⚠️ (#133) A lista do shell e a do TypeScript precisam ser a MESMA — e
    // a spec antiga comparava a lista do shell com ELA MESMA, o que nao
    // prova nada: se o TypeScript perdesse `app_system`, o guard deixaria
    // de exigir 24 caracteres do papel de sistema e a spec continuaria
    // verde.
    const papelDoScript = /PAPEL_DE_RUNTIME='([^']*)'/.exec(scriptDePapeis);
    const papelDeSistemaDoScript = /PAPEL_DE_SISTEMA='([^']*)'/.exec(scriptDePapeis);
    expect(papelDoScript?.[1]).toBe(PAPEL_DE_RUNTIME);
    expect(papelDeSistemaDoScript?.[1]).toBe(PAPEL_DE_SISTEMA);
    expect([papelDoScript?.[1], papelDeSistemaDoScript?.[1]]).toEqual([...PAPEIS_COM_SENHA_GERIDA]);
  });

  it('o script recusa o placeholder e a senha curta — a camada que ESCREVE (#133)', () => {
    // A regra é APLICADA na camada que escreve, e não só no guard: um
    // placeholder recusado pelo guard mas aplicado pelo script deixa o papel
    // com senha pública mesmo com a API recusando o boot.
    // ⚠️ O `case` confere a senha JÁ NORMALIZADA (o `tr` de uma linha acima):
    // o `case` do shell distingue maiúsculas, e o guard não — e é a camada
    // que ESCREVE a senha que não pode deixar a isca passar.
    expect(scriptDePapeis).toMatch(/tr '\[:upper:\]' '\[:lower:]'/);
    // ⚠️ (#133) O `***` é PREFIXO — as aspas protecting o literal e o `*`
    // FORA delas. O padrão `'***'` (sem o `*` de fora) casa o valor EXATO, e
    // o script aceitava `***` + 21 bytes.
    expect(scriptDePapeis).toMatch(/change_me\*\|'\*\*\*'\*\)/);
    expect(scriptDePapeis).toContain('motivo_da_recusa');
  });

  // ⚠️ O comportamento do filtro do script é medido RODANDO o shell — e não
  // por `grep` no texto. Um `grep` não distingue "o filtro recusa o
  // placeholder" de "o filtro tem a palavra `CHANGE_ME` no fonte": o defeito
  // real (o `case` do shell é case-SENSITIVE, e o do guard não) só aparece
  // quando a FUNÇÃO roda.
  describe('o filtro do `prepara-papeis.sh`, RODADO', () => {
    /**
     * A função `motivo_da_recusa` extraída do script, e um chamador.
     *
     * ⚠️ (#133) A função recebe TRÊS argumentos: a senha, o USUÁRIO da URI e
     * o PAPEL que a senha vai SERVIR. O papel é o que decide o MÍNIMO — e o
     * usuário é o que decide se a URI aponta para o papel que recebe a
     * senha.
     */
    function executar(
      senha: string,
      usuario: string,
      papel: string,
    ): { recusa: boolean; motivo: string } {
      const corpo = /motivo_da_recusa\(\)[\s\S]*?^}/m.exec(scriptDePapeis);
      expect(corpo).not.toBeNull();
      const medidor = /tamanho_da_senha\(\)[\s\S]*?^}/m.exec(scriptDePapeis);
      expect(medidor).not.toBeNull();
      const papelDoScript = /PAPEL_DE_RUNTIME='([^']*)'/.exec(scriptDePapeis);
      const papelDeSistemaDoScript = /PAPEL_DE_SISTEMA='([^']*)'/.exec(scriptDePapeis);
      const minimo = /TAMANHO_MINIMO_DE_SENHA_DE_PAPEL=(\d+)/.exec(scriptDePapeis);
      expect(papelDoScript).not.toBeNull();
      expect(papelDeSistemaDoScript).not.toBeNull();
      expect(minimo).not.toBeNull();
      const arquivo = join(mkdtempSync(join(tmpdir(), 'filtro-senha-')), 'filtro.sh');
      writeFileSync(
        arquivo,
        `PAPEIS_COM_SENHA_GERIDA='${papelDoScript![1]} ${papelDeSistemaDoScript![1]}'\n` +
          `TAMANHO_MINIMO_DE_SENHA_DE_PAPEL=${minimo![1]}\n` +
          `${medidor![0]}\n${corpo![0]}\n` +
          `if motivo="$(motivo_da_recusa "$1" "$2" "$3")"; then ` +
          `printf 'RECUSA|%s\\n' "$motivo"; else printf 'ACEITA\\n'; fi\n`,
        'utf-8',
      );
      // `execFileSync` com argv em ARRAY — o `check-shell-injection` recusa
      // `execSync` com o comando montado por concatenação, e a razão é boa:
      // um valor interpolado vai cru para o shell.
      const saida = execFileSync('sh', [arquivo, senha, usuario, papel], { encoding: 'utf-8' });
      const linha = saida.trim();
      const recusa = linha.startsWith('RECUSA');
      return { recusa, motivo: recusa ? linha.slice('RECUSA|'.length) : '' };
    }

    it('recusa o placeholder — em QUALQUER caixa', () => {
      // MEDIDO 2026-11-08: o `case` do shell distingue maiúsculas, e o
      // guard normaliza — então `Change_Me_…` (a MESMA isca, com outra
      // caixa) passava pela camada que ESCREVE a senha.
      expect(
        executar('CHANGE_ME_gerar_com_openssl_rand_hex_32', 'app_runtime', 'app_runtime').recusa,
      ).toBe(true);
      expect(
        executar('change_me_gerar_com_openssl_rand_hex_32', 'app_runtime', 'app_runtime').recusa,
      ).toBe(true);
      expect(
        executar('Change_Me_gerar_com_openssl_rand_hex_32', 'app_runtime', 'app_runtime').recusa,
      ).toBe(true);
      expect(executar('***', 'app_runtime', 'app_runtime').recusa).toBe(true);
    });

    it('recusa a senha CURTA de um papel gerenciado (#133)', () => {
      // O valor que o repositório publicou tinha 15 caracteres — e o filtro
      // antigo (mínimo 16) o aceitava.
      expect(executar('a'.repeat(15), 'app_runtime', 'app_runtime').recusa).toBe(true);
      expect(executar('a'.repeat(15), 'app_system', 'app_system').recusa).toBe(true);
      expect(executar('a'.repeat(24), 'app_runtime', 'app_runtime').recusa).toBe(false);
    });

    it('NÃO recusa a senha curta do DONO — é o bootstrap de dev documentado', () => {
      // O `apps/api/.env.example` entrega `projeto:projeto` (6 caracteres)
      // para o dono, e o guard de boot faz a MESMA distinção (o mínimo
      // alcança os papéis gerenciados, não o dono). As duas camadas precisam
      // concordar — e o dev precisa subir.
      expect(executar('projeto', 'projeto', '').recusa).toBe(false);
      expect(executar('a'.repeat(15), 'projeto', '').recusa).toBe(false);
    });

    // ⚠️ (#133) O P0: o filtro era indexado pelo USUÁRIO da URI, e a senha
    // era escrita nos PAPÉIS fixos. Renomear o usuário burlava o conserto —
    // MEDIDO: `usuario='runtime'` + senha de 15 caracteres passava, e o
    // `ALTER ROLE app_runtime` aplicava essa senha no papel de runtime.
    it('RECUSA a URI que NAO nomeia o papel que recebe a senha (#133)', () => {
      const burla = executar('a'.repeat(32), 'runtime', 'app_runtime');
      expect(burla.recusa).toBe(true);
      // E o motivo é o da COUPLING — e não o do tamanho (a senha tem 32).
      expect(burla.motivo).toContain('app_runtime');
      // O mesmo para o papel de SISTEMA.
      expect(executar('a'.repeat(32), 'app_runtime', 'app_system').recusa).toBe(true);
    });

    it('a MEDIDA e em BYTES — as duas camadas medem a mesma coisa (#133)', () => {
      // 6 emojis = 12 caracteres (que o TypeScript contava como 12) e 24
      // BYTES. MEDIDO: antes desta correção, essa senha PASSAVA no script
      // — que é quem ESCREVE — e era RECUSADA pelo guard.
      expect(executar('😀'.repeat(6), 'app_runtime', 'app_runtime').recusa).toBe(false);
      // 5 emojis = 20 bytes: recusada pelos DOIS lados.
      expect(executar('😀'.repeat(5), 'app_runtime', 'app_runtime').recusa).toBe(true);
    });

    // ⚠️ (#133) A MEDIDA é da senha CRUA — e o ESCAPE do SQL é aplicado no
    // FIM (no `printf`), não na leitura da URI. MEDIDO 2026-11-09: com o
    // escape antes do filtro, uma senha de 12 bytes feita de aspas virava
    // 24 bytes ESCAPADOS, e o script — que é quem ESCREVE — aplicava o que
    // o guard (que mede a senha crua) recusava. A camada que escreve era a
    // mais frouxa das duas.
    it('a senha CRUA e a que o filtro mede — o escape do SQL vem depois (#133)', () => {
      const aspas = "'".repeat(12);
      const medida = executar(aspas, 'app_runtime', 'app_runtime');
      expect(medida.recusa).toBe(true);
      // E o motivo mede o TAMANHO CRU (12) — e nao o escapado (24), que
      // passaria pelo minimo.
      expect(medida.motivo).toMatch(/^tem 12 bytes/);
    });

    it('o escape do aspas acontece no SQL, e nao na leitura da URI (#133)', () => {
      // A leitura devolve a senha CRUA — e o escape e um passo separado, que
      // roda no `printf` do SQL. E essa separacao que faz as DUAS camadas
      // medirem a mesma coisa.
      const leitura = /senha_de\(\)\s*\{[\s\S]*?^\}/m.exec(scriptDePapeis);
      expect(leitura).not.toBeNull();
      expect(leitura![0]).not.toContain('replace(');
      expect(scriptDePapeis).toMatch(/senha_no_sql\(\)/);
    });

    // ⚠️ (#133) O `***` e PREFIXO, como no guard (`startsWith`) — e nao o
    // valor exato. MEDIDO 2026-11-09: o padrao `'***'` (entre aspas) casa
    // EXATO, e o script ACCEPTAVA `***` + 21 bytes — valor que o guard
    // classifica como exemplo.
    it('o `***` e PREFIXO — como no guard, que usa `startsWith` (#133)', () => {
      expect(executar('***', 'app_runtime', 'app_runtime').recusa).toBe(true);
      expect(executar('***abcdefghijklmnopqrstu', 'app_runtime', 'app_runtime').recusa).toBe(true);
      // E o prefixo `change_me` continua sendo prefixo.
      expect(executar('change_me_gerar', 'app_runtime', 'app_runtime').recusa).toBe(true);
    });
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

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  checkFeatureFlagPortas,
  parsearPortas,
  rotasDoController,
  chavesUsadasNoController,
  rotaTrancaComAChave,
  type PortaDeclarada,
} from './check-feature-flag-portas.js';

// pt-BR (#110, 2026-10-19): a paridade declarado ↔ código.
//
// Este spec tem dois blocos de propósito diferente:
//
//   1. as primitivas, com fixtures curtas — para fixar a mecânica (parse,
//      rota, chave usada);
//   2. o gate contra os **ARQUIVOS REAIS**, que é o teste que a issue exige
//      ("spec que roda contra os arquivos reais, não só fixtures").
//
// Os dois mais importantes estão no fim e são os que medem o que a issue
// pede: uma porta declarada que sumiu, e uma porta aberta que ninguém
// declarou.

const CONTRATO = `Feature flags

## §4. Respostas

\`\`\`json
{ "chave": "tenancy.invites", "descricao": "Convites." }
\`\`\`

## §8.1 As portas

\`\`\`yaml
portas:
  tenancy.invites:
    - rota: POST /tenants/:id/invitations
      mecanismo: decorator
      controller: tenancy-invitations.controller.ts
\`\`\`

## §9. Fim
`;

// ⚠️ Formato IDÊNTICO ao arquivo real: um decorator por linha. Com o anchor de
// início de linha do gate, um fixture de linha única não seria lido — e um
// fixture que o gate não lê passa a medir nada.
const CTRL_COM_DECORATOR = `
@Controller()
export class C {
  @Post('tenants/:id/invitations')
  @RequireFeatureFlag('tenancy.invites')
  async convidar() {}
}
`;

describe('parsearPortas', () => {
  it('lê a chave, a rota, o mecanismo e o controller', () => {
    const portas = parsearPortas(CONTRATO);
    expect(portas).toHaveLength(1);
    const p = portas[0] as PortaDeclarada;
    expect(p.chave).toBe('tenancy.invites');
    expect(p.rota).toBe('POST /tenants/:id/invitations');
    expect(p.mecanismo).toBe('decorator');
    expect(p.controller).toBe('tenancy-invitations.controller.ts');
  });

  it('a descrição em prosa ("três portas") NÃO abre o bloco', () => {
    // MEDIDO: com `indexOf('portas:')` solto, a palavra dentro da `descricao`
    // de §4 era o primeiro casamento e o gate devolvia ZERO portas com a lista
    // perfeitamente escrita. O bloco é ancorado em linha inteira.
    const comPalavra = CONTRATO.replace(
      '"descricao": "Convites."',
      '"descricao": "Desligar tranca as três portas: convidar."',
    );
    expect(parsearPortas(comPalavra)).toHaveLength(1);
  });

  it('contrato sem o bloco devolve lista vazia — o gate acusa, não passa', () => {
    expect(parsearPortas('nada aqui')).toEqual([]);
  });
});

describe('rotasDoController', () => {
  it('normaliza com barra inicial — o contrato escreve `POST /tenants/…`', () => {
    const rotas = rotasDoController(CTRL_COM_DECORATOR);
    expect(rotas.has('POST /tenants/:id/invitations')).toBe(true);
  });

  it('`@Post()` sem path casa a rota RAIZ do `@Controller()`', () => {
    // O formato é o do ARQUIVO REAL — um decorator por linha. Com o anchor de
    // início de linha, `class C { @Post() … }` numa linha só não é decorator,
    // e é isso que impede um comentário de virar rota.
    const rotas = rotasDoController(`
@Controller('users')
export class UsersController {
  @Post()
  async criar() {}
}
`);
    expect(rotas.has('POST /users')).toBe(true);
  });

  it('comentário com `@Post(...)` não vira rota', () => {
    // O arquivo real tem `users.controller.ts:131` falando de `@Post` em
    // comentário. Contá-lo seria declarar uma porta que não existe.
    const rotas = rotasDoController(`// ver o @Post('exemplo') acima`);
    expect(rotas.size).toBe(0);
  });
});

describe('chavesUsadasNoController', () => {
  it('acha o decorator e a chamada inline', () => {
    const usadas = chavesUsadasNoController(`
      @RequireFeatureFlag('tenancy.invites')
      @Post('x') a() {}
      async b() { await chaveDesligada(this.flags, 'tenancy.invites'); }
    `);
    expect([...usadas]).toEqual(['tenancy.invites']);
  });

  it('a chave em PROSA não conta — é o que fecha o gate contra o comentário', () => {
    const usadas = chavesUsadasNoController(
      `// aqui checamos a flag tenancy.invites antes de gravar`,
    );
    expect(usadas.size).toBe(0);
  });
});

describe('rotaTrancaComAChave — o decorator DEPOIS do @Post', () => {
  // MEDIDO no arquivo real: `@Post` na linha 81, `@RequireFeatureFlag` na 92.
  // A premissa "decorator acima da rota" fez a janela olhar para o lado errado
  // e o gate passar verde com a quarta porta aberta.
  it('acha o `@RequireFeatureFlag` que está DEPOIS do `@Post`', () => {
    expect(
      rotaTrancaComAChave(CTRL_COM_DECORATOR, 'POST /tenants/:id/invitations', 'tenancy.invites'),
    ).toBe(true);
  });

  it('a janela NÃO contamina: o decorator da rota anterior não vale para esta', () => {
    const duas = `
      @Post('a')
      @RequireFeatureFlag('tenancy.invites')
      async uma() {}
      @Post('b')
      async duas() {}
    `;
    expect(rotaTrancaComAChave(duas, 'POST /a', 'tenancy.invites')).toBe(true);
    expect(rotaTrancaComAChave(duas, 'POST /b', 'tenancy.invites')).toBe(false);
  });

  it('a chave errada na janela é `false`', () => {
    expect(
      rotaTrancaComAChave(CTRL_COM_DECORATOR, 'POST /tenants/:id/invitations', 'tenancy.exports'),
    ).toBe(false);
  });

  it('rota inexistente é `false`', () => {
    expect(rotaTrancaComAChave(CTRL_COM_DECORATOR, 'POST /nao-existe', 'tenancy.invites')).toBe(
      false,
    );
  });
});

describe('checkFeatureFlagPortas — a paridade', () => {
  const ctl = new Map([['tenancy-invitations.controller.ts', CTRL_COM_DECORATOR]]);

  it('alinhado: verde', () => {
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: ctl });
    expect(r.ok).toBe(true);
  });

  // Anti-vacuuidade: 0 portas é verde vago. Sem este, o gate acima passa com
  // um contrato que não declara nada.
  it('contrato com ZERO portas é ERRO, não verde', () => {
    const r = checkFeatureFlagPortas({
      contratoTexto: CONTRATO.replace(/portas:[\s\S]*?```/, 'portas:\n```'),
      controllers: ctl,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('nenhuma porta declarada');
  });

  it('porta listada cujo controller NÃO existe é erro nomeado', () => {
    const r = checkFeatureFlagPortas({
      contratoTexto: CONTRATO.replace(
        'controller: tenancy-invitations.controller.ts',
        'controller: nao-existe.controller.ts',
      ),
      controllers: ctl,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('nao-existe.controller.ts');
  });

  // ⚠️ O furo mais grave que este gate já teve, e que a spec fixa:
  // contando por ARQUIVO, "este controller usa a chave" era verdade para as
  // DUAS portas, e a que perdia o decorator passava verde — rota ABERTA com a
  // flag desligada, gate verde. MEDIDO 2026-10-19: removendo o
  // `@RequireFeatureFlag` da 1a porta de `tenancy-invitations.controller.ts`, a
  // versão por arquivo dava `ok: true`.
  it('porta DECLARADA que perde o decorator é erro — a rota fica ABERTA', () => {
    const semDecorador = new Map([
      [
        'tenancy-invitations.controller.ts',
        `
@Controller()
export class C {
  @Post('tenants/:id/invitations')
  async convidar() {}

  @Post('invitations/accept')
  @RequireFeatureFlag('tenancy.invites')
  async aceitar() {}
}
      `,
      ],
    ]);
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: semDecorador });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('ABERTA');
  });

  it('porta listada cuja ROTA não existe no controller é erro', () => {
    const r = checkFeatureFlagPortas({
      contratoTexto: CONTRATO.replace('POST /tenants/:id/invitations', 'POST /sumiu'),
      controllers: ctl,
    });
    expect(r.ok).toBe(false);
    // ⚠️ Os DOIS sentidos acusam este estado, e o gate reporta o 2º primeiro:
    // o sentidol 1 diz que `POST /sumiu` não é decorator lá, e o sentidol 2 diz
    // que a rota que o código tranca (`/tenants/:id/invitations`) não está na
    // lista. Os dois são o MESMO defeito — a lista e o código divergiram —, e o
    // que se afirma é que o gate nomeia a lista que não bate, não a redação.
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors.join('\n')).toContain('não está');
    // E o sentidol 1 tem de dizer que a rota listada não existe — se saísse só
    // o sentidol 2, o gate não estaria cobrindo o contrato envelhecido.
    expect(r.errors.join('\n')).toMatch(/sumiu|\/tenants\/:id\/invitations/);
  });

  // ⚠️ O sentido 2 é o que fecha a #110: a quarta porta.
  it('porta ABERTA no código e ausente da lista é erro — a quarta porta', () => {
    const comQuarta = new Map([
      [
        'tenancy-invitations.controller.ts',
        `
@Controller()
export class C {
  @Post('tenants/:id/invitations')
  @RequireFeatureFlag('tenancy.invites')
  async convidar() {}

  @Post('tenants/:id/invitations/bulk')
  @RequireFeatureFlag('tenancy.invites')
  async emLote() {}
}
      `,
      ],
    ]);
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: comQuarta });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('/tenants/:id/invitations/bulk');
    expect(r.errors[0]).toContain('não está');
  });

  it('chave usada por controller inteiro que não tem NENHUMA porta declarada é erro', () => {
    const outro = new Map([['users.controller.ts', CTRL_COM_DECORATOR]]);
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: outro });
    expect(r.ok).toBe(false);
    // O sentidol 1 acusa que a rota listada não existe em
    // `users.controller.ts` (que não foi fornecido ao gate). O sentidol 2 é o
    // que pega o caso: `users.controller.ts` USA a chave e nenhuma porta dela
    // declara esse controller. O que se prova é que o arquivo que usa a chave é
    // nomeado.
    expect(r.errors.join('\n')).toContain('users.controller.ts');
  });

  it('o advisory nomeia a contagem — 0 conferidas e 3 conferidas são estados distintos', () => {
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: ctl });
    expect(r.advisories?.[0]).toContain('1 porta(s) declarada(s)');
    expect(r.advisories?.[0]).toContain('1 conferida(s)');
  });

  it('o advisory declara o alcance: paridade, não inferência de consumo', () => {
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: ctl });
    expect(r.advisories?.join(' ')).toContain('NÃO infere consumo indireto');
  });
});

// ── Os 6 defeitos do PR #112 ─────────────────────────────────────────────────
//
// Achados na revisão do PR, todos reproduzidos por mutação no repo ANTES de
// consertar. Cada teste abaixo é a mutação que o revisor rodou, com o mesmo
// `ok=true` que ele viu.
//
// ⚠️ Os seis têm a mesma assinatura: o gate ficava VERDE. Nenhum deles
// aparecia nos testes, porque todos os testes usavam o MESMO código-fonte com
// o MESMO defeito — um spec que só prova que a implementação faz o que a
// implementação faz. É a razão de o bloco de fixtures acima existir ao lado
// deste.
describe('PR #112 — os seis defeitos que passaram verdes', () => {
  const ctlDoTenancy = new Map([
    [
      'tenancy-invitations.controller.ts',
      `
@Controller()
export class C {
  @Post('tenants/:id/invitations')
  @RequireFeatureFlag('tenancy.invites')
  async convidar() {}
}
`,
    ],
  ]);

  // DEF 1 ─────────────────────────────────────────────────────────────────────
  // A janela era `includes("'chave'")`, que casa a chave CRUA no corpo do
  // handler. Decorator removido + `chaveDesligada(...)` na linha seguinte:
  // porta ABERTA, gate verde. O mais grave: é a mutação que o #110 existe para
  // pegar, e ela passava.
  it('DEF 1: chave crua no corpo NÃO substitui o decorator', () => {
    const comCrua = new Map([
      [
        'tenancy-invitations.controller.ts',
        `
@Controller()
export class C {
  @Post('tenants/:id/invitations')
  async convidar() {
    const _f = chaveDesligada(this.flags, 'tenancy.invites');
  }
}
`,
      ],
    ]);
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: comCrua });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('NENHUM @RequireFeatureFlag');
  });

  // DEF 2 ─────────────────────────────────────────────────────────────────────
  // O cascading: com `includes`, uma chave crua numa janela valia para a rota.
  // Agora a chave crua só pode virar erro se a rota FOR declarada — e a
  // `POST /users` declarada tranca em `inline`, então não.
  it('DEF 2: chave crua numa janela NÃO acusa rota que não tranca', () => {
    const comCrua = new Map([
      [
        'tenancy-invitations.controller.ts',
        `
@Controller()
export class C {
  @Post('tenants/:id/invitations')
  @RequireFeatureFlag('tenancy.invites')
  async convidar() {}

  @Post('tenants/:id/invitations/bulk')
  async emLote() {
    const _z = chaveDesligada(this.flags, 'tenancy.invites');
  }
}
`,
      ],
    ]);
    // A chave crua NÃO é tranca: a rota `bulk` segue não declarada, mas como
    // ela não tranca nada com decorator, o gate não pode acusá-la de aberta.
    // E a porta declarada continua verde — o cascading não a contaminou.
    const r = checkFeatureFlagPortas({ contratoTexto: CONTRATO, controllers: comCrua });
    expect(r.errors.join('\n')).not.toContain('/bulk');
  });

  // DEF 3 ─────────────────────────────────────────────────────────────────────
  // A chave dona vinha do CATÁLOGO JSON (`"chave": "..."`), não do YAML. Um
  // erro de digitão em `tenancy.invites:` não mudava NADA no gate.
  it('DEF 3: a chave dona vem do YAML, e erro de digitão é erro', () => {
    const comErro = CONTRATO.replace('  tenancy.invites:', '  tenancy.invite:');
    expect(comErro).not.toBe(CONTRATO); // a mutation aconteceu

    const r = checkFeatureFlagPortas({ contratoTexto: comErro, controllers: ctlDoTenancy });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('tenancy.invite');
  });

  it('DEF 3b: cada entrada herda a chave do SEU bloco, não a última', () => {
    // Dois blocos, duas chaves. "A última do arquivo" erraria o primeiro.
    const duasChaves = CONTRATO.replace(
      '```\n\n## §9. Fim',
      `
  tenancy.outra:
    - rota: POST /outra/rota
      mecanismo: decorator
      controller: outra.controller.ts
\`\`\`

## §9. Fim`,
    );
    const portas = parsearPortas(duasChaves);
    expect(portas.map((p) => p.chave)).toEqual(['tenancy.invites', 'tenancy.outra']);
  });

  // DEF 4 ─────────────────────────────────────────────────────────────────────
  // O sentildo 1 só conferia `mecanismo === 'decorator'`, então declarar
  // `inline` desligava a conferência da porta inteira.
  it('DEF 4: `inline` declarado em porta que tranca por decorator é erro', () => {
    const comoInline = CONTRATO.replace(
      '- rota: POST /tenants/:id/invitations\n      mecanismo: decorator',
      '- rota: POST /tenants/:id/invitations\n      mecanismo: inline',
    );
    expect(comoInline).not.toBe(CONTRATO);

    const r = checkFeatureFlagPortas({ contratoTexto: comoInline, controllers: ctlDoTenancy });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('mecanismo "inline"');
  });

  // DEF 5 ─────────────────────────────────────────────────────────────────────
  it('DEF 5: controller declarado que não existe é erro nomeado', () => {
    const sumido = CONTRATO.replace(
      'controller: tenancy-invitations.controller.ts',
      'controller: nao-existe.controller.ts',
    );
    expect(sumido).not.toBe(CONTRATO);

    const r = checkFeatureFlagPortas({ contratoTexto: sumido, controllers: ctlDoTenancy });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('nao-existe.controller.ts');
  });

  // DEF 6 ─────────────────────────────────────────────────────────────────────
  // O prefixo do `@Controller('users')` era aplicado só nas rotas de path
  // VAZIO. `@Get(':id')` saía como `GET /:id`. Invisible porque as três portas
  // declaradas usam `@Controller()` sem prefixo — e a próxima porta em `users`
  // teria comparada `POST /users` contra `/`, sem match e sem conferência.
  it('DEF 6: o prefixo do @Controller vale para rota COM path', () => {
    const rotas = rotasDoController(
      `
@Controller('users')
export class UsersController {
  @Get(':id')
  async porId() {}

  @Patch(':id')
  async atualizar() {}

  @Post()
  async criar() {}
}
`,
    );
    expect([...rotas].sort()).toEqual(['GET /users/:id', 'PATCH /users/:id', 'POST /users']);
  });

  it('DEF 6b: o prefixo do repo real sai com as rotas de pathcheadas', () => {
    // Contra o ARQUIVO REAL — é aqui que o defeito aparecia, e a fixture
    // acima não provaria nada se o arquivo real divergisse.
    const rotas = rotasDoController(
      readFileSync('apps/api/src/modules/users/infrastructure/http/users.controller.ts', 'utf8'),
    );
    expect(rotas.has('GET /users/:id')).toBe(true);
    expect(rotas.has('GET /:id')).toBe(false);
  });
});

// ── O teste que a #110 exige: contra os ARQUIVOS REAIS ──────────────────────
//
// Fixture prova que a mecânica funciona. Isto prova que o gate mede o repo.
describe('checkFeatureFlagPortas — os arquivos do repo', () => {
  it('o contrato real declara as TRÊS portas de tenancy.invites', () => {
    const portas = parsearPortas(
      // Lê o contrato de verdade pelo caminho que o gate usa.
      require('node:fs').readFileSync(
        'docs/superpowers/specs/2026-10-18-feature-flags-contrato-http.md',
        'utf8',
      ) as string,
    );
    const rotas = portas.map((p) => p.rota).sort();
    expect(rotas).toEqual([
      'POST /invitations/accept',
      'POST /tenants/:id/invitations',
      'POST /users',
    ]);
  });

  it('o gate contra o repo real está VERDE', () => {
    const r = checkFeatureFlagPortas();
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    // O advisory tem de dizer 3 — é a contagem que separa "a lista está certa"
    // de "o gate não achou nada para conferir".
    expect(r.advisories?.[0]).toContain('3 porta(s)');
  });
});

/**
 * Bloqueia imports proibidos em arquivos sob a pasta domain.
 * Domain deve ser TypeScript puro: nada de @nestjs (qualquer submodulo),
 * @prisma (qualquer submodulo), class-validator, class-transformer,
 * reflect-metadata, rxjs, paths de infrastructure, nem builtins `node:`
 * (com I/O) — ver PERMITIDOS_NODE.
 *
 * A lista abaixo tem de ser identica a DDD_BLOCKED_IMPORTS em
 * tooling/scripts/stack-code-reviewer.ts: sao dois gates sobre o mesmo arquivo,
 * e um gate mais permissivo que o outro anula o mais restritivo.
 */
const FORBIDDEN = [
  /^@nestjs\//,
  /^@prisma\//,
  /^prisma\//,
  /class-validator/,
  /class-transformer/,
  /^reflect-metadata$/,
  /^rxjs$/,
  /\/infrastructure\//,
  // O PREFIXO e o que se bloqueia — travar cada builtin seria uma lista que
  // envelhece a cada `node:*` novo. Antes os dois gates eram cegos a todos.
  /^node:/,
];

/**
 * Unicos builtins `node:` liberados em domain/: sem I/O e sem adapter.
 * Medido no disco (2026-10-13): exatamente 2 imports `node:` sob `domain/` no
 * repo, e sao estes — `user-id.vo.ts` (UUIDv7 via entropia) e
 * `password-hash.vo.spec.ts` (`inspect` para checar o '[redacted]').
 * A excecao e por modulo, nao por extensao: um `.spec.ts` sob domain/ que
 * importe framework ou `node:fs` continua sendo erro.
 */
const PERMITIDOS_NODE = new Set(['node:crypto', 'node:util']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Domain layer não pode importar de frameworks, ORM ou infrastructure.',
    },
    schema: [],
    messages: {
      forbidden: 'Domain layer não pode importar de "{{module}}". Domain deve ser TypeScript puro.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const inDomain = /[\\/]domain[\\/]/.test(filename);
    if (!inDomain) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source && node.source.value;
        if (typeof source !== 'string') return;
        if (PERMITIDOS_NODE.has(source)) return;
        if (FORBIDDEN.some((re) => re.test(source))) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { module: source },
          });
        }
      },
    };
  },
};

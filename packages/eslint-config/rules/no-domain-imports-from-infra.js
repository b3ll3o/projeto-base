/**
 * Bloqueia imports proibidos em arquivos sob a pasta domain.
 * Domain deve ser TypeScript puro: nada de @nestjs (qualquer submodulo),
 * @prisma (qualquer submodulo), class-validator, class-transformer,
 * reflect-metadata, rxjs, ou paths de infrastructure.
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
];

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Domain layer não pode importar de frameworks, ORM ou infrastructure.",
    },
    schema: [],
    messages: {
      forbidden:
        'Domain layer não pode importar de "{{module}}". Domain deve ser TypeScript puro.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const inDomain = /[\\/]domain[\\/]/.test(filename);
    if (!inDomain) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source && node.source.value;
        if (typeof source !== "string") return;
        if (FORBIDDEN.some((re) => re.test(source))) {
          context.report({
            node,
            messageId: "forbidden",
            data: { module: source },
          });
        }
      },
    };
  },
};

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { AssinaturaDeMembership } from './assinatura-de-membership.js';

@Global()
@Module({
  // pt-BR (Fase 10+): `AssinaturaDeMembership` lê a chave com a conexão de
  // DONO no boot e assina as chamadas de `criar_membership`. Vive aqui porque
  // `PrismaModule` já é `@Global()` e é o módulo que sabe das duas conexões
  // (a de runtime, que é o `PrismaService`, e a do dono, que vem do env).
  providers: [PrismaService, AssinaturaDeMembership],
  exports: [PrismaService, AssinaturaDeMembership],
})
export class PrismaModule {}

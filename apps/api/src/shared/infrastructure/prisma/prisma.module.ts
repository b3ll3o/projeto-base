import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { AssinaturaDeMembership } from './assinatura-de-membership.js';

@Global()
@Module({
  // pt-BR (Fase 10+): `AssinaturaDeMembership` lê a chave no boot e assina as
  // chamadas de `criar_membership`. Vive aqui porque `PrismaModule` já é
  // `@Global()` e é o módulo que sabe da conexão de runtime (o
  // `PrismaService`).
  //
  // ⚠️ (issue #180) A chave é lida por uma FUNÇÃO `SECURITY DEFINER` com a
  // credencial de RUNTIME — e não por uma conexão de DONO: a URI de superuser
  // não entra no ambiente do processo que expõe a API.
  providers: [PrismaService, AssinaturaDeMembership],
  exports: [PrismaService, AssinaturaDeMembership],
})
export class PrismaModule {}

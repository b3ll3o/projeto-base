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
  // ⚠️ (issue #180) A chave é lida por uma FUNÇÃO `SECURITY DEFINER` — e não
  // por uma conexão de DONO: a URI de superuser não entra no ambiente do
  // processo que expõe a API.
  //
  // ⚠️ (issue #180, 2ª revisão) E é lida pelo papel de SISTEMA, e não pelo de
  // RUNTIME: MEDIDO, com o runtime lendo o segredo, a escalada era inteira (o
  // runtime lia os 32 bytes, assinava um corpo e criava um `owner` numa
  // empresa alheia). A assinatura só tem valor como assinatura de um corpo que
  // a APLICAÇÃO pediu — e o material que só ela tem é a chave.
  providers: [PrismaService, AssinaturaDeMembership],
  exports: [PrismaService, AssinaturaDeMembership],
})
export class PrismaModule {}

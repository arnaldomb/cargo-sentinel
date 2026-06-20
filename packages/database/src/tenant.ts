import { PrismaClient } from '@prisma/client';

export function createTenantClient(prisma: PrismaClient, empresaId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: unknown; query: (args: unknown) => Promise<unknown> }) {
          if (args && typeof args === 'object' && 'where' in args) {
            (args as { where: Record<string, unknown> }).where = {
              ...(args as { where: Record<string, unknown> }).where,
              empresaId,
            };
          }
          return query(args);
        },
      },
    },
  });
}

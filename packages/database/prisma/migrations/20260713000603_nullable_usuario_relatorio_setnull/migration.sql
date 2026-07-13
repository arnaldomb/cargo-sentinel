-- DropForeignKey
ALTER TABLE "ClassificacaoHistorico" DROP CONSTRAINT "ClassificacaoHistorico_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "Relatorio" DROP CONSTRAINT "Relatorio_criadoPor_fkey";

-- AlterTable
ALTER TABLE "ClassificacaoHistorico" ALTER COLUMN "usuarioId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Relatorio" ALTER COLUMN "criadoPor" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ClassificacaoHistorico" ADD CONSTRAINT "ClassificacaoHistorico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relatorio" ADD CONSTRAINT "Relatorio_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


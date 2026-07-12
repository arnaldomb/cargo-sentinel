-- CreateEnum
CREATE TYPE "WhatsAppInstanciaStatus" AS ENUM ('DESCONECTADO', 'AGUARDANDO_QR', 'CONECTADO');

-- DropForeignKey
ALTER TABLE "ConfiguracaoAlerta" DROP CONSTRAINT "ConfiguracaoAlerta_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "ConfiguracaoAlerta" DROP CONSTRAINT "ConfiguracaoAlerta_obraId_fkey";

-- DropTable
DROP TABLE "ConfiguracaoAlerta";

-- CreateTable
CREATE TABLE "ConfiguracaoWhatsApp" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "zapiInstanceId" TEXT,
    "zapiToken" TEXT,
    "zapiClientToken" TEXT,
    "whatsappInstStatus" "WhatsAppInstanciaStatus" NOT NULL DEFAULT 'DESCONECTADO',
    "whatsappDestino" TEXT,
    "whatsappGrupoJid" TEXT,
    "whatsappGrupoNome" TEXT,
    "classificacoesAlerta" "Classificacao"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracaoWhatsApp_empresaId_idx" ON "ConfiguracaoWhatsApp"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoWhatsApp_empresaId_key" ON "ConfiguracaoWhatsApp"("empresaId");

-- AddForeignKey
ALTER TABLE "ConfiguracaoWhatsApp" ADD CONSTRAINT "ConfiguracaoWhatsApp_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "Direcao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "Classificacao" AS ENUM ('LIBERADO', 'VISITANTE', 'ATENCAO', 'SUSPEITO', 'CRITICO');

-- CreateEnum
CREATE TYPE "EmpresaStatus" AS ENUM ('ATIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR');

-- CreateEnum
CREATE TYPE "RelatorioStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'PRONTO', 'ERRO');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "status" "EmpresaStatus" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERADOR',
    "empresaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placa" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "empresaTransportadora" TEXT,
    "motorista" TEXT,
    "tipoVeiculo" TEXT,
    "material" TEXT,
    "observacao" TEXT,
    "classificacao" "Classificacao" NOT NULL DEFAULT 'VISITANTE',
    "obraClassificacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificacaoHistorico" (
    "id" TEXT NOT NULL,
    "placaId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "classificacaoDe" "Classificacao",
    "classificacaoPara" "Classificacao" NOT NULL,
    "observacao" TEXT,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassificacaoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "codigoLpr" TEXT NOT NULL,
    "nome" TEXT,
    "ip" TEXT,
    "obraId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placaNumero" TEXT NOT NULL,
    "placaId" TEXT,
    "direcao" "Direcao",
    "fotoGarageKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "classificacao" "Classificacao" NOT NULL DEFAULT 'VISITANTE',
    "rawPayload" JSONB,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoAlerta" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracaoAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relatorio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "status" "RelatorioStatus" NOT NULL DEFAULT 'PENDENTE',
    "formato" TEXT NOT NULL,
    "filtros" JSONB NOT NULL,
    "garageKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "erroMsg" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_empresaId_idx" ON "User"("empresaId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Placa_empresaId_classificacao_idx" ON "Placa"("empresaId", "classificacao");

-- CreateIndex
CREATE UNIQUE INDEX "Placa_numero_empresaId_key" ON "Placa"("numero", "empresaId");

-- CreateIndex
CREATE INDEX "ClassificacaoHistorico_placaId_createdAt_idx" ON "ClassificacaoHistorico"("placaId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ClassificacaoHistorico_empresaId_createdAt_idx" ON "ClassificacaoHistorico"("empresaId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ClassificacaoHistorico_usuarioId_createdAt_idx" ON "ClassificacaoHistorico"("usuarioId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Obra_empresaId_idx" ON "Obra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_codigoLpr_key" ON "Camera"("codigoLpr");

-- CreateIndex
CREATE INDEX "Camera_empresaId_idx" ON "Camera"("empresaId");

-- CreateIndex
CREATE INDEX "Camera_obraId_idx" ON "Camera"("obraId");

-- CreateIndex
CREATE UNIQUE INDEX "Evento_idempotencyKey_key" ON "Evento"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Evento_empresaId_timestamp_idx" ON "Evento"("empresaId", "timestamp");

-- CreateIndex
CREATE INDEX "Evento_empresaId_placaNumero_idx" ON "Evento"("empresaId", "placaNumero");

-- CreateIndex
CREATE INDEX "Evento_placaId_idx" ON "Evento"("placaId");

-- CreateIndex
CREATE INDEX "Evento_obraId_timestamp_idx" ON "Evento"("obraId", "timestamp");

-- CreateIndex
CREATE INDEX "Evento_cameraId_idx" ON "Evento"("cameraId");

-- CreateIndex
CREATE INDEX "Evento_empresaId_placaId_timestamp_idx" ON "Evento"("empresaId", "placaId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ConfiguracaoAlerta_empresaId_idx" ON "ConfiguracaoAlerta"("empresaId");

-- CreateIndex
CREATE INDEX "ConfiguracaoAlerta_obraId_idx" ON "ConfiguracaoAlerta"("obraId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoAlerta_obraId_telefone_key" ON "ConfiguracaoAlerta"("obraId", "telefone");

-- CreateIndex
CREATE INDEX "Relatorio_empresaId_criadoEm_idx" ON "Relatorio"("empresaId", "criadoEm" DESC);

-- CreateIndex
CREATE INDEX "Relatorio_criadoPor_criadoEm_idx" ON "Relatorio"("criadoPor", "criadoEm" DESC);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placa" ADD CONSTRAINT "Placa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placa" ADD CONSTRAINT "Placa_obraClassificacaoId_fkey" FOREIGN KEY ("obraClassificacaoId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoHistorico" ADD CONSTRAINT "ClassificacaoHistorico_placaId_fkey" FOREIGN KEY ("placaId") REFERENCES "Placa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoHistorico" ADD CONSTRAINT "ClassificacaoHistorico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoHistorico" ADD CONSTRAINT "ClassificacaoHistorico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_placaId_fkey" FOREIGN KEY ("placaId") REFERENCES "Placa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoAlerta" ADD CONSTRAINT "ConfiguracaoAlerta_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoAlerta" ADD CONSTRAINT "ConfiguracaoAlerta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relatorio" ADD CONSTRAINT "Relatorio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relatorio" ADD CONSTRAINT "Relatorio_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

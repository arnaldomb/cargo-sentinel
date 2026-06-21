import { Router, type Router as RouterType } from 'express';
import { prisma } from '@cargo-sentinel/database';
import bcrypt from 'bcryptjs';
import { EncryptJWT } from 'jose';
import { hkdf } from '@panva/hkdf';

const router: RouterType = Router();

// ============================================================
// Derivação de chave HKDF idêntica ao auth.ts
// ============================================================
async function deriveKey(cookieName: string): Promise<Uint8Array> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET não configurado');
  return hkdf(
    'sha256',
    secret,
    cookieName,
    `Auth.js Generated Encryption Key (${cookieName})`,
    64,
  );
}

// ============================================================
// GET /api/admin/empresas
// Lista todas as empresas com contagem de obras, câmeras e eventos.
// SADMIN-01 — apenas SUPER_ADMIN (requireRole aplicado no index.ts)
// T-07-02: rota atrás de requireRole('SUPER_ADMIN')
// ============================================================
router.get('/empresas', async (_req, res) => {
  const empresas = await prisma.empresa.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          obras: true,
          cameras: true,
          eventos: true,
          users: true,
        },
      },
    },
  });
  res.json(empresas);
});

// ============================================================
// POST /api/admin/empresas
// Cria empresa + usuário ADMIN_EMPRESA em transação atômica.
// SADMIN-02 — T-07-05: passwordHash excluído da resposta
// ============================================================
router.post('/empresas', async (req, res) => {
  const { nome, cnpj, adminEmail, adminNome, adminSenha } = req.body as {
    nome?: unknown;
    cnpj?: unknown;
    adminEmail?: unknown;
    adminNome?: unknown;
    adminSenha?: unknown;
  };

  // Validação de campos obrigatórios
  if (typeof nome !== 'string' || nome.trim().length < 2) {
    res.status(400).json({ error: 'nome deve ter pelo menos 2 caracteres' });
    return;
  }
  if (typeof cnpj !== 'string' || cnpj.replace(/\D/g, '').length < 14) {
    res.status(400).json({ error: 'cnpj inválido (mínimo 14 dígitos)' });
    return;
  }
  if (
    typeof adminEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)
  ) {
    res.status(400).json({ error: 'adminEmail inválido' });
    return;
  }
  if (typeof adminNome !== 'string' || adminNome.trim().length < 2) {
    res.status(400).json({ error: 'adminNome deve ter pelo menos 2 caracteres' });
    return;
  }
  if (typeof adminSenha !== 'string' || adminSenha.length < 8) {
    res.status(400).json({ error: 'adminSenha deve ter pelo menos 8 caracteres' });
    return;
  }

  // Normalizar CNPJ (apenas dígitos)
  const cnpjNormalizado = cnpj.replace(/\D/g, '');

  try {
    const result = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nome: nome.trim(),
          cnpj: cnpjNormalizado,
        },
      });

      const passwordHash = await bcrypt.hash(adminSenha, 10);

      const user = await tx.user.create({
        data: {
          email: adminEmail.toLowerCase(),
          passwordHash,
          nome: adminNome.trim(),
          role: 'ADMIN_EMPRESA',
          empresaId: empresa.id,
        },
      });

      return {
        empresa,
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          role: user.role,
        },
      };
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    // Prisma P2002: unique constraint (CNPJ ou email duplicado)
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const meta = (err as { meta?: { target?: string[] } }).meta;
      if (meta?.target?.includes('cnpj')) {
        res.status(400).json({ error: 'CNPJ já cadastrado' });
      } else if (meta?.target?.includes('email')) {
        res.status(400).json({ error: 'E-mail já cadastrado' });
      } else {
        res.status(400).json({ error: 'Dados duplicados' });
      }
      return;
    }
    throw err;
  }
});

// ============================================================
// PATCH /api/admin/empresas/:id/status
// Alterna status entre ATIVO e SUSPENSO.
// SADMIN-03
// ============================================================
router.patch('/empresas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: unknown };

  if (status !== 'ATIVO' && status !== 'SUSPENSO') {
    res.status(400).json({ error: 'status deve ser ATIVO ou SUSPENSO' });
    return;
  }

  try {
    const empresa = await prisma.empresa.update({
      where: { id },
      data: { status },
    });
    res.json(empresa);
  } catch (err: unknown) {
    // Prisma P2025: record not found
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    ) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }
    throw err;
  }
});

// ============================================================
// POST /api/admin/empresas/:id/impersonate
// Retorna JWE de 15min para impersonar ADMIN_EMPRESA do tenant.
// SADMIN-04 — T-07-03: não refreshável; T-07-04: chave HKDF idêntica ao auth.ts
// ============================================================
router.post('/empresas/:id/impersonate', async (req, res) => {
  const { id } = req.params;

  // Buscar empresa
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  // Buscar primeiro ADMIN_EMPRESA da empresa
  const adminUser = await prisma.user.findFirst({
    where: { empresaId: id, role: 'ADMIN_EMPRESA' },
    orderBy: { createdAt: 'asc' },
  });

  if (!adminUser) {
    res.status(404).json({ error: 'Nenhum ADMIN_EMPRESA encontrado para esta empresa' });
    return;
  }

  // Derivar chave com mesma lógica do auth.ts
  // Em produção usa __Secure-authjs.session-token; em dev usa authjs.session-token
  const cookieName =
    process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token';

  const key = await deriveKey(cookieName);

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // EncryptJWT (JWE) — compatível com jwtDecrypt em auth.ts (T-07-04)
  const token = await new EncryptJWT({
    role: 'ADMIN_EMPRESA',
    empresaId: empresa.id,
    impersonatedBy: req.user!.id,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .setSubject(adminUser.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .encrypt(key);

  res.json({ token, expiresAt: expiresAt.toISOString() });
});

export default router;

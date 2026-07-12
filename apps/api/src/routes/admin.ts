import { Router, type Router as RouterType } from 'express';
import { prisma } from '@cargo-sentinel/database';
import bcrypt from 'bcryptjs';
import { EncryptJWT } from 'jose';
import { hkdf } from '@panva/hkdf';
import { getStatus, disconnect, zapiConfigFrom } from '../infra/zapi/zapi.service';

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
// GET /api/admin/empresas/:id
// Detalhe da empresa com contadores.
// SADMIN-EMPRESA-DETAIL
// ============================================================
router.get('/empresas/:id', async (req, res) => {
  const { id } = req.params;

  const empresa = await prisma.empresa.findUnique({
    where: { id },
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

  if (!empresa) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  res.json(empresa);
});

// ============================================================
// PATCH /api/admin/empresas/:id
// Edita nome/cnpj da empresa (genérico, separado de /status).
// SADMIN-EMPRESA-DETAIL
// ============================================================
router.patch('/empresas/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, cnpj } = req.body as { nome?: unknown; cnpj?: unknown };

  const data: { nome?: string; cnpj?: string } = {};

  if (nome !== undefined) {
    if (typeof nome !== 'string' || nome.trim().length < 2) {
      res.status(400).json({ error: 'nome deve ter pelo menos 2 caracteres' });
      return;
    }
    data.nome = nome.trim();
  }

  if (cnpj !== undefined) {
    if (typeof cnpj !== 'string' || cnpj.replace(/\D/g, '').length < 14) {
      res.status(400).json({ error: 'cnpj inválido (mínimo 14 dígitos)' });
      return;
    }
    data.cnpj = cnpj.replace(/\D/g, '');
  }

  try {
    const empresa = await prisma.empresa.update({ where: { id }, data });
    res.json(empresa);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      res.status(400).json({ error: 'CNPJ já cadastrado' });
      return;
    }
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

// ============================================================
// GET /api/admin/empresas/:id/usuarios
// Lista usuários da empresa.
// SADMIN-USUARIOS-CRUD
// ============================================================
router.get('/empresas/:id/usuarios', async (req, res) => {
  const { id } = req.params;

  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  const usuarios = await prisma.user.findMany({
    where: { empresaId: id },
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json(usuarios);
});

// ============================================================
// POST /api/admin/empresas/:id/usuarios
// Cria usuário ADMIN_EMPRESA ou OPERADOR para a empresa.
// SADMIN-USUARIOS-CRUD — nunca permite criar SUPER_ADMIN
// ============================================================
router.post('/empresas/:id/usuarios', async (req, res) => {
  const { id } = req.params;
  const { nome, email, senha, role } = req.body as {
    nome?: unknown;
    email?: unknown;
    senha?: unknown;
    role?: unknown;
  };

  if (typeof nome !== 'string' || nome.trim().length < 2) {
    res.status(400).json({ error: 'nome deve ter pelo menos 2 caracteres' });
    return;
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'email inválido' });
    return;
  }
  if (typeof senha !== 'string' || senha.length < 8) {
    res.status(400).json({ error: 'senha deve ter pelo menos 8 caracteres' });
    return;
  }
  if (role !== 'ADMIN_EMPRESA' && role !== 'OPERADOR') {
    res.status(400).json({ error: 'role deve ser ADMIN_EMPRESA ou OPERADOR' });
    return;
  }

  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(senha, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        nome: nome.trim(),
        role,
        empresaId: id,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        createdAt: true,
      },
    });
    res.status(201).json(user);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      res.status(409).json({ error: 'E-mail já cadastrado' });
      return;
    }
    throw err;
  }
});

// ============================================================
// PUT /api/admin/empresas/:id/usuarios/:usuarioId
// Edita nome/role/ativo de um usuário da empresa.
// SADMIN-USUARIOS-CRUD — nunca permite editar/rebaixar SUPER_ADMIN
// ============================================================
router.put('/empresas/:id/usuarios/:usuarioId', async (req, res) => {
  const { id, usuarioId } = req.params;
  const { nome, role, ativo } = req.body as {
    nome?: unknown;
    role?: unknown;
    ativo?: unknown;
  };

  const target = await prisma.user.findFirst({ where: { id: usuarioId, empresaId: id } });
  if (!target) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }
  if (target.role === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Não é permitido editar um SUPER_ADMIN' });
    return;
  }

  const data: { nome?: string; role?: 'ADMIN_EMPRESA' | 'OPERADOR'; ativo?: boolean } = {};

  if (nome !== undefined) {
    if (typeof nome !== 'string' || nome.trim().length < 2) {
      res.status(400).json({ error: 'nome deve ter pelo menos 2 caracteres' });
      return;
    }
    data.nome = nome.trim();
  }
  if (role !== undefined) {
    if (role !== 'ADMIN_EMPRESA' && role !== 'OPERADOR') {
      res.status(400).json({ error: 'role deve ser ADMIN_EMPRESA ou OPERADOR' });
      return;
    }
    data.role = role;
  }
  if (ativo !== undefined) {
    if (typeof ativo !== 'boolean') {
      res.status(400).json({ error: 'ativo deve ser boolean' });
      return;
    }
    data.ativo = ativo;
  }

  const user = await prisma.user.update({
    where: { id: usuarioId },
    data,
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      createdAt: true,
    },
  });

  res.json(user);
});

// ============================================================
// POST /api/admin/empresas/:id/usuarios/:usuarioId/resetar-senha
// Reseta a senha de um usuário da empresa.
// SADMIN-USUARIOS-CRUD
// ============================================================
router.post('/empresas/:id/usuarios/:usuarioId/resetar-senha', async (req, res) => {
  const { id, usuarioId } = req.params;
  const { senha } = req.body as { senha?: unknown };

  if (typeof senha !== 'string' || senha.length < 8) {
    res.status(400).json({ error: 'senha deve ter pelo menos 8 caracteres' });
    return;
  }

  const target = await prisma.user.findFirst({ where: { id: usuarioId, empresaId: id } });
  if (!target) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  const passwordHash = await bcrypt.hash(senha, 10);
  await prisma.user.update({ where: { id: usuarioId }, data: { passwordHash } });

  res.json({ success: true });
});

// ============================================================
// WhatsApp (Z-API) — provisionamento por empresa
// O SUPERADMIN cadastra/valida a instância Z-API (instanceId + token +
// clientToken) por empresa. O tenant nunca vê as credenciais brutas
// (ver apps/api/src/routes/configuracoes-whatsapp.ts).
// ============================================================

// GET /api/admin/empresas/:id/whatsapp
router.get('/empresas/:id/whatsapp', async (req, res) => {
  const { id } = req.params;

  const cfg = await prisma.configuracaoWhatsApp.findUnique({
    where: { empresaId: id },
    select: {
      zapiInstanceId: true,
      zapiToken: true,
      zapiClientToken: true,
      whatsappInstStatus: true,
      whatsappGrupoNome: true,
    },
  });

  if (!cfg?.zapiInstanceId) {
    return res.json({ vinculada: false });
  }

  return res.json({
    vinculada: true,
    instanceId: cfg.zapiInstanceId,
    tokenMask: cfg.zapiToken ? `${cfg.zapiToken.slice(0, 4)}…${cfg.zapiToken.slice(-4)}` : null,
    temClientToken: !!cfg.zapiClientToken,
    status: cfg.whatsappInstStatus,
    grupoNome: cfg.whatsappGrupoNome ?? null,
  });
});

// PUT /api/admin/empresas/:id/whatsapp
router.put('/empresas/:id/whatsapp', async (req, res) => {
  const { id } = req.params;
  const body = req.body as { instanceId?: unknown; token?: unknown; clientToken?: unknown };

  const instanceId = typeof body.instanceId === 'string' ? body.instanceId.trim() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const clientToken = typeof body.clientToken === 'string' && body.clientToken.trim() ? body.clientToken.trim() : null;

  if (!instanceId || !token) {
    res.status(400).json({ error: 'instanceId e token são obrigatórios' });
    return;
  }

  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  const zapi = zapiConfigFrom({ zapiInstanceId: instanceId, zapiToken: token, zapiClientToken: clientToken })!;

  let conectado = false;
  try {
    const status = await getStatus(zapi);
    conectado = status.connected;
  } catch (err) {
    res.status(400).json({
      error: `Credenciais inválidas ou instância inacessível na Z-API: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`,
    });
    return;
  }

  const novoStatus = conectado ? 'CONECTADO' : 'DESCONECTADO';

  await prisma.configuracaoWhatsApp.upsert({
    where: { empresaId: id },
    update: {
      zapiInstanceId: instanceId,
      zapiToken: token,
      zapiClientToken: clientToken,
      whatsappInstStatus: novoStatus,
      ...(conectado ? { ativo: true } : {}),
    },
    create: {
      empresaId: id,
      ativo: conectado,
      zapiInstanceId: instanceId,
      zapiToken: token,
      zapiClientToken: clientToken,
      whatsappInstStatus: novoStatus,
    },
  });

  res.json({ ok: true, status: novoStatus });
});

// POST /api/admin/empresas/:id/whatsapp/desconectar
router.post('/empresas/:id/whatsapp/desconectar', async (req, res) => {
  const { id } = req.params;

  const cfg = await prisma.configuracaoWhatsApp.findUnique({
    where: { empresaId: id },
    select: { zapiInstanceId: true, zapiToken: true, zapiClientToken: true },
  });

  const zapi = zapiConfigFrom(cfg);
  if (!zapi) {
    res.status(400).json({ error: 'Instância não vinculada.' });
    return;
  }

  await disconnect(zapi);
  await prisma.configuracaoWhatsApp.updateMany({
    where: { empresaId: id },
    data: { whatsappInstStatus: 'DESCONECTADO' },
  });

  res.json({ ok: true, status: 'DESCONECTADO' });
});

// DELETE /api/admin/empresas/:id/whatsapp
router.delete('/empresas/:id/whatsapp', async (req, res) => {
  const { id } = req.params;

  const cfg = await prisma.configuracaoWhatsApp.findUnique({
    where: { empresaId: id },
    select: { zapiInstanceId: true, zapiToken: true, zapiClientToken: true },
  });

  const zapi = zapiConfigFrom(cfg);
  if (zapi) await disconnect(zapi).catch(() => {});

  await prisma.configuracaoWhatsApp.updateMany({
    where: { empresaId: id },
    data: {
      zapiInstanceId: null,
      zapiToken: null,
      zapiClientToken: null,
      whatsappInstStatus: 'DESCONECTADO',
      whatsappGrupoJid: null,
      whatsappGrupoNome: null,
      ativo: false,
    },
  });

  res.json({ ok: true });
});

export default router;

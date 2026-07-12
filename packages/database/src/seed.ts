import bcryptjs from 'bcryptjs';
import { prisma } from './index';

async function main() {
  const hash = (pwd: string) => bcryptjs.hashSync(pwd, 12);

  // SUPER_ADMIN — empresaId NULL explícito (AUTH-02)
  await prisma.user.upsert({
    where: { email: 'superadmin@cargosentinel.com' },
    update: {},
    create: {
      email: 'superadmin@cargosentinel.com',
      passwordHash: hash('SuperAdmin123!'),
      nome: 'Super Admin',
      role: 'SUPER_ADMIN',
      empresaId: null,
    },
  });

  // Empresa demo (tenant)
  const empresa = await prisma.empresa.upsert({
    where: { cnpj: '00000000000191' },
    update: {},
    create: { nome: 'Construtora Demo', cnpj: '00000000000191', status: 'ATIVO' },
  });

  // Obra demo (sem unique composta no schema — findFirst+create idempotente)
  const obra =
    (await prisma.obra.findFirst({
      where: { empresaId: empresa.id, nome: 'Obra Centro' },
    })) ??
    (await prisma.obra.create({
      data: {
        nome: 'Obra Centro',
        endereco: 'Av. Paulista, 1000',
        empresaId: empresa.id,
        ativo: true,
      },
    }));

  // Camera demo with codigoLpr CAM001
  await prisma.camera.upsert({
    where: { codigoLpr: 'CAM001' },
    update: {},
    create: {
      codigoLpr: 'CAM001',
      nome: 'Câmera Entrada Principal',
      ip: '192.168.1.100',
      obraId: obra.id,
      empresaId: empresa.id,
      ativo: true,
    },
  });

  // ADMIN_EMPRESA do tenant demo
  await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      passwordHash: hash('Admin123!'),
      nome: 'Admin Demo',
      role: 'ADMIN_EMPRESA',
      empresaId: empresa.id,
    },
  });

  // OPERADOR do tenant demo
  await prisma.user.upsert({
    where: { email: 'operador@demo.com' },
    update: {},
    create: {
      email: 'operador@demo.com',
      passwordHash: hash('Operador123!'),
      nome: 'Operador Demo',
      role: 'OPERADOR',
      empresaId: empresa.id,
    },
  });


  console.log('Seed concluído!');
  console.log('  Super Admin: superadmin@cargosentinel.com / SuperAdmin123!');
  console.log('  Admin Demo: admin@demo.com / Admin123!');
  console.log('  Operador Demo: operador@demo.com / Operador123!');
  console.log('  Camera demo: codigoLpr = CAM001');

}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });

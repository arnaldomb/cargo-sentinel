import { describe, it, expect, vi } from 'vitest';
import { buildEmpresaRoom, emitToEmpresa, handleRealtimeConnection } from './server';

describe('realtime server helpers', () => {
  it('monta a room por tenant no formato empresa:{empresaId}', () => {
    expect(buildEmpresaRoom('emp1')).toBe('empresa:emp1');
  });

  it('entra o socket na room correta ao conectar', () => {
    const join = vi.fn();

    handleRealtimeConnection({
      data: {
        user: {
          id: 'user1',
          role: 'OPERADOR',
          empresaId: 'emp1',
        },
      },
      join,
    } as never);

    expect(join).toHaveBeenCalledWith('empresa:emp1');
  });

  it('emite apenas para a room do tenant informado', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    emitToEmpresa(
      { to },
      'emp1',
      'feed:evento-novo',
      { id: 'evt1' },
    );

    expect(to).toHaveBeenCalledWith('empresa:emp1');
    expect(emit).toHaveBeenCalledWith('feed:evento-novo', { id: 'evt1' });
  });

  it('emite feed:evento-novo com empresaId correto via emitToEmpresa', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    emitToEmpresa({ to }, 'emp-abc', 'feed:evento-novo', { id: 'evt42', placaNumero: 'XYZ9999' });

    expect(to).toHaveBeenCalledWith('empresa:emp-abc');
    expect(emit).toHaveBeenCalledWith('feed:evento-novo', { id: 'evt42', placaNumero: 'XYZ9999' });
  });

  it('emite feed:placa-classificada com empresaId correto via emitToEmpresa', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    emitToEmpresa({ to }, 'emp-abc', 'feed:placa-classificada', {
      placaId: 'pla1',
      classificacao: 'SUSPEITO',
    });

    expect(to).toHaveBeenCalledWith('empresa:emp-abc');
    expect(emit).toHaveBeenCalledWith('feed:placa-classificada', {
      placaId: 'pla1',
      classificacao: 'SUSPEITO',
    });
  });

  it('emite feed:camera-status com empresaId correto via emitToEmpresa', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    emitToEmpresa({ to }, 'emp-abc', 'feed:camera-status', {
      id: 'cam1',
      status: 'online',
    });

    expect(to).toHaveBeenCalledWith('empresa:emp-abc');
    expect(emit).toHaveBeenCalledWith('feed:camera-status', { id: 'cam1', status: 'online' });
  });

  it('não emite para rooms de outros tenants', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    emitToEmpresa({ to }, 'emp-1', 'feed:evento-novo', { id: 'evt1' });

    expect(to).not.toHaveBeenCalledWith('empresa:emp-2');
    expect(to).toHaveBeenCalledWith('empresa:emp-1');
  });
});

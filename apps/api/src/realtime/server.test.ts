import { describe, it, expect, vi } from 'vitest';
import { buildEmpresaRoom, emitToEmpresa, handleRealtimeConnection } from './server';
import type { CrossSiteAlertDTO } from './dto';

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

describe('emitAlertaCrossSite via emitToEmpresa', () => {
  it('emite feed:alerta-cross-site para a room empresa:{empresaId}', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    const payload: CrossSiteAlertDTO = {
      empresaId: 'emp-1',
      placaNumero: 'ABC1234',
      classificacao: 'SUSPEITO',
      obraDetectadaId: 'obra-b',
      obraDetectadaNome: 'Obra B',
      obraClassificacaoId: 'obra-a',
      obraClassificacaoNome: 'Obra A',
      eventoId: 'evt-1',
      timestamp: new Date().toISOString(),
    };

    emitToEmpresa({ to }, 'emp-1', 'feed:alerta-cross-site', payload);

    expect(to).toHaveBeenCalledWith('empresa:emp-1');
    expect(emit).toHaveBeenCalledWith('feed:alerta-cross-site', payload);
  });

  it('nunca emite para room de outra empresa ao disparar alerta cross-site', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });

    const payload: CrossSiteAlertDTO = {
      empresaId: 'emp-x',
      placaNumero: 'XYZ9999',
      classificacao: 'CRITICO',
      obraDetectadaId: 'obra-c',
      obraDetectadaNome: 'Obra C',
      obraClassificacaoId: 'obra-d',
      obraClassificacaoNome: 'Obra D',
      eventoId: 'evt-2',
      timestamp: '2026-06-21T10:00:00.000Z',
    };

    emitToEmpresa({ to }, 'emp-x', 'feed:alerta-cross-site', payload);

    expect(to).toHaveBeenCalledWith('empresa:emp-x');
    expect(to).not.toHaveBeenCalledWith('empresa:emp-y');
    expect(emit).toHaveBeenCalledWith('feed:alerta-cross-site', payload);
  });
});

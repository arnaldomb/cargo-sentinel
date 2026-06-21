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
});

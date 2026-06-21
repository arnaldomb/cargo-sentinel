import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CrossSiteAlertOverlay } from './cross-site-alert-overlay';
import type { CrossSiteAlertDTO } from './cross-site-alert-overlay';

const mockAlert: CrossSiteAlertDTO = {
  empresaId: 'emp-1',
  placaNumero: 'ABC1234',
  classificacao: 'SUSPEITO',
  obraDetectadaId: 'obra-b',
  obraDetectadaNome: 'Obra Beta',
  obraClassificacaoId: 'obra-a',
  obraClassificacaoNome: 'Obra Alpha',
  eventoId: 'evt-1',
  timestamp: new Date('2026-06-21T10:00:00Z').toISOString(),
};

describe('CrossSiteAlertOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders plate number and classification level', () => {
    const onDismiss = vi.fn();
    render(<CrossSiteAlertOverlay alert={mockAlert} onDismiss={onDismiss} />);
    expect(screen.getByText('ABC1234')).toBeDefined();
    expect(screen.getByText('SUSPEITO')).toBeDefined();
  });

  it('renders obra detected and obra classification names', () => {
    const onDismiss = vi.fn();
    render(<CrossSiteAlertOverlay alert={mockAlert} onDismiss={onDismiss} />);
    expect(screen.getByText('Obra Beta')).toBeDefined();
    expect(screen.getByText('Obra Alpha')).toBeDefined();
  });

  it('renders CRÍTICO label for critico classification', () => {
    const onDismiss = vi.fn();
    render(
      <CrossSiteAlertOverlay
        alert={{ ...mockAlert, classificacao: 'CRITICO' }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('CRÍTICO')).toBeDefined();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<CrossSiteAlertOverlay alert={mockAlert} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('dismiss-btn'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after 30 seconds', () => {
    const onDismiss = vi.fn();
    render(
      <CrossSiteAlertOverlay alert={mockAlert} onDismiss={onDismiss} countdownSeconds={30} />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('shows countdown decrementing', () => {
    const onDismiss = vi.fn();
    render(
      <CrossSiteAlertOverlay alert={mockAlert} onDismiss={onDismiss} countdownSeconds={10} />,
    );
    expect(screen.getByTestId('countdown').textContent).toBe('10s');
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('countdown').textContent).toBe('7s');
  });
});

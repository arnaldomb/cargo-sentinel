import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CriticalConfirmDialog } from './critical-confirm-dialog';

describe('CriticalConfirmDialog', () => {
  it('renderiza com placa e classificação corretas', () => {
    render(
      <CriticalConfirmDialog
        placaNumero="ABC1234"
        classificacao="SUSPEITO"
        classificacaoLabel="Suspeito"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId('critical-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/ABC1234/)).toBeInTheDocument();
    // "Suspeito" aparece em múltiplos nós — verificar pelo título do diálogo
    expect(screen.getByText(/Confirmar classificação Suspeito/i)).toBeInTheDocument();
  });

  it('chama onConfirm ao clicar em confirmar', async () => {
    const onConfirm = vi.fn();
    render(
      <CriticalConfirmDialog
        placaNumero="ABC1234"
        classificacao="CRITICO"
        classificacaoLabel="Crítico"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('chama onCancel ao clicar em cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <CriticalConfirmDialog
        placaNumero="ABC1234"
        classificacao="SUSPEITO"
        classificacaoLabel="Suspeito"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('chama onCancel ao pressionar Escape', async () => {
    const onCancel = vi.fn();
    render(
      <CriticalConfirmDialog
        placaNumero="ABC1234"
        classificacao="CRITICO"
        classificacaoLabel="Crítico"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('exibe aviso de impacto operacional', () => {
    render(
      <CriticalConfirmDialog
        placaNumero="XYZ9999"
        classificacao="SUSPEITO"
        classificacaoLabel="Suspeito"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Impacto operacional/i)).toBeInTheDocument();
  });

  it('exige confirmação para SUSPEITO e CRITICO — não dispara sem clique explícito', async () => {
    const onConfirm = vi.fn();
    render(
      <CriticalConfirmDialog
        placaNumero="ABC1234"
        classificacao="CRITICO"
        classificacaoLabel="Crítico"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    // Dialog is shown — confirm not yet called
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('critical-confirm-dialog')).toBeInTheDocument();
  });
});

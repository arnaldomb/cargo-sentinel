import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClassificationPopover } from './classification-popover';

describe('ClassificationPopover', () => {
  it('renderiza todas as 5 opções de classificação', () => {
    render(
      <ClassificationPopover current="VISITANTE" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('popover-option-LIBERADO')).toBeInTheDocument();
    expect(screen.getByTestId('popover-option-VISITANTE')).toBeInTheDocument();
    expect(screen.getByTestId('popover-option-ATENCAO')).toBeInTheDocument();
    expect(screen.getByTestId('popover-option-SUSPEITO')).toBeInTheDocument();
    expect(screen.getByTestId('popover-option-CRITICO')).toBeInTheDocument();
  });

  it('chama onSelect com a classificação clicada', async () => {
    const onSelect = vi.fn();
    render(
      <ClassificationPopover current="VISITANTE" onSelect={onSelect} onClose={vi.fn()} />,
    );

    await userEvent.click(screen.getByTestId('popover-option-SUSPEITO'));
    expect(onSelect).toHaveBeenCalledWith('SUSPEITO');
  });

  it('chama onClose ao pressionar Escape', async () => {
    const onClose = vi.fn();
    render(
      <ClassificationPopover current="VISITANTE" onSelect={vi.fn()} onClose={onClose} />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('destaca a opção atualmente selecionada', () => {
    render(
      <ClassificationPopover current="ATENCAO" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    const activeBtn = screen.getByTestId('popover-option-ATENCAO');
    expect(activeBtn).toHaveClass('bg-yellow-600');
  });
});

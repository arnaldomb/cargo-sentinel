import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassificationBadge } from './classification-badge';

describe('ClassificationBadge', () => {
  it('exibe o rótulo correto para LIBERADO', () => {
    render(<ClassificationBadge classificacao="LIBERADO" />);
    expect(screen.getByTestId('classification-badge')).toHaveTextContent('Liberado');
  });

  it('exibe o rótulo correto para CRITICO', () => {
    render(<ClassificationBadge classificacao="CRITICO" />);
    expect(screen.getByTestId('classification-badge')).toHaveTextContent('Crítico');
  });

  it('exibe o rótulo correto para SUSPEITO', () => {
    render(<ClassificationBadge classificacao="SUSPEITO" />);
    expect(screen.getByTestId('classification-badge')).toHaveTextContent('Suspeito');
  });

  it('aplica classe de fundo verde para LIBERADO', () => {
    render(<ClassificationBadge classificacao="LIBERADO" />);
    expect(screen.getByTestId('classification-badge')).toHaveClass('bg-green-600');
  });

  it('aplica classe de fundo laranja-escuro para SUSPEITO (spec UI-04: orange-600)', () => {
    render(<ClassificationBadge classificacao="SUSPEITO" />);
    expect(screen.getByTestId('classification-badge')).toHaveClass('bg-orange-600');
  });

  it('aplica classe de fundo vermelho para CRITICO', () => {
    render(<ClassificationBadge classificacao="CRITICO" />);
    expect(screen.getByTestId('classification-badge')).toHaveClass('bg-red-700');
  });
});

'use client';

import { useState } from 'react';
import { ReportForm } from '@/components/relatorios/report-form';
import { ReportList, type RelatorioItem } from '@/components/relatorios/report-list';

type RelatoriosClientProps = {
  initialItems: RelatorioItem[];
};

export function RelatoriosClient({ initialItems }: RelatoriosClientProps) {
  const [items, setItems] = useState<RelatorioItem[]>(initialItems);

  function handleReportRequested(relatorioId: string) {
    // Adiciona item PENDENTE imediatamente ao topo da lista sem reload
    const newItem: RelatorioItem = {
      id: relatorioId,
      formato: 'PDF', // será substituído pelo polling ou Socket.IO
      status: 'PENDENTE',
      filtros: {},
      expiresAt: null,
      erroMsg: null,
      criadoEm: new Date().toISOString(),
    };
    setItems((prev) => [newItem, ...prev]);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Novo Relatório</h2>
        <ReportForm onReportRequested={handleReportRequested} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Seus Relatórios</h2>
        <ReportList initialItems={items} />
      </section>
    </div>
  );
}

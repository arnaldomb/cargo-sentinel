'use client';

import { useEffect, useState } from 'react';
import { DeleteCameraButton } from './delete-camera-button';
import type { CameraStatusItem } from '@/lib/dashboard';

export function CamerasTableClient({ obraId }: { obraId: string }) {
  const [cameras, setCameras] = useState<CameraStatusItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/cameras-status-proxy', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: unknown) => {
        const items = (data as { items?: CameraStatusItem[] })?.items ?? [];
        setCameras(items.filter((c) => c.obra.id === obraId));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [obraId]);

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">Carregando câmeras...</div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-500">Nenhuma câmera cadastrada nesta obra.</p>
        <a
          href={`/gestao/obras/${obraId}/cameras/nova`}
          className="mt-4 inline-block rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Cadastrar Câmera
        </a>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <th className="px-4 py-3">Nome</th>
          <th className="px-4 py-3">Código LPR</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Último Sinal</th>
          <th className="px-4 py-3 text-right">Ações</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {cameras.map((camera) => (
          <tr key={camera.id} className="hover:bg-slate-50 transition-colors">
            <td className="px-4 py-3 font-medium text-slate-800">
              {camera.nome ?? <span className="italic text-slate-400">—</span>}
            </td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{camera.codigoLpr}</td>
            <td className="px-4 py-3">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                  camera.status === 'online' ? 'bg-green-600' : 'bg-slate-500'
                }`}
              >
                {camera.status}
              </span>
            </td>
            <td className="px-4 py-3 text-slate-500">
              {camera.ultimoEventoEm
                ? new Date(camera.ultimoEventoEm).toLocaleString('pt-BR')
                : 'nunca'}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                <a
                  href={`/gestao/obras/${obraId}/cameras/${camera.id}/editar`}
                  className="rounded px-2 py-1 text-xs font-medium text-ggtech-blue border border-ggtech-blue hover:bg-ggtech-blue hover:text-white transition-colors"
                >
                  Editar
                </a>
                <DeleteCameraButton
                  obraId={obraId}
                  cameraId={camera.id}
                  codigoLpr={camera.nome ?? camera.codigoLpr}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

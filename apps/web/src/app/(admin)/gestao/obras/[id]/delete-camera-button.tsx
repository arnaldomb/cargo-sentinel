'use client';

import { useRouter } from 'next/navigation';

export function DeleteCameraButton({
  obraId,
  cameraId,
  codigoLpr,
}: {
  obraId: string;
  cameraId: string;
  codigoLpr: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Desativar câmera ${codigoLpr}?`)) return;
    const res = await fetch(`/api/obras-proxy/${obraId}/cameras/${cameraId}`, {
      method: 'DELETE',
    });
    if (res.ok) router.refresh();
    else alert('Erro ao desativar câmera.');
  }

  return (
    <button onClick={handleDelete} className="text-sm text-red-600 hover:underline">
      Excluir
    </button>
  );
}

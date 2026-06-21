import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ClassificationBadge } from '@/components/classification-badge';
import { getClassificationColor, getClassificationLabel } from '@/lib/dashboard';
import PlacaHistoricoClient from './historico-client';

// params é async no Next.js 15
type Props = { params: Promise<{ numero: string }> };

type Classificacao = 'LIBERADO' | 'VISITANTE' | 'ATENCAO' | 'SUSPEITO' | 'CRITICO';

type EventoHistoricoItem = {
  id: string;
  timestamp: string;
  direcao: 'ENTRADA' | 'SAIDA' | null;
  classificacao: Classificacao;
  thumbnailUrl: string | null;
  obra: { id: string; nome: string };
  camera: { id: string; codigoLpr: string };
};

type HistoricoResponse = {
  placa: {
    numero: string;
    classificacao: Classificacao;
    empresaTransportadora: string | null;
    motorista: string | null;
    tipoVeiculo: string | null;
    observacao: string | null;
  };
  items: EventoHistoricoItem[];
  nextCursor: string | null;
};

type ClassificacaoAuditItem = {
  id: string;
  createdAt: string;
  classificacaoDe: string | null;
  classificacaoPara: string;
  observacao: string | null;
  usuario: { id: string; nome: string };
};

type ClassificacoesResponse = {
  items: ClassificacaoAuditItem[];
};

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

async function fetchPlacaHistorico(
  numero: string,
  cookieHeader: string,
): Promise<HistoricoResponse | null> {
  const res = await fetch(
    `${API_BASE}/api/placas/${encodeURIComponent(numero)}/historico?limit=20`,
    { headers: { Cookie: cookieHeader }, cache: 'no-store' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Erro ao carregar historico');
  return res.json() as Promise<HistoricoResponse>;
}

async function fetchPlacaClassificacoes(
  numero: string,
  cookieHeader: string,
): Promise<ClassificacoesResponse> {
  const res = await fetch(
    `${API_BASE}/api/placas/${encodeURIComponent(numero)}/classificacoes`,
    { headers: { Cookie: cookieHeader }, cache: 'no-store' },
  );
  if (!res.ok) return { items: [] };
  return res.json() as Promise<ClassificacoesResponse>;
}

export default async function PlacaProfilePage({ params }: Props) {
  const { numero } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [historico, classificacoes] = await Promise.all([
    fetchPlacaHistorico(numero, cookieHeader),
    fetchPlacaClassificacoes(numero, cookieHeader),
  ]);

  if (!historico) notFound();

  const { placa, items, nextCursor } = historico;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Cabecalho da placa */}
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl font-bold tracking-widest text-slate-900">
              {placa.numero}
            </h1>
            <ClassificationBadge classificacao={placa.classificacao} />
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
            {placa.empresaTransportadora && (
              <>
                <dt className="font-medium text-slate-500">Transportadora</dt>
                <dd>{placa.empresaTransportadora}</dd>
              </>
            )}
            {placa.motorista && (
              <>
                <dt className="font-medium text-slate-500">Motorista</dt>
                <dd>{placa.motorista}</dd>
              </>
            )}
            {placa.tipoVeiculo && (
              <>
                <dt className="font-medium text-slate-500">Tipo de veiculo</dt>
                <dd>{placa.tipoVeiculo}</dd>
              </>
            )}
            {placa.observacao && (
              <>
                <dt className="font-medium text-slate-500">Observacao</dt>
                <dd>{placa.observacao}</dd>
              </>
            )}
          </dl>
        </div>
      </section>

      {/* Timeline de deteccoes — Client Component para "Carregar mais" */}
      <section>
        <h2 className="font-heading mb-4 text-xl font-bold text-slate-900">
          Deteccoes
        </h2>
        <PlacaHistoricoClient
          placaNumero={placa.numero}
          initialItems={items}
          initialNextCursor={nextCursor}
        />
      </section>

      {/* Audit trail de classificacoes */}
      <section>
        <h2 className="font-heading mb-4 text-xl font-bold text-slate-900">
          Historico de Classificacoes
        </h2>
        {classificacoes.items.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma classificacao registrada.</p>
        ) : (
          <ol className="relative border-l border-slate-200">
            {classificacoes.items.map((entry) => (
              <li key={entry.id} className="mb-6 ml-6">
                <span
                  className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white"
                  style={{
                    backgroundColor: getClassificationColor(
                      entry.classificacaoPara as Classificacao,
                    ),
                  }}
                />
                <time className="mb-1 text-xs text-slate-400">
                  {new Date(entry.createdAt).toLocaleString('pt-BR')}
                </time>
                <p className="text-sm font-medium text-slate-800">
                  {entry.classificacaoDe
                    ? `${getClassificationLabel(entry.classificacaoDe as Classificacao)} → `
                    : 'Classificacao inicial: '}
                  {getClassificationLabel(entry.classificacaoPara as Classificacao)}
                </p>
                <p className="text-xs text-slate-500">
                  por {entry.usuario.nome}
                  {entry.observacao ? ` — "${entry.observacao}"` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

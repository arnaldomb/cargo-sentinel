export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f8fafc',
        color: '#0f172a',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: 12 }}>Página não encontrada</h1>
        <p style={{ color: '#475569' }}>O recurso solicitado não existe no Cargo Sentinel.</p>
      </div>
    </main>
  );
}

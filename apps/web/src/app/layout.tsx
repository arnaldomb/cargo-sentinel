import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cargo Sentinel',
  description: 'Plataforma de inteligência de perímetro logístico',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

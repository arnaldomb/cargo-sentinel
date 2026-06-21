import type { Metadata } from 'next';
import './globals.css';

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
      <body className="bg-gray-50 text-slate-900">{children}</body>
    </html>
  );
}

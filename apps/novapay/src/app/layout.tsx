import type { Metadata } from 'next';
import PersonaSwitcher from './components/PersonaSwitcher';
import LuminoLoader from './components/LuminoLoader';
import './globals.css';

export const metadata: Metadata = {
  title: 'NovaPay — Dashboard',
  description: 'NovaPay fintech dashboard — Lumino reference app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PersonaSwitcher />
        <LuminoLoader />
      </body>
    </html>
  );
}

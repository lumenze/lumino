import type { Metadata } from 'next';
import Sidebar from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lumino Dashboard',
  description: 'Walkthrough management, analytics, and settings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <main className="ml-[240px] min-h-screen animate-fade-in">{children}</main>
      </body>
    </html>
  );
}

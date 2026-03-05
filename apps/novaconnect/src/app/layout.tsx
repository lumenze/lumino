import type { Metadata } from 'next';
import PersonaSwitcher from './components/PersonaSwitcher';
import './globals.css';

export const metadata: Metadata = {
  title: 'NovaConnect — Operations',
  description: 'NovaConnect operations portal — Lumino reference app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PersonaSwitcher />
        <script
          src="/lumino/sdk/v1/lumino.js"
          data-lumino-app-id="novaconnect-ops"
          data-lumino-token-endpoint="/api/lumino-token"
          data-lumino-api-url="/lumino"
          data-lumino-environment="development"
          data-lumino-debug="true"
          data-lumino-role-storage-key="lumino_demo_role"
        />
      </body>
    </html>
  );
}

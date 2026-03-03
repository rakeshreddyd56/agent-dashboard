import type { Metadata } from 'next';
import { Space_Grotesk, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProjectLoader } from '@/components/layout/project-loader';
import { SSEProvider } from '@/components/layout/sse-provider';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "Luffy's HQ — Agent Command Center",
  description: "Luffy's HQ — Multi-agent coordination command center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>
          <ProjectLoader />
          <SSEProvider />
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col pl-60">
              <Header />
              <main className="flex-1 p-6">{children}</main>
            </div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}

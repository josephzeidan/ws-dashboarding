import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { LiveProvider } from '@/components/LiveProvider'
import TradeToaster from '@/components/TradeToaster'

export const metadata: Metadata = {
  title: 'TFSA Portfolio Intelligence',
  description: 'Local portfolio tracker for your Wealthsimple TFSA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LiveProvider>
          <Sidebar />
          <div className="main-content">
            {children}
          </div>
          <TradeToaster />
        </LiveProvider>
      </body>
    </html>
  )
}

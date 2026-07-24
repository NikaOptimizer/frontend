import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

type AppLayoutProps = {
  pageTitle: string
  children: ReactNode
  action?: ReactNode
  onHome?: () => void
}

export function AppLayout({ pageTitle, children, action, onHome }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <div className="app-background" aria-hidden="true" />
      <div className="app-overlay" aria-hidden="true" />

      <header className="app-navbar">
        <div className="app-nav-container">
          <button type="button" onClick={onHome} disabled={!onHome} className="app-brand">
            <span className="app-brand-mark">NO</span>
            <span>
              <span className="app-brand-title">Nika Optimizer</span>
              <span className="app-brand-subtitle">{pageTitle}</span>
            </span>
          </button>

          <div className="app-nav-actions">
            {onHome && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onHome}
                className="app-secondary-button"
              >
                Strategies
              </Button>
            )}
            {action}
          </div>
        </div>
      </header>

      <div className="app-content">{children}</div>
    </div>
  )
}

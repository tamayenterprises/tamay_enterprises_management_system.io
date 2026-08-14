import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isBrowserDomConflictError } from '@/lib/dom-errors'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
  isDomConflict: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', isDomConflict: false }

  static getDerivedStateFromError(error: Error): State {
    const isDomConflict = isBrowserDomConflictError(error)
    return {
      hasError: true,
      message: error.message || 'Something went wrong.',
      isDomConflict,
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info)
    // Password managers / translate often cause removeChild crashes during auth transitions.
    // Hard-reload to a safe page instead of stranding the user on an error card.
    if (isBrowserDomConflictError(error)) {
      const path = window.location.pathname
      const onAuthFlow = /sign-up|sign-in|client\/sign-up|forgot-password|reset-password/i.test(path)
      window.setTimeout(() => {
        window.location.replace(onAuthFlow ? '/sign-in?registered=1' : window.location.pathname)
      }, 50)
    }
  }

  private handleReload = () => {
    const onAuthFlow = /sign-up|sign-in|client\/sign-up|forgot-password|reset-password/i.test(
      window.location.pathname,
    )
    window.location.assign(onAuthFlow ? '/sign-in' : '/dashboard')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.state.isDomConflict) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Almost done</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your browser interrupted the page (often the password save prompt). Taking you to
                sign in…
              </p>
              <Button onClick={this.handleReload}>Continue to sign in</Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Unexpected error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The app hit an unexpected problem. You can return to the dashboard and try again.
            </p>
            {this.state.message ? (
              <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {this.state.message}
              </p>
            ) : null}
            <Button onClick={this.handleReload}>Back to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }
}

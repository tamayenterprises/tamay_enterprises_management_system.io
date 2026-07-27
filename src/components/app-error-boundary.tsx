import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Something went wrong.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info)
  }

  private handleReload = () => {
    window.location.assign('/dashboard')
  }

  render() {
    if (!this.state.hasError) return this.props.children

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

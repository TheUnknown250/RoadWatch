import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Last line of defence: a render crash shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error.message, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Something went wrong</h1>
        <p className="text-ink-soft">The page hit an unexpected problem. Your saved reports on this device are safe.</p>
        <button type="button" onClick={() => window.location.reload()} className="min-h-12 rounded-full bg-ink px-6 font-semibold text-white">Reload the app</button>
      </div>
    )
  }
}

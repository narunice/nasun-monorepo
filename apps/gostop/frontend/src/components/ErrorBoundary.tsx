/**
 * Tiny error boundary used to isolate non-critical UI (celebrations) from
 * the rest of the page. A celebration render error must not blank out the
 * game in progress.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional fallback. Defaults to null (silent). */
  fallback?: ReactNode
  /** Optional label for diagnostics. */
  label?: string
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.label ?? 'ErrorBoundary'
    console.warn(`[${label}] caught error`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}

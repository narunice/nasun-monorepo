/**
 * Structured Logging Utility
 *
 * CloudWatch Logs Insights를 위한 구조화된 JSON 로깅
 */

export interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

export function logInfo(event: string, context?: LogContext): void {
  console.log(JSON.stringify({
    level: 'INFO',
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

export function logError(event: string, error: Error, context?: LogContext): void {
  console.error(JSON.stringify({
    level: 'ERROR',
    event,
    error: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

export function logWarn(event: string, message: string, context?: LogContext): void {
  console.warn(JSON.stringify({
    level: 'WARN',
    event,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

export function logDebug(event: string, context?: LogContext): void {
  if (process.env.LOG_LEVEL === 'DEBUG') {
    console.log(JSON.stringify({
      level: 'DEBUG',
      event,
      ...context,
      timestamp: new Date().toISOString(),
    }));
  }
}

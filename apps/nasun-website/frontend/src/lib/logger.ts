/**
 * A logger that only logs in development mode.
 * In production, it does nothing for `log` and `warn`.
 * For `error`, it could be configured to send reports to a service like Sentry.
 */
const logger = {
  log: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.debug(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.info(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    // In production, you could integrate with a reporting service like Sentry, Datadog, etc.
    // For example: if (import.meta.env.PROD) { Sentry.captureException(args); }
    if (import.meta.env.DEV) {
      console.error(...args);
    }
  },
};

export default logger;

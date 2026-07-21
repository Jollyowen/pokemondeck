export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

/**
 * Central error-reporting hook. Every server-side error report in the app
 * should go through this function rather than calling console.error
 * directly, so that wiring in a real error-monitoring provider (Sentry,
 * etc.) later is a one-line change here instead of a search-and-replace
 * across the codebase.
 *
 * Deliberately takes structured context rather than a free-form object, to
 * keep the existing discipline of never logging owner cookies, secrets, or
 * full deck/card contents — callers should only ever pass identifiers
 * (deck IDs, provider names, error codes), not raw user data.
 */
export function reportError(message: string, error: unknown, context?: ErrorContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error(message, { ...context, error: errorMessage, stack: errorStack });
}

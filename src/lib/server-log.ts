export function developmentLog(message: string): void {
  if (process.env.NODE_ENV === "development") console.info(message);
}

export function developmentError(scope: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") console.error(`[${scope}]`, error);
}

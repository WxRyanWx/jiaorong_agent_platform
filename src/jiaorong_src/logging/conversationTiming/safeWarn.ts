function safeWarn(message: string, error?: unknown): void {
  try {
    console.warn(message, error)
  } catch {
    // ignore
  }
}

export { safeWarn }

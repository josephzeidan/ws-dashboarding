// Error taxonomy for the unofficial Wealthsimple API client.
// Every WS call must surface one of these so callers can degrade gracefully
// (CSV fallback / re-auth prompt) instead of crashing.

export class WsApiError extends Error {
  response?: unknown
  constructor(message: string, response?: unknown) {
    super(message)
    this.name = 'WsApiError'
    this.response = response
  }
}

/** Login needs a 2FA code — the connect UI should reveal the TOTP field. */
export class WsOtpRequiredError extends WsApiError {
  constructor() {
    super('2FA code required')
    this.name = 'WsOtpRequiredError'
  }
}

/** Wrong credentials / rejected login. */
export class WsLoginFailedError extends WsApiError {
  constructor(message: string, response?: unknown) {
    super(message, response)
    this.name = 'WsLoginFailedError'
  }
}

/** Access token dead and refresh failed — user must reconnect. */
export class WsAuthExpiredError extends WsApiError {
  constructor(message = 'Wealthsimple session expired — reconnect required') {
    super(message)
    this.name = 'WsAuthExpiredError'
  }
}

/** 429 — back off, only surface after repeated hits. */
export class WsRateLimitError extends WsApiError {
  constructor() {
    super('Wealthsimple rate limit hit')
    this.name = 'WsRateLimitError'
  }
}

/** Response shape didn't match expectations — WS changed their API. */
export class WsSchemaError extends WsApiError {
  constructor(message: string, response?: unknown) {
    super(message, response)
    this.name = 'WsSchemaError'
  }
}

/** Transient network failure — retry next tick, don't alarm anyone. */
export class WsNetworkError extends WsApiError {
  constructor(message: string) {
    super(message)
    this.name = 'WsNetworkError'
  }
}

declare module 'ws' {
  export type WsEventName = 'open' | 'error' | 'close' | 'message'

  export interface WsClientOptions {
    headers?: Record<string, string>
  }

  export default class WebSocket {
    constructor(url: string, options?: WsClientOptions)
    on(event: 'open', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this
    on(event: 'message', listener: (data: unknown) => void): this
    send(data: string): void
    close(code?: number): void
  }

  export { WebSocket }
}

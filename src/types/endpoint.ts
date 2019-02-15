export type RequestHandler<Request, Reply> = (packet: Request) => Promise<Reply>

/**
 * Connect a pipeline of pipes together and return a new pipe that is the combination of the provided pipes.
 *
 * @param pipes an ordered collection of pipes to connect together
 */
export function pipeline<Request, Reply> (...pipes: Pipe<Request, Reply>[]): Pipe<Request, Reply> {
  for (let i = 0; i + 1 < pipes.length; i++) {
    connect(pipes[i].outgoing, pipes[i + 1].incoming)
  }
  return {
    incoming: pipes[0].incoming,
    outgoing: pipes[pipes.length - 1].outgoing
  }

}

/**
 * Connect two endpoints together so they pass requests between one another
 *
 * Example: Two components that expose the `Endpoint` interface, an HTTP codec and a controller
 *
 * |------------|        |------------|
 * |            |---IN-->|            |
 * | HTTP Codec |        | Controller |
 * |            |<--OUT--|            |
 * |------------|        |------------|
 *
 * IlpPrepare packets are de-serialised by the codec and passed to the controller which returns a Promise
 * that eventually resolves to a reply (IlpFulfill or IlpReject) which the codec serializes and sends to the
 * original requestor.
 *
 * Similarly, IlpPrepare packets may be sent out by the controller to the HTTP codec which serializes them
 * and sends them out. In parallel it returns a Promise to the controller. When the codec receives a reply
 * it de-serializes it and resolves the Promise with the result.
 *
 * @param endpoint1 An endpoint interface
 * @param endpoint2 An endpoint interface
 */
export function connect<Request, Reply> (endpoint1: Endpoint<Request, Reply>, endpoint2: Endpoint<Request, Reply>): void {
  endpoint2.handler = endpoint1.request
  endpoint1.handler = endpoint2.request
}

/**
 * A component that has both an incoming and an outgoing Endpoint interface.
 *
 * Multiple pipes can be connected to form a pipeline.
 */
export interface Pipe<Request, Reply> {
  incoming: Endpoint<Request, Reply>
  outgoing: Endpoint<Request, Reply>
}

/**
 * A standardized interface for sending and receiving ILP packets.
 *
 * A component that interfaces with an endpoint must set `endpoint.handler` to a handler for incoming requests
 * (IlpPrepare packets) and call `endpoint.request` to send outgoing requests.
 */
export interface Endpoint<Request, Reply> {

  /**
   * A handler(s) for incoming requests.
   */
  handler: RequestHandler<Request, Reply>

  /**
   * Send a Request and wait for the Reply.
   *
   * @param request request payload to send
   * @param sentCallback Callback invoked by the underlying stream when the message has been sent
   */
  request: (request: Request, sentCallback?: () => void) => Promise<Reply>

  /**
   * EventEmitter interface methods for `error` events
   */
  addListener (event: 'error', listener: (err: Error) => void): this
  emit (event: 'error', err: Error): boolean
  on (event: 'error', listener: (err: Error) => void): this
  once (event: 'error', listener: (err: Error) => void): this
  prependListener (event: 'error', listener: (err: Error) => void): this
  prependOnceListener (event: 'error', listener: (err: Error) => void): this
  removeListener (event: 'error', listener: (err: Error) => void): this

}

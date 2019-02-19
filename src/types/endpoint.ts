export type RequestHandler<Request, Reply> = (packet: Request, sentCallback?: () => void) => Promise<Reply>

/**
 * Connect a pipeline of pipes together and return a new pipe that is the combination of the provided pipes.
 *
 * @param duplexes an ordered collection of pipes to connect together
 */
export function pipeline<Request, Reply> (...duplexes: Duplex<Request, Reply>[]): Duplex<Request, Reply> {
  for (let i = 0; i + 1 < duplexes.length; i++) {
    connect(duplexes[i].outgoing, duplexes[i + 1].incoming)
  }
  return {
    incoming: duplexes[0].incoming,
    outgoing: duplexes[duplexes.length - 1].outgoing
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
 * Requests are de-serialised by the codec and passed to the controller which returns a Promise
 * that eventually resolves to a reply which the codec serializes and sends to the
 * original requestor.
 *
 * Similarly, requests may be sent out by the controller to the HTTP codec which serializes them
 * and sends them out. In parallel it returns a Promise to the controller. When the codec receives a reply
 * it de-serializes it and resolves the Promise with the result.
 *
 * @param endpoint1 An endpoint interface
 * @param endpoint2 An endpoint interface
 */
export function connect<Request, Reply> (endpoint1: Endpoint<Request, Reply>, endpoint2: Endpoint<Request, Reply>): void {
  endpoint1.handler = endpoint2.request
  endpoint2.handler = endpoint1.request
}

/**
 * A component that has both an incoming and an outgoing Endpoint interface.
 *
 * Multiple pipes can be connected to form a pipeline.
 */
export interface Duplex<Request, Reply> {
  incoming: Endpoint<Request, Reply>
  outgoing: Endpoint<Request, Reply>
}

/**
 * A standardized interface for sending and receiving requests.
 *
 * A component that interfaces with an endpoint must set `endpoint.handler` to a handler for incoming requests
 * and call `endpoint.request` to send outgoing requests.
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
   * @param sentCallback Callback invoked by the underlying transport when the message has been sent
   */
  request: (request: Request, sentCallback?: () => void) => Promise<Reply>

}

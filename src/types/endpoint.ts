import { RequestHandler } from './request-stream'

export type ErrorHandler<Request, Reply> = (error: Error, request?: Request) => Promise<Reply | void>

/**
 * A standardized interface for sending and receiving requests.
 *
 * The interface inherits a lot from `net.Socket` for its life-cycle management.
 *
 * Before calling `sendOutgoingRequest` an endpoint should be connected by calling `connect()`.
 * Connecting is an asynchronous operation. The 'connect' event indicates that it has completed.
 */
export interface Endpoint<Request, Reply> {

  /**
   * Send a Request and wait for the Reply.
   *
   * @param request request payload to send
   * @param sentCallback Callback invoked by the underlying transport when the message has been sent
   */
  sendOutgoingRequest: (request: Request, sentCallback?: () => void) => Promise<Reply>

  /**
   * Set a handler(s) for incoming requests.
   */
  setIncomingRequestHandler: (handler: RequestHandler<Request, Reply>) => this

}

export function isEndpoint<Request, Response> (object: any): object is Endpoint<Request, Response> {
  return typeof object.sendOutgoingRequest === 'function'
    && typeof object.setIncomingRequestHandler === 'function'
}

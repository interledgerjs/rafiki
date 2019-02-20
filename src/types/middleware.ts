import { Endpoint, Duplex, RequestHandler } from './endpoint'
import { IlpPrepare, IlpReply } from 'ilp-packet'

export type IlpRequestHandler = RequestHandler<IlpPrepare, IlpReply>
export type MiddlewareRequestHandler = (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => Promise<IlpReply>

/**
 * An implementation of a `Duplex<IlpPrepare, IlpReply>` that, by default, passes incoming requests to the handler on the
 * outgoing interface and outgoing requests to the handler on the incoming interface.
 *
 * Custom processing logic can be provided in the constructor or by overriding `_processIncoming` and/or `_processOutgoing`.
 *
 * The flow is as follows:
 *   - If a caller calls `duplex.incoming.request(prepare)` they are returned the result of `duplex._processIncoming.(prepare, duplex.outgoing.handler)`
 *   - If a caller calls `duplex.outgoing.request(prepare)` they are returned the result of `duplex._processOutgoing.(prepare, duplex.incoming.handler)`
 *
 * Callers should never invoke `duplex.incoming.handler` or `duplex.outgoing.handler` directly.
 *
 * Instead multiple `Duplex<IlpPrepare, IlpReply>` instances can be connected together to form a pipeline using `pipeline(...duplexes: Duplex<Request, Reply>[])`
 * and a handler can be attached to the end of either pipeline using `setPipelineHandler(pipeline: 'incoming' | 'outgoing', duplex: Duplex<IlpPrepare, IlpReply>, handler: IlpRequestHandler)`
 *
 */
export class Middleware implements Duplex<IlpPrepare, IlpReply> {

  public incoming: Endpoint<IlpPrepare, IlpReply>
  public outgoing: Endpoint<IlpPrepare, IlpReply>

  constructor (options?: {processIncoming?: MiddlewareRequestHandler, processOutgoing?: MiddlewareRequestHandler}) {

    if (options && options.processIncoming) {
      this._processIncoming = options.processIncoming
    }
    if (options && options.processOutgoing) {
      this._processOutgoing = options.processOutgoing
    }
    this.incoming = {
      request: (request: IlpPrepare, sentCallback?: () => void): Promise<IlpReply> => {
        return this._processIncoming(request, this.outgoing.handler, sentCallback)
      },
      handler: () => {
        throw new Error('handler not set')
      }
    }
    this.outgoing = {
      request: (request: IlpPrepare, sentCallback?: () => void): Promise<IlpReply> => {
        return this._processIncoming(request, this.incoming.handler, sentCallback)
      },
      handler: () => {
        throw new Error('handler not set')
      }
    }
  }

  protected _processIncoming: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => {
    return next(request, sentCallback)
  }

  protected _processOutgoing: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => {
    return next(request, sentCallback)
  }
}

/**
 * Sets the handler at the end of either the incoming or outgoing pipelines on a `Duplex<IlpPrepare, IlpReply>` and returns the entry-point to that pipeline.
 *
 * @param pipeline `incoming` or `outgoing` to indicate which pipeline to attach the handler to
 * @param duplex the duplex pipelines to attach to
 * @param handler the handler to attach
 */
export function setPipelineHandler (pipeline: 'incoming' | 'outgoing', duplex: Duplex<IlpPrepare, IlpReply>, handler: IlpRequestHandler): IlpRequestHandler {
  if (pipeline === 'incoming') {
    duplex.outgoing.handler = handler
    return duplex.incoming.request
  } else {
    duplex.incoming.handler = handler
    return duplex.outgoing.request
  }
}

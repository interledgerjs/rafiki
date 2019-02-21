import { Duplex, RequestHandler, Channel } from './channel'
import { IlpPrepare, IlpReply } from 'ilp-packet'

export type IlpRequestHandler = RequestHandler<IlpPrepare, IlpReply>
export type MiddlewareRequestHandler = (request: IlpPrepare, next: IlpRequestHandler) => Promise<IlpReply>

export interface MiddlewareFunctions {
  startup?: () => Promise<void>
  shutdown?: () => Promise<void>
  processIncoming?: MiddlewareRequestHandler
  processOutgoing?: MiddlewareRequestHandler
}

export class Middleware implements Duplex<IlpPrepare, IlpReply> {

  private _incomingReader: IlpRequestHandler = () => {
    throw new Error('handler not set')
  }

  private _outgoingReader: IlpRequestHandler = () => {
    throw new Error('handler not set')
  }

  constructor ({ startup, shutdown, processIncoming, processOutgoing }: MiddlewareFunctions) {
    if (startup) {
      this._startup = startup
    }
    if (shutdown) {
      this._shutdown = shutdown
    }
    if (processIncoming) {
      this._processIncoming = processIncoming
    }
    if (processOutgoing) {
      this._processOutgoing = processOutgoing
    }
  }

  protected _startup: () => Promise<void> = async () => {
    return
  }

  protected _shutdown: () => Promise<void> = async () => {
    return
  }

  protected _processIncoming: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => {
    return next(request)
  }

  protected _processOutgoing: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => {
    return next(request)
  }

  public async startup (): Promise<void> {
    return this._startup()
  }

  public async shutdown (): Promise<void> {
    return this._shutdown()
  }

  public incoming: Channel<IlpPrepare, IlpReply> = {
    write: (request: IlpPrepare): Promise<IlpReply> => {
      return this._processIncoming(request, this._incomingReader)
    },
    setReader: (reader: IlpRequestHandler) => {
      this._incomingReader = reader
      return this.incoming
    }
  }

  public outgoing: Channel<IlpPrepare, IlpReply> = {
    write: (request: IlpPrepare): Promise<IlpReply> => {
      return this._processOutgoing(request, this._outgoingReader)
    },
    setReader: (reader: IlpRequestHandler) => {
      this._outgoingReader = reader
      return this.outgoing
    }
  }
}

/**
 * Sets the reader at the end of either the incoming or outgoing pipelines on a `Duplex<IlpPrepare, IlpReply>` and returns the entry-point to that pipeline (write function).
 *
 * @param pipeline `incoming` or `outgoing` to indicate which pipeline to attach the handler to
 * @param duplex the duplex pipelines to attach to
 * @param reader the handler to attach
 */
export function setPipelineReader (pipeline: 'incoming' | 'outgoing', duplex: Duplex<IlpPrepare, IlpReply>, reader: IlpRequestHandler): IlpRequestHandler {
  duplex[pipeline].setReader(reader)
  return (request) => { return duplex[pipeline].write(request) }
}

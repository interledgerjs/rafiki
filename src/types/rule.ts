import { BidirectionalDuplexRequestStream, RequestHandler, DuplexRequestStream, WritableRequestStream } from './request-stream'
import { IlpPrepare, IlpReply } from 'ilp-packet'

export type IlpRequestHandler = RequestHandler<IlpPrepare, IlpReply>
export type RuleRequestHandler = (request: IlpPrepare, next: IlpRequestHandler) => Promise<IlpReply>

export interface RuleFunctions {
  startup?: () => Promise<void>
  shutdown?: () => Promise<void>
  processIncoming?: RuleRequestHandler
  processOutgoing?: RuleRequestHandler
}

const deadEndWritable: WritableRequestStream<IlpPrepare, IlpReply> = {
  write (): Promise<IlpReply> {
    throw new Error('handler not set')
  }
}

export class Rule implements BidirectionalDuplexRequestStream<IlpPrepare, IlpReply> {

  private _incomingWritable: WritableRequestStream<IlpPrepare, IlpReply> = deadEndWritable
  private _outgoingWritable: WritableRequestStream<IlpPrepare, IlpReply> = deadEndWritable

  constructor ({ startup, shutdown, processIncoming, processOutgoing }: RuleFunctions) {
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

  protected _processIncoming: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => {
    return next(request)
  }

  protected _processOutgoing: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler, sentCallback?: () => void) => {
    return next(request)
  }

  public async startup (): Promise<void> {
    return this._startup()
  }

  public async shutdown (): Promise<void> {
    return this._shutdown()
  }

  public incoming: DuplexRequestStream<IlpPrepare, IlpReply> = {
    write: (request: IlpPrepare): Promise<IlpReply> => {
      return this._processIncoming(request, (nextRequest: IlpPrepare) => {
        return this._incomingWritable.write(nextRequest)
      })
    },
    pipe: (writable: WritableRequestStream<IlpPrepare, IlpReply>) => {
      this._incomingWritable = writable
      return this.incoming
    },
    unpipe: () => {
      this._incomingWritable = deadEndWritable
      return this.incoming
    }
  }

  public outgoing: DuplexRequestStream<IlpPrepare, IlpReply> = {
    write: (request: IlpPrepare): Promise<IlpReply> => {
      return this._processOutgoing(request, (nextRequest: IlpPrepare) => {
        return this._outgoingWritable.write(nextRequest)
      })
    },
    pipe: (writable: WritableRequestStream<IlpPrepare, IlpReply>) => {
      this._outgoingWritable = writable
      return this.outgoing
    },
    unpipe: () => {
      this._outgoingWritable = deadEndWritable
      return this.outgoing
    }
  }
}

/**
 * Sets the handler at the end of either the incoming or outgoing pipelines on a `BidirectionalDuplexRequestStream<IlpPrepare, IlpReply>` and returns the entry-point to that pipeline (write function).
 *
 * @param pipeline `incoming` or `outgoing` to indicate which pipeline to attach the handler to
 * @param bidirectionalPipeline the bidirectional pipelines to attach to
 * @param write the handler that accepts the writes at the end of the pipeline
 */
export function setPipelineReader (pipeline: 'incoming' | 'outgoing', bidirectionalPipeline: BidirectionalDuplexRequestStream<IlpPrepare, IlpReply>, write: IlpRequestHandler): IlpRequestHandler {
  bidirectionalPipeline[pipeline].pipe({ write })
  return (request) => { return bidirectionalPipeline[pipeline].write(request) }
}

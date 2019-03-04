export type RequestHandler<Request, Reply> = (request: Request) => Promise<Reply>

/**
 * Connect a pipeline of channels together and return a new channel that is the combination of the provided channels.
 *
 * @param duplexes an ordered collection of channels to connect together
 */
export function pipeline<Request, Reply> (...duplexes: BidirectionalDuplexRequestStream<Request, Reply>[]): BidirectionalDuplexRequestStream<Request, Reply> {
  for (let i = 0; i + 1 < duplexes.length; i++) {
    const incomingReadable = duplexes[i].incoming
    const incomingWritable = duplexes[i + 1].incoming
    const outgoingReadable = duplexes[i + 1].outgoing
    const outgoingWritable = duplexes[i].outgoing
    incomingReadable.pipe(incomingWritable)
    outgoingReadable.pipe(outgoingWritable)
  }
  return {
    incoming: {
      write: (request) => {
        return duplexes[0].incoming.write(request)
      },
      pipe: (writable: WritableRequestStream<Request, Reply>) => {
        return duplexes[duplexes.length - 1].incoming.pipe(writable)
      },
      unpipe: () => {
        return duplexes[duplexes.length - 1].incoming.unpipe()
      }
    },
    outgoing: {
      write: (request) => {
        return duplexes[duplexes.length - 1].outgoing.write(request)
      },
      pipe: (writable: WritableRequestStream<Request, Reply>) => {
        return duplexes[0].outgoing.pipe(writable)
      },
      unpipe: () => {
        return duplexes[0].outgoing.unpipe()
      }
    }
  }
}

/**
 * A component that has both an incoming and an outgoing Endpoint interface.
 *
 * Multiple pipes can be connected to form a pipeline.
 */
export interface BidirectionalDuplexRequestStream<Request, Reply> {
  incoming: DuplexRequestStream<Request, Reply>
  outgoing: DuplexRequestStream<Request, Reply>
}

export type DuplexRequestStream<Request,Reply> = ReadableRequestStream<Request, Reply> & WritableRequestStream<Request, Reply>

export interface WritableRequestStream<Request, Reply> {
  write: RequestHandler<Request, Reply>
}

export interface ReadableRequestStream<Request, Reply> {
  pipe: (writable: WritableRequestStream<Request, Reply>) => this

  unpipe: () => this
}

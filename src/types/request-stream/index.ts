/**
 * This module defines interfaces modelled on Node's native stream interfaces but for
 * request/response pairs.
 *
 * The difference is therefor that when writing to a `WritableRequestStream` the writer is returned
 * a Promise that will resolve to a reply.
 *
 * The current version of the interface assumes that implementations are not buffering so functions such as
 * `pause` and `resume` and properties such as `readable`, `writable` etc. are not defined.
 */

 /**
  * A request handler takes a request and asynchronously returns a reply.
  */
export type RequestHandler<Request, Reply> = (request: Request) => Promise<Reply>

/**
 * Connect a pipeline of bidirectional duplex streams together.
 *
 * Returns a new bidirectional duplex that is the combination of the provided bidirectional duplexes.
 *
 * @param bidirectionalDuplexes an ordered collection of bidirectional duplexes to connect together
 */
export function pipeline<Request, Reply> (...bidirectionalDuplexes: BidirectionalDuplexRequestStream<Request, Reply>[]): BidirectionalDuplexRequestStream<Request, Reply> {
  for (let i = 0; i + 1 < bidirectionalDuplexes.length; i++) {
    const incomingReadable = bidirectionalDuplexes[i].incoming
    const incomingWritable = bidirectionalDuplexes[i + 1].incoming
    const outgoingReadable = bidirectionalDuplexes[i + 1].outgoing
    const outgoingWritable = bidirectionalDuplexes[i].outgoing
    incomingReadable.pipe(incomingWritable)
    outgoingReadable.pipe(outgoingWritable)
  }
  return {
    incoming: {
      write: (request) => {
        return bidirectionalDuplexes[0].incoming.write(request)
      },
      pipe: (writable: WritableRequestStream<Request, Reply>) => {
        return bidirectionalDuplexes[bidirectionalDuplexes.length - 1].incoming.pipe(writable)
      },
      unpipe: () => {
        return bidirectionalDuplexes[bidirectionalDuplexes.length - 1].incoming.unpipe()
      }
    },
    outgoing: {
      write: (request) => {
        return bidirectionalDuplexes[bidirectionalDuplexes.length - 1].outgoing.write(request)
      },
      pipe: (writable: WritableRequestStream<Request, Reply>) => {
        return bidirectionalDuplexes[0].outgoing.pipe(writable)
      },
      unpipe: () => {
        return bidirectionalDuplexes[0].outgoing.unpipe()
      }
    }
  }
}

/**
 * A component that has both incoming and an outgoing duplex request streams.
 */
export interface BidirectionalDuplexRequestStream<Request, Reply> {
  incoming: DuplexRequestStream<Request, Reply>
  outgoing: DuplexRequestStream<Request, Reply>
}

/**
 * A readable stream of requests.
 *
 * This is equivalent to a native readable that is always in `readable.readableFlowing === true` state.
 * i.e. There is no buffering and the only way to read is to pipe the output to a writable.
 */
export interface ReadableRequestStream<Request, Reply> {
  pipe: (writable: WritableRequestStream<Request, Reply>) => this

  unpipe: () => this
}

/**
 * A writable stream of requests.
 */
export interface WritableRequestStream<Request, Reply> {
  write: RequestHandler<Request, Reply>
}

/**
 * A duplex stream of requests (implements both the readable and writeable interfaces)
 */
export type DuplexRequestStream<Request,Reply> = ReadableRequestStream<Request, Reply> & WritableRequestStream<Request, Reply>

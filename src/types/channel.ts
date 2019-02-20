export type RequestHandler<Request, Reply> = (packet: Request) => Promise<Reply>

/**
 * Connect a pipeline of channels together and return a new channel that is the combination of the provided channels.
 *
 * @param duplexes an ordered collection of channels to connect together
 */
export function pipeline<Request, Reply> (...duplexes: Duplex<Request, Reply>[]): Duplex<Request, Reply> {
  for (let i = 0; i + 1 < duplexes.length; i++) {
    duplexes[i].incoming.setReader((request) => { return duplexes[i + 1].incoming.write(request) })
    duplexes[i + 1].outgoing.setReader((request) => { return duplexes[i].outgoing.write(request) })
  }
  return {
    incoming: {
      write: (request) => {
        return duplexes[0].incoming.write(request)
      },
      setReader: (receiver: RequestHandler<Request, Reply>) => {
        return duplexes[duplexes.length - 1].incoming.setReader(receiver)
      }
    },
    outgoing: {
      write: (request) => {
        return duplexes[duplexes.length - 1].outgoing.write(request)
      },
      setReader: (receiver: RequestHandler<Request, Reply>) => {
        return duplexes[0].outgoing.setReader(receiver)
      }
    }
  }
}

/**
 * A component that has both an incoming and an outgoing Endpoint interface.
 *
 * Multiple pipes can be connected to form a pipeline.
 */
export interface Duplex<Request, Reply> {
  incoming: Channel<Request, Reply>
  outgoing: Channel<Request, Reply>
}

export interface Channel<Request,Response> {
  write: RequestHandler<Request, Response>
  setReader: (receiver: RequestHandler<Request, Response>) => this
}

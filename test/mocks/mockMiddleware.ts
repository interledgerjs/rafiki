import { Middleware } from "../../src/types/middleware";
import { IlpPrepare, IlpReply } from "ilp-packet";

export class MockMiddleware extends Middleware {

  constructor(handler: (packet: IlpPrepare) => Promise<IlpReply>){
    super({
      processIncoming: (request) => {
        return handler(request)
      },
      processOutgoing: (request) => {
        return handler(request)
      },
    })
  }
  
}
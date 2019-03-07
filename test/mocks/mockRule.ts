import { Rule } from "../../src/types/rule";
import { IlpPrepare, IlpReply } from "ilp-packet";

export class MockRule extends Rule {

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
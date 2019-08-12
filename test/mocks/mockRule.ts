import {Rule} from "../../src/types"
import {IlpPrepare, IlpReply} from "ilp-packet"

export class MockRule extends Rule {

  constructor(handler: (packet: IlpPrepare) => Promise<IlpReply>){
    super({
      incoming: (request) => {
        return handler(request)
      },
      outgoing: (request) => {
        return handler(request)
      },
    })
  }
  
}

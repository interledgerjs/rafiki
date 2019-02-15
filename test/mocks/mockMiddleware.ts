import Middleware, { Pipelines, MiddlewareCallback } from "../../src/types/middleware";
import { IlpPrepare, IlpReject, IlpReply } from "ilp-packet";

export default class MockMiddleware implements Middleware {

  handler: (packet: IlpPrepare) => Promise<IlpReply>

  constructor(handler: (packet: IlpPrepare) => Promise<IlpReply>){
    this.handler = handler
  }

  async applyToPipelines(pipelines: Pipelines) {
    pipelines.incomingData.insertLast({
      name: 'mockMiddleware',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        return this.handler(packet)
      }
    })
  }

}
import { Endpoint } from '../../src/types/endpoint'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { EventEmitter } from 'events';
import { RequestHandler } from '../../src/types/channel';

export default class MockIlpEndpoint implements Endpoint<IlpPrepare, IlpReply> {

  private _handler: RequestHandler<IlpPrepare, IlpReply>

  constructor(outgoingHandler: (request: IlpPrepare, respond: RequestHandler<IlpPrepare, IlpReply>) => Promise<IlpReply>){
    this.sendOutgoingRequest = (request: IlpPrepare, sentCallback?: () => void) => {
      if(this.connected) {
        if(sentCallback) sentCallback()
        return outgoingHandler(request, this._handler)  
      } else {
        throw new Error('not connected')
      }
    }
  }

  sendOutgoingRequest: (request: IlpPrepare, sentCallback?: () => void) => Promise<IlpReply>

  setIncomingRequestHandler (handler: RequestHandler<IlpPrepare, IlpReply>): this {
    this._handler = handler
    return this
  }

  mockIncomingRequest (request: IlpPrepare): Promise<IlpReply> {
    return this._handler(request)
  }

  /**
   * Set to false to simulate a disconnected endpoint
   */
  connected = true

}
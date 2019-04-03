import { Endpoint } from '../types/endpoint'
import { PluginInstance } from './plugin'
import { RequestHandler } from '../types/request-stream'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply, isFulfill, Errors } from 'ilp-packet'
import { STATIC_FULFILLMENT, STATIC_CONDITION } from '../constants'

const DEFAULT_SEND_MONEY_EXPIRY = 30000

/**
 * Create an endpoint that wraps a legacy plugin.
 *
 * The plugin is expected to already be connected.
 *
 * Converts sendMoney on the plugin to ILP packets addressed to `peer.settle`
 */
export class PluginEndpoint implements Endpoint<IlpPrepare, IlpReply> {

  private _plugin: PluginInstance
  private _sendMoneyExpiry: number

  constructor (plugin: PluginInstance, options?: { sendMoneyExpiry?: number }) {
    this._plugin = plugin
    this._sendMoneyExpiry = (options && options.sendMoneyExpiry) ? options.sendMoneyExpiry : DEFAULT_SEND_MONEY_EXPIRY
  }

  public async sendOutgoingRequest (request: IlpPrepare, sentCallback?: (() => void) | undefined): Promise<IlpReply> {

    if (request.destination.startsWith('peer.settle')) {
      const replyPromise = this._plugin.sendMoney(request.amount)
      if (sentCallback) sentCallback()
      await replyPromise
      return {
        fulfillment: STATIC_FULFILLMENT,
        data: Buffer.alloc(0)
      }
    }

    const replyPromise = this._plugin.sendData(serializeIlpPrepare(request))
    if (sentCallback) sentCallback()
    return deserializeIlpReply(await replyPromise)
  }

  public setIncomingRequestHandler (handler: RequestHandler<IlpPrepare, IlpReply>): this {
    this._plugin.registerMoneyHandler(async (amount: string) => {

      const reply = await handler({
        amount,
        destination: 'peer.settle',
        executionCondition: STATIC_CONDITION,
        expiresAt: new Date(Date.now() + this._sendMoneyExpiry),
        data: Buffer.alloc(0)
      })

      if (isFulfill(reply)) {
        return
      } else {
        throw new Error('settlement error')
      }

    })

    this._plugin.registerDataHandler(async (data: Buffer) => {
      return serializeIlpReply(await handler(deserializeIlpPrepare(data)))
    })

    return this
  }

  public connect () {
    return this._plugin.connect({})
  }

  public close () {
    return this._plugin.disconnect()
  }

}

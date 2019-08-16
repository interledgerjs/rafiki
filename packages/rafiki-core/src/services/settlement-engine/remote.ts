import axios from 'axios'
import { IlpPrepare, IlpReply, IlpFulfill, IlpReject } from 'ilp-packet'
import { log } from '@interledger/rafiki-utils'
import { STATIC_FULFILLMENT } from '../../constants'
import { SettlementEngine } from '.'
const logger = log.child({ component: 'remote-settlement-engine' })

export class RemoteSettlementEngine implements SettlementEngine {
  private _url: string

  constructor (url: string) {
    this._url = url
  }

  async addAccount (accountId: string) {
    logger.info('Creating account on settlement engine for peer=' + accountId + ' endpoint:' + `${this._url}/accounts`)
    await axios.post(`${this._url}/accounts`, { accountId })
    .then(response => {
      logger.info('Created account on settlement engine', { response: response.status })
    })
    .catch(error => {
      logger.error('Failed to create account on settlement engine. Retrying in 5s', { accountId, responseStatus: error.response.status })
      const timeout = setTimeout(() => this.addAccount(accountId), 5000)
      timeout.unref()
    })
  }

  async removeAccount (accountId: string) {
    logger.info('Removing account on settlement engine', { accountId })
    await axios.delete(`${this._url}/accounts/${accountId}`).catch(error => {
      console.log('failed to delete account' + accountId, 'url', `${this._url}/accounts/${accountId}`, 'error', error)
      logger.error('Failed to delete account on settlement engine', { accountId, responseStatus: error.response.status })
      throw error
    })
  }

  async receiveRequest (accountId: string, packet: IlpPrepare): Promise<IlpReply> {
    logger.debug('Forwarding packet onto settlement engine', { accountId, packet, url: `${this._url}/accounts/${accountId}/messages` })
    const bufferMessage = packet.data
    try {
      const response = await axios.post(`${this._url}/accounts/${accountId}/messages`, bufferMessage, { headers: { 'content-type': 'application/octet-stream' }, responseType: 'arraybuffer' })
      const ilpFulfill: IlpFulfill = {
        data: response.data || Buffer.from('') ,
        fulfillment: STATIC_FULFILLMENT
      }
      return ilpFulfill
    } catch (error) {
      logger.error('Could not deliver message to SE.', { errorStatus: error.status, errorMessage: error.message })
      const ilpReject: IlpReject = {
        code: 'F00',
        triggeredBy: 'peer.settle',
        data: Buffer.allocUnsafe(0),
        message: 'Failed to deliver message to SE'
      }
      return ilpReject
    }
  }

  async sendSettlement (accountId: string, amount: bigint, scale: number): Promise<void> {
    logger.debug('requesting SE to do settlement', { accountId, amount: amount.toString(), scale })
    const message = {
      amount: amount.toString(),
      scale
    }
    await axios.post(`${this._url}/accounts/${accountId}/settlement`, message)

    // TODO: Check for 2xx response
  }
}

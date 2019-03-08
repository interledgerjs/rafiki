import { log } from '../winston'
import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill } from 'ilp-packet'
import { RequestHandler } from '../types/request-stream'
import { Rule } from '../types/rule'

const logger = log.child({ component: 'alert-middleware' })
const { T04_INSUFFICIENT_LIQUIDITY } = IlpPacketErrors.codes

export interface Alert {
  id: number
  peerId: string
  triggeredBy: string
  message: string
  count: number
  createdAt: Date
  updatedAt: Date
}

export interface AlertRuleServices {
  createAlert: (triggeredBy: string, message: string) => void
}

/**
 * Creates alerts for reject packets caused by insufficient liquidity or an exceeded maximum balance.
 */
export class AlertRule extends Rule {
  constructor ({ createAlert }: AlertRuleServices) {
    super({

      processOutgoing: async (request: IlpPrepare, next: RequestHandler<IlpPrepare, IlpReply>) => {

        const result = await next(request)

        if (isFulfill(result)) return result

        if (result.code !== T04_INSUFFICIENT_LIQUIDITY) return result

        // The peer rejected a packet which, according to the local balance, should
        // have succeeded. This can happen when our local connector owes the peer
        // money but restarted before it was settled.
        if (result.message !== 'exceeded maximum balance.') return result

        createAlert(result.triggeredBy, result.message)

        return result
      }
    })
  }
}

export class Alerts {

  private _nextAlertId: number = Date.now()
  private _alerts: { [id: number]: Alert } = {}

  public getAlerts (): Alert[] {
    return Object.keys(this._alerts)
      .map((id) => this._alerts[id])
      .sort((a, b) => a.id - b.id)
  }

  public dismissAlert (id: number) {
    logger.debug('dismissed alert', { alert: { id } })
    delete this._alerts[id]
  }

  public createAlert (peerId: string, triggeredBy: string, message: string) {
    let alert = Object.keys(this._alerts)
      .map((alertId) => this._alerts[alertId])
      .find((alert) =>
        alert.peerId === peerId &&
        alert.triggeredBy === triggeredBy &&
        alert.message === message)
    if (alert) {
      alert.count++
      alert.updatedAt = new Date()
      logger.debug('incremented alert count', { alert })
      return
    }

    const id = this._nextAlertId++
    const now = new Date()
    alert = {
      id,
      peerId,
      triggeredBy,
      message,
      count: 1,
      createdAt: now,
      updatedAt: now
    }
    logger.debug('added new alert', { alert })
    this._alerts[id] = alert
  }
}

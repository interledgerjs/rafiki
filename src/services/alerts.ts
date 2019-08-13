import { log } from '../winston'
const logger = log.child({ component: 'alerts-service' })
export interface Alert {
  id: number
  peerId: string
  triggeredBy: string
  message: string
  count: number
  createdAt: Date
  updatedAt: Date
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

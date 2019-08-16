import {EventEmitter} from 'events'
import {DataHandler, MoneyHandler, PluginInstance} from '../../src/legacy/plugin'

export class MockPlugin extends EventEmitter implements PluginInstance {

  static version = 2

  private _dataHandler: DataHandler
  private _moneyHandler: MoneyHandler

  constructor () {
    super()
  }

  public connected: boolean

  public async connect () {
    this.connected = true
    this.emit('connect')
    return
  }

  public async disconnect () {
    this.connected = false
    return 
  }

  public isConnected () {
    return this.connected
  }

  public sendData (data: Buffer) {
    return Promise.reject(new Error('MockPlugin.sendData is not implemented.'))
  }

  public sendMoney (amount: string) {
    return Promise.reject(new Error('MockPlugin.sendMoney is not implemented.'))
  }

  public registerDataHandler (dataHandler: DataHandler) {
    this._dataHandler = dataHandler
  }

  public registerMoneyHandler (moneyHandler: MoneyHandler) {
    this._moneyHandler = moneyHandler
  }

  public deregisterDataHandler () {
    delete(this._dataHandler)
  }

  public deregisterMoneyHandler () {
    delete(this._moneyHandler)
  }

  public async getAdminInfo () {
    return {
      foo: 'bar'
    }
  }

  public async sendAdminInfo (obj: any) {
    return {
      foo: obj
    }
  }
}

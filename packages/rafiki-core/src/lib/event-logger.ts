import Koa from 'koa'
import { Logger } from '../types'
/**
 * A logger that emits events via the Koa app
 */
export class EventLogger implements Logger {

  constructor (private _app: Koa) {
  }

  public fatal (msg: string, ...args: any[]): void
  public fatal (obj: object, msg?: string, ...args: any[]): void
  public fatal (msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._log('fatal', msgOrObj, msgOrArgs, args)
  }
  public error (msg: string, ...args: any[]): void
  public error (obj: object, msg?: string, ...args: any[]): void
  public error (msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._log('error', msgOrObj, msgOrArgs, args)
  }
  public warn (msg: string, ...args: any[]): void
  public warn (obj: object, msg?: string, ...args: any[]): void
  public warn (msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._log('warn', msgOrObj, msgOrArgs, args)
  }
  public info (msg: string, ...args: any[]): void
  public info (obj: object, msg?: string, ...args: any[]): void
  public info (msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._log('info', msgOrObj, msgOrArgs, args)
  }
  public debug (msg: string, ...args: any[]): void
  public debug (obj: object, msg?: string, ...args: any[]): void
  public debug (msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._log('debug', msgOrObj, msgOrArgs, args)
  }
  public trace (msg: string, ...args: any[]): void
  public trace (obj: object, msg?: string, ...args: any[]): void
  public trace (msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._log('trace', msgOrObj, msgOrArgs, args)
  }

  public _log (type: string, msgOrObj: string | object, msgOrArgs?: string | any[], ...args: any[]) {
    this._app.emit(type, type, msgOrObj, msgOrArgs, args)
  }
}

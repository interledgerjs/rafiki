import Middleware, { MiddlewareDefinition } from "./types/middleware"
import Config from "./services/config"
import createLogger, { Logger } from 'ilp-logger'
import Connector from './connector'
import { PeerInfo } from './types/peer'
import { Endpoint } from './types/endpoint';
import { IlpPrepare, IlpReply } from 'ilp-packet';
import { PeerController } from 'ilp-router';

const BUILTIN_MIDDLEWARES: { [key: string]: MiddlewareDefinition } = {
  errorHandler: {
    type: 'error-handler'
  },
  rateLimit: {
    type: 'rate-limit'
  },
  maxPacketAmount: {
    type: 'max-packet-amount'
  },
  throughput: {
    type: 'throughput'
  },
  balance: {
    type: 'balance'
  },
  deduplicate: {
    type: 'deduplicate'
  },
  expire: {
    type: 'expire'
  },
  validateFulfillment: {
    type: 'validate-fulfillment'
  },
  stats: {
    type: 'stats'
  },
  alert: {
    type: 'alert'
  }
}

export default class App {

  config: Config
  log: Logger
  connector: Connector
  constructor (opts?: object) {

    this.log = createLogger('app')
    this.config = new Config()
    this.connector = new Connector()

    try {
      if (opts) {
        this.config.loadFromOpts(opts)
      } else {
        this.config.loadFromEnv()
      }
    } catch (err) {
      if (err.name === 'InvalidJsonBodyError') {
        this.log.warn('config validation error.')
        err.debugPrint(this.log.warn.bind(this.log))
        this.log.error('invalid configuration, shutting down.')
        throw new Error('failed to initialize due to invalid configuration.')
      }

      throw err
    }

    // create accounts specified in config using default middleware
    // const accounts = this.config.accounts

    // for(let account of Object.keys(accounts)) {
    //   console.log(account, accounts[account])
    //   const accountInfo = accounts[account]
    // }

  }

  async addPeer(peerInfo: PeerInfo) {
    // return this.connector.addPeer(peerInfo, endpoint, businessMiddleware)
  }

  getPeer (id: string): PeerController {
    return this.connector.getPeer(id)
  }

  generateMiddleware(peerInfo: PeerInfo): Middleware[] {
    const middleware: Middleware[] = []
    const disabledMiddleware = this.config.disableMiddleware ? this.config.disableMiddleware : []

    

    return middleware
  }

}

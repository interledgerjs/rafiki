import { InvalidJsonBodyError } from '../errors/invalid-json-body-error'
import { constantCase } from 'change-case'
import { Config as ConfigSchemaTyping } from '../schemas/ConfigTyping'
import { log } from '../winston'
import configSchema from '../schemas/Config.json'
const {
  extractDefaultsFromSchema
} = require('../lib/utils')
import Ajv = require('ajv')
const logger = log.child({ component: 'config' })
const ajv = new Ajv()

const ENV_PREFIX = 'CONNECTOR_'

const BOOLEAN_VALUES = {
  '1': true,
  'true': true,
  '0': false,
  'false': false,
  '': false
}

export class Config extends ConfigSchemaTyping {
  // TODO: These fields are already all defined in the config schema, however
  //   they are defined as optional and as a result, TypeScript thinks that they
  //   may not be set. However, when we construct a new Config instance, we load
  //   the defaults from the schema, so these *will* always be set. These
  //   declarations make TypeScript happy.
  public quoteExpiry!: number
  public routeExpiry!: number
  public minExpirationWindow!: number
  public maxHoldWindow!: number
  public routeBroadcastInterval!: number
  public http2ServerPort!: number
  public ilpAddress!: string

  protected _validate: Ajv.ValidateFunction
  protected _validatePeer: Ajv.ValidateFunction

  constructor () {
    super()

    this.loadDefaults()

    this._validate = ajv.compile(configSchema)
    this._validatePeer = ajv.compile(configSchema.properties.peers.additionalProperties)
  }

  loadDefaults () {
    Object.assign(this, extractDefaultsFromSchema(configSchema))
  }

  loadFromEnv (env?: NodeJS.ProcessEnv) {
    if (!env) {
      env = process.env
    }

    // Copy all env vars starting with ENV_PREFIX into a set so we can check off
    // the ones we recognize and warn the user about any we don't recognize.
    const unrecognizedEnvKeys = new Set(
      Object.keys(env).filter(key => key.startsWith(ENV_PREFIX))
    )

    const config = {}
    for (let key of Object.keys(configSchema.properties)) {
      const envKey = ENV_PREFIX + constantCase(key)
      const envValue = env[envKey]

      unrecognizedEnvKeys.delete(envKey)

      if (typeof envValue === 'string') {
        switch (configSchema.properties[key].type) {
          case 'string':
            config[key] = envValue
            break
          case 'object':
          case 'array':
            try {
              config[key] = JSON.parse(envValue)
            } catch (err) {
              logger.error('unable to parse config. key=%s' + envKey)
            }
            break
          case 'boolean':
            config[key] = BOOLEAN_VALUES[envValue] || false
            break
          case 'integer':
          case 'number':
            config[key] = Number(envValue)
            break
          default:
            throw new TypeError('Unknown JSON schema type: ' + configSchema.properties[key].type)
        }
      }
    }

    for (const key of unrecognizedEnvKeys) {
      logger.warn('unrecognized environment variable. key=' + key)
    }

    this.validate(config)

    Object.assign(this, config)
  }

  loadFromOpts (opts: object) {
    this.validate(opts)

    Object.assign(this, opts)
  }

  validate (config: object) {
    if (!this._validate(config)) {
      const firstError = this._validate.errors && this._validate.errors[0]
        ? this._validate.errors[0]
        : { message: 'unknown validation error', dataPath: '' }
      throw new InvalidJsonBodyError('config failed to validate. error=' + firstError.message + ' dataPath=' + firstError.dataPath, this._validate.errors || [])
    }

    // check that a peer exists for preconfigured routes
    const routes: {targetPrefix: string, peerId: string}[] = config['routes'] || []
    routes.forEach(entry => {
      if (!config['peers'][entry.peerId]) {
        const err = 'No peer configured for pre-configured route: ' + JSON.stringify(entry)
        logger.error(err)
        throw new Error(err)
      }
    })
  }

  get (key: string) {
    return this[key]
  }
}

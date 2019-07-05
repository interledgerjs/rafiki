import Knex from 'knex'
const knexConfig = require('../../knexfile.js')

export class DB {
  private _knex: Knex

  constructor() {
    this._knex = Knex(knexConfig.testing)
  }

  async setup () {
    await this._knex.migrate.rollback(knexConfig, true)
    await this._knex.migrate.latest()
  }

  async teardown () {
    await this._knex.migrate.rollback(knexConfig, true)
    await this._knex.destroy()
  }

  knex () {
    return this._knex
  }
}
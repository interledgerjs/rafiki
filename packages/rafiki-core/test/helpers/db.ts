import Knex from 'knex'

export class DB {
  private _knex: Knex

  constructor() {
    this._knex = Knex({
      client: 'sqlite3',
      useNullAsDefault: true,
      connection: {
        filename: ':memory:'
      }
    })
  }

  async setup () {
    await this._knex.migrate.rollback({}, true)
    await this._knex.migrate.latest()
  }

  async teardown () {
    await this._knex.migrate.rollback({}, true)
    await this._knex.destroy()
  }

  knex () {
    return this._knex
  }
}

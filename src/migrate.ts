import Knex from 'knex'
import { Config } from '.'

let knex: Knex

const config = new Config()
config.loadFromEnv()
knex = Knex(config.databaseConnectionString)

const start = async () => {
  console.log('Migrating Database')
  await knex.migrate.latest()
  console.log('Finished migrating Database')
  await knex.destroy()
}

start().catch(error => {
  console.log('error running migration', error)
})

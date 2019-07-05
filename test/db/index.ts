/**
 * Module "required" by Mocha which sets global hooks to set up db
 */
import Knex from 'knex'
import { Model } from 'objection'
const knexConfig = require('../../knexfile')
let knex: Knex

// Async so that we let Mocha load before these are executed
setTimeout(() => {

  before(async function () {
    try {
      // Initialize knex.
      knex = Knex({
        ...knexConfig.testing,
      });

      // Create or migrate:
      await knex.migrate.rollback(knexConfig, true)
      await knex.migrate.latest()

      // // Bind all Models to a knex instance. If you only have one database in
      // // your server this is all you have to do. For multi database systems, see
      // // the Model.bindKnex method.
      Model.knex(knex);
    } catch (error) {
      throw new Error("Failed to create database.")
    }
  })
  
  // drop all tables
  after(async function () {
    try {
      await knex.migrate.rollback(knexConfig, true)
      await knex.destroy()
    } catch (error) {
      throw new Error("Failed to tear down database.")
    }
  })
})
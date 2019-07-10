const nanoid = require('nanoid')

exports.up = function(knex) {
  return knex.schema.createTable('authTokens', function(table) {
    table.string('id').primary()
    table.string('peerId').notNullable()
  }).then(() => {
    const adminAuthToken = process.env.ADMIN_AUTH_TOKEN || nanoid(36)
    console.log('****************************')
    console.log('Save this token somewhere safe as it is required to perform admin api functions')
    console.log('****************************')
    console.log('ADMIN TOKEN: ', adminAuthToken)
    console.log('****************************')
    return knex('authTokens').insert({id: adminAuthToken, peerId: 'self'})
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('authTokens');
};

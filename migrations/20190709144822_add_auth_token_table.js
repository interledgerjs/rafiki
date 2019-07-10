
exports.up = function(knex) {
  return knex.schema.createTable('authTokens', function(table) {
    table.string('id').primary()
    table.string('peerId').notNullable()
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('authTokens');
};

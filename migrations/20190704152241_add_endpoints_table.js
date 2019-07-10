
exports.up = function(knex) {
  return knex.schema.createTable('endpoints', function(table) {
    table.increments('id').unsigned().primary()
    table.string('peerId').notNullable()
    table.string('type').notNullable()
    table.json('options')
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('endpoints');
};
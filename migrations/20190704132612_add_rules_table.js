
exports.up = function(knex) {
  return knex.schema.createTable('rules', function(table) {
    table.increments('id').unsigned().primary()
    table.string('peerId').notNullable()
    table.string('name').notNullable()
    table.text('config')
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('rules');
};

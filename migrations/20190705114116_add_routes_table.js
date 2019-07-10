
exports.up = function(knex) {
  return knex.schema.createTable('routes', function(table) {
    table.increments('id').unsigned().primary()
    table.string('peerId').notNullable()
    table.string('targetPrefix').notNullable()
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('routes');
};

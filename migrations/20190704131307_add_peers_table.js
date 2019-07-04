
exports.up = function(knex) {
  return knex.schema.createTable('peers', function(table) {
    table.string('id').primary().unique()
    table.string('assetCode').notNullable()
    table.integer('assetScale').unsigned().notNullable()
    table.string('relation').notNullable()
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('peers');
};

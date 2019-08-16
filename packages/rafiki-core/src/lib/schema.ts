export const extractDefaultsFromSchema = (schema: any, path = '') => {
  if (typeof schema.default !== 'undefined') {
    return schema.default
  }

  switch (schema.type) {
    case 'object':
      const result = {}
      for (let key of Object.keys(schema.properties)) {
        result[key] = extractDefaultsFromSchema(schema.properties[key], path + '.' + key)
      }
      return result
    default:
      throw new Error('No default found for schema path: ' + path)
  }
}
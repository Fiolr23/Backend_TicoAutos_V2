const { makeExecutableSchema } = require("@graphql-tools/schema");

const { resolvers } = require("./resolvers");
const { typeDefs } = require("./typeDefs");

// Une el esquema en texto con los resolvers al estilo visto en clase.
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

module.exports = {
  schema,
};

const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@as-integrations/express5");
const { ApolloServerPluginLandingPageLocalDefault } = require("@apollo/server/plugin/landingPage/default");

const { buildContext } = require("./context");
const { schema } = require("./schema");

// Convierte el request de Express al formato simple que usa context.js.
function buildRequest(req) {
  return {
    headers: {
      get(name) {
        return req.headers?.[`${name}`.toLowerCase()] || "";
      },
    },
  };
}

// Registra Apollo en la ruta /graphql sin afectar el REST actual.
async function registerGraphQL(app) {
  const apolloServer = new ApolloServer({
    schema,
    plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true })],
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    expressMiddleware(apolloServer, {
      context: async ({ req }) => buildContext({ request: buildRequest(req) }),
    })
  );
}

module.exports = {
  registerGraphQL,
};

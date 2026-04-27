const { getAuthUserFromHeader } = require("../middleware/auth");

// Construye el contexto de GraphQL con el mismo JWT usado por REST.
async function buildContext({ request }) {
  const authHeader = request.headers.get("authorization") || "";
  let user = null;

  if (authHeader) {
    try {
      user = await getAuthUserFromHeader(authHeader);
    } catch (_error) {
      user = null;
    }
  }

  return { user };
}

module.exports = {
  buildContext,
};

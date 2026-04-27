const jwt = require("jsonwebtoken");
const User = require("../models/user");

const JWT_SECRET = process.env.JWT_SECRET || "utn-api-secret-key";

// Lee el token Bearer del mismo header que ya usa REST.
const readBearerToken = (headers = {}) => {
  const authHeader = headers.authorization || headers.Authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.slice("Bearer ".length).trim();
};

// Construye el usuario autenticado para Apollo.
const buildGraphqlContext = async ({ req }) => {
  const token = readBearerToken(req?.headers);

  if (!token) {
    return { req, token: "", user: null };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    return {
      req,
      token,
      user: user || null,
    };
  } catch (error) {
    return { req, token, user: null };
  }
};

module.exports = {
  buildGraphqlContext,
};

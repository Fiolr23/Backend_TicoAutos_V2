const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "utn-api-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Construye una versión segura del usuario para devolverla al cliente.
 * Se excluyen campos sensibles o internos que no deberían exponerse.
 */
const buildAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  lastname: user.lastname,
  email: user.email,
});

/**
 * Genera el JWT que representará la sesión autenticada del usuario.
 */
const generateJwt = (user) =>
  jwt.sign(
    {
      userId: user._id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

/**
 * Middleware que valida el token recibido en Authorization: Bearer <token>
 * y carga el usuario autenticado en req.user.
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Error authenticating token:", error);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Login.
 * Valida las credenciales del usuario y, si son correctas, devuelve
 * un JWT firmado para autenticación en rutas protegidas.
 */
const generateToken = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateJwt(user);

    return res.status(200).json({
      message: "Login exitoso",
      token,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Error generating token:", error);
    return res.status(500).json({ message: "Error generating token" });
  }
};

/**
 * Logout.
 * Con JWT stateless no es necesario eliminar sesión en la base de datos.
 * El cliente solo debe descartar el token almacenado localmente.
 */
const logout = async (_req, res) => {
  return res.json({ message: "Logout exitoso" });
};

module.exports = { authenticateToken, generateToken, logout };

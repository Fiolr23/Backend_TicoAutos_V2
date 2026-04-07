const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = process.env.JWT_SECRET || "utn-api-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client();

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
 * Verifica el ID token recibido desde Google Identity Services
 * y confirma que fue emitido para este Client ID.
 */
const verifyGoogleCredential = async (credential) => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID no configurado");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email || !payload.email_verified) {
    throw new Error("Credencial de Google invalida");
  }

  return payload;
};

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

    // Las cuentas creadas con Google no usan password local.
    if (!user.password) {
      return res.status(401).json({
        message: "Esta cuenta fue registrada con Google. Usa Acceder con Google.",
      });
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
 * Login con Google o inicio del flujo de registro.
 * Si la cuenta ya existe con googleId, se genera JWT.
 * Si no existe, el frontend debe pedir cédula para completar el registro.
 */
const googleAuth = async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: "La credencial de Google es requerida" });
  }

  let payload;

  try {
    payload = await verifyGoogleCredential(credential);
  } catch (error) {
    console.error("Error verifying Google credential:", error);

    return res.status(error.message.includes("GOOGLE_CLIENT_ID") ? 500 : 401).json({
      message: error.message.includes("GOOGLE_CLIENT_ID")
        ? "Google no esta configurado en el servidor"
        : "No se pudo validar la cuenta de Google",
    });
  }

  const googleId = `${payload.sub}`.trim();
  const email = `${payload.email}`.toLowerCase().trim();

  try {
    const googleUser = await User.findOne({ googleId });

    if (googleUser) {
      const token = generateJwt(googleUser);

      return res.status(200).json({
        message: "Login con Google exitoso",
        token,
        user: buildAuthUser(googleUser),
      });
    }

    // Para mantener el cambio pequeño y seguro no se enlazan cuentas
    // locales existentes por correo automáticamente.
    const emailUser = await User.findOne({ email });

    if (emailUser) {
      return res.status(409).json({
        message: "Ese correo ya existe en el sistema. Usa tu metodo de acceso actual.",
      });
    }

    return res.status(200).json({
      message: "Cuenta de Google verificada. Falta validar la cedula.",
      needsCedula: true,
      googleProfile: {
        email,
        name: payload.name || "",
      },
    });
  } catch (error) {
    console.error("Error en Google auth:", error);
    return res.status(500).json({ message: "No se pudo continuar con Google" });
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

module.exports = {
  authenticateToken,
  buildAuthUser,
  generateJwt,
  generateToken,
  googleAuth,
  logout,
  verifyGoogleCredential,
};

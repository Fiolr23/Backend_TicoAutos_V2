const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = process.env.JWT_SECRET || "utn-api-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// URL del frontend para redireccion despues de verificar correo.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5500";

// Secret del JWT de verificacion de correo.
const EMAIL_VERIFICATION_SECRET =
  process.env.EMAIL_VERIFICATION_SECRET || "email-verification-secret";

// Cliente de Google.
const googleClient = new OAuth2Client();

// Devuelve una version segura del usuario para el frontend.
const buildAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  lastname: user.lastname,
  email: user.email,
  accountStatus: user.accountStatus,
});

// Genera el JWT de sesion.
const generateJwt = (user) =>
  jwt.sign(
    {
      userId: user._id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

// Extrae el token cuando llega como Authorization: Bearer <token>.
const extractBearerToken = (authHeader = "") => {
  const [scheme, token] = `${authHeader}`.split(" ");
  return scheme === "Bearer" && token ? token : null;
};

// Resuelve el usuario autenticado con el mismo token usado por REST.
const getAuthUserFromHeader = async (authHeader) => {
  const token = extractBearerToken(authHeader);

  if (!token) {
    return null;
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new Error("Invalid or expired token");
  }

  return user;
};

// Verifica el token de Google.
const verifyGoogleCredential = async (credential) => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID no configurado");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  // Valida que tenga datos minimos y correo verificado.
  if (!payload?.sub || !payload?.email || !payload.email_verified) {
    throw new Error("Credencial de Google invalida");
  }

  return payload;
};

// Middleware que valida el token recibido en Authorization: Bearer <token>.
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Si no existe token, responde error.
  if (!extractBearerToken(authHeader)) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  try {
    // Reutiliza la misma validacion para REST y GraphQL.
    const user = await getAuthUserFromHeader(authHeader);

    // Si no existe usuario, responde error.
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = user;

    // Continua al siguiente middleware.
    return next();
  } catch (error) {
    console.error("Error authenticating token:", error);

    // Respuesta generica.
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Login normal con email y password.
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

    // Si la cuenta sigue pendiente, bloquea el login.
    if (user.accountStatus === "Pendiente") {
      return res.status(403).json({
        message: "Debes verificar tu correo antes de iniciar sesion",
      });
    }

    // Si no tiene password, significa que fue creado con Google.
    if (!user.password) {
      return res.status(401).json({
        message: "Esta cuenta fue registrada con Google. Usa Acceder con Google.",
      });
    }

    // Compara la contrasena enviada con la guardada.
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Genera JWT de sesion.
    const token = generateJwt(user);

    return res.status(200).json({
      message: "Login exitoso",
      token,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Error generating token:", error);

    // Respuesta generica.
    return res.status(500).json({ message: "Error generating token" });
  }
};

// Login con Google o inicio del flujo de registro.
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

    // Respuesta segun el tipo de error.
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
      // Si por alguna razon sigue pendiente, tambien se bloquea.
      if (googleUser.accountStatus === "Pendiente") {
        return res.status(403).json({
          message: "Debes verificar tu correo antes de iniciar sesion",
        });
      }

      // Genera JWT de sesion.
      const token = generateJwt(googleUser);

      return res.status(200).json({
        message: "Login con Google exitoso",
        token,
        user: buildAuthUser(googleUser),
      });
    }

    // Para mantener el cambio pequeno y seguro no se enlazan cuentas locales.
    const emailUser = await User.findOne({ email });

    // Si existe, evita enlazar cuentas automaticamente.
    if (emailUser) {
      return res.status(409).json({
        message: "Ese correo ya existe en el sistema. Usa tu metodo de acceso actual.",
      });
    }

    // Si no existe, indica al frontend que falta cedula.
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

    // Respuesta generica.
    return res.status(500).json({ message: "No se pudo continuar con Google" });
  }
};

// Endpoint que se ejecuta al abrir el link del correo.
const verifyEmail = async (req, res) => {
  // Extrae el token desde query params.
  const token = `${req.query.token || ""}`.trim();

  // Construye la URL del login del frontend.
  const loginUrl = `${FRONTEND_URL}/login.html`;

  // Si no vino token, redirige con error.
  if (!token) {
    return res.redirect(`${loginUrl}?verified=0&reason=missing`);
  }

  try {
    // Verifica firma y expiracion del JWT.
    const decoded = jwt.verify(token, EMAIL_VERIFICATION_SECRET);

    // Si el proposito no coincide, lo rechaza.
    if (decoded.purpose !== "email_verification") {
      return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
    }

    // Busca el usuario por id.
    const user = await User.findById(decoded.userId);

    // Si no existe, redirige con error.
    if (!user) {
      return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
    }

    // Verifica que el token recibido sea el mismo guardado en BD.
    if (user.emailVerificationToken !== token) {
      return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
    }

    // Verifica la fecha de expiracion guardada.
    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      return res.redirect(`${loginUrl}?verified=0&reason=expired`);
    }

    // Cambia el estado a activa.
    user.accountStatus = "Activa";

    // Guarda la fecha de verificacion.
    user.emailVerifiedAt = new Date();

    // Limpia el token para que el link no se pueda volver a usar.
    user.emailVerificationToken = null;

    // Limpia la expiracion.
    user.emailVerificationExpiresAt = null;

    // Guarda cambios.
    await user.save();

    // Redirige al login con exito.
    return res.redirect(`${loginUrl}?verified=1`);
  } catch (error) {
    // Si el JWT ya expiro, redirige con motivo expired.
    if (error.name === "TokenExpiredError") {
      return res.redirect(`${loginUrl}?verified=0&reason=expired`);
    }

    // Log del error.
    console.error("Error verificando correo:", error);

    // Redirige con error generico.
    return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
  }
};

// Endpoint de logout.
const logout = async (_req, res) => {
  return res.json({ message: "Logout exitoso" });
};

module.exports = {
  authenticateToken,
  buildAuthUser,
  extractBearerToken,
  getAuthUserFromHeader,
  generateJwt,
  generateToken,
  googleAuth,
  logout,
  verifyEmail,
  verifyGoogleCredential,
};
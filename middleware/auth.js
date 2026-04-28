const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Importa cliente oficial de Google.
const { OAuth2Client } = require("google-auth-library");

// Helper para enviar SMS con Twilio.
const { sendTwoFactorCode } = require("../utils/twilioSms");

const JWT_SECRET = process.env.JWT_SECRET || "utn-api-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Minutos que dura valido el codigo 2FA.
const TWO_FACTOR_CODE_EXPIRES_MINUTES = Number(process.env.TWO_FACTOR_CODE_EXPIRES_MINUTES || 5);

// Client ID de Google.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// URL del frontend para redirección después de verificar correo.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5500";

// Secret del JWT de verificación de correo.
const EMAIL_VERIFICATION_SECRET = process.env.EMAIL_VERIFICATION_SECRET || "email-verification-secret";

// Cliente de Google.
const googleClient = new OAuth2Client();

// Devuelve una versión segura del usuario para el frontend.
const buildAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  lastname: user.lastname,
  email: user.email,
  accountStatus: user.accountStatus
});

// Genera el JWT de sesión.
const generateJwt = (user) =>
  jwt.sign(
    {
      // Guarda el id del usuario.
      userId: user._id,
      // Guarda el correo del usuario.
      email: user.email
    },
    // Firma el token con el secret normal.
    JWT_SECRET,
    // Configura expiración del token.
    { expiresIn: JWT_EXPIRES_IN }
  );

// Genera un codigo numerico de 6 digitos para 2FA.
const generateTwoFactorCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Verifica el token de Google.
const verifyGoogleCredential = async (credential) => {
  // Si falta client id, lanza error.
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID no configurado");
  }

  // Verifica el token enviado por Google.
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID
  });

  // Obtiene el payload.
  const payload = ticket.getPayload();

  // Valida que tenga datos mínimos y correo verificado.
  if (!payload?.sub || !payload?.email || !payload.email_verified) {
    throw new Error("Credencial de Google invalida");
  }

  // Retorna el payload.
  return payload;
};

// Middleware que protege rutas con JWT.
const authenticateToken = async (req, res, next) => {
  // Lee el header Authorization.
  const authHeader = req.headers.authorization;

  // Extrae el token Bearer.
  const token = authHeader && authHeader.split(" ")[1];

  // Si no existe token, responde error.
  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  try {
    // Verifica el JWT.
    const decoded = jwt.verify(token, JWT_SECRET);

    // Busca al usuario.
    const user = await User.findById(decoded.userId);

    // Si no existe usuario, responde error.
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Adjunta usuario al request.
    req.user = user;

    // Continúa al siguiente middleware.
    return next();
  } catch (error) {
    // Log del error.
    console.error("Error authenticating token:", error);

    // Respuesta genérica.
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Endpoint de login tradicional.
const generateToken = async (req, res) => {
  // Extrae email y password.
  const { email, password } = req.body;

  // Valida campos obligatorios.
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    // Normaliza el correo.
    const normalizedEmail = email.toLowerCase().trim();

    // Busca usuario por correo.
    const user = await User.findOne({ email: normalizedEmail });

    // Si no existe, responde error.
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Si la cuenta sigue pendiente, bloquea el login.
    // Esto mantiene intacta la verificacion de correo electronico.
    if (user.accountStatus === "Pendiente") {
      return res.status(403).json({
        message: "Debes verificar tu correo antes de iniciar sesion"
      });
    }

    // Si no tiene password, significa que fue creado con Google.
    // Google no usa 2FA porque entra por otro flujo.
    if (!user.password) {
      return res.status(401).json({
        message: "Esta cuenta fue registrada con Google. Usa Acceder con Google."
      });
    }

    // Compara la contraseña enviada con la guardada.
    const passwordMatches = await bcrypt.compare(password, user.password);

    // Si no coincide, responde error.
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Si no tiene telefono, no se puede enviar el codigo 2FA.
    if (!user.phone) {
      return res.status(400).json({
        message: "Tu usuario no tiene telefono registrado para 2FA"
      });
    }

    // Genera el codigo que recibira el usuario por SMS.
    const twoFactorCode = generateTwoFactorCode();

    // Guarda el codigo como hash para no almacenarlo en texto plano.
    user.twoFactorCode = await bcrypt.hash(twoFactorCode, 10);

    // Guarda la fecha de expiracion del codigo.
    user.twoFactorCodeExpires = new Date(Date.now() + TWO_FACTOR_CODE_EXPIRES_MINUTES * 60 * 1000);

    // Guarda los datos temporales de 2FA.
    await user.save();

    try {
      // Envia el codigo real por SMS.
      await sendTwoFactorCode({
        to: user.phone,
        code: twoFactorCode
      });
    } catch (smsError) {
      // Si Twilio falla, se informa el error.
      console.error("Error enviando SMS 2FA:", smsError);

      return res.status(500).json({
        message: "No se pudo enviar el codigo por SMS"
      });
    }

    // No se entrega JWT todavia; primero debe verificar el codigo.
    return res.status(200).json({
      message: "Codigo 2FA enviado por SMS",
      requiresTwoFactor: true,
      userId: user._id
    });
  } catch (error) {
    // Log del error.
    console.error("Error generating token:", error);

    // Respuesta genérica.
    return res.status(500).json({ message: "Error generating token" });
  }
};

// Verifica el codigo 2FA y entrega el JWT final.
const verifyTwoFactorCode = async (req, res) => {
  // Recibe el usuario pendiente y el codigo escrito.
  const { userId, code } = req.body;

  // Valida datos obligatorios.
  if (!userId || !code) {
    return res.status(400).json({ message: "Usuario y codigo son requeridos" });
  }

  try {
    // Busca el usuario que esta intentando completar login.
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verifica que exista un codigo pendiente.
    if (!user.twoFactorCode || !user.twoFactorCodeExpires) {
      return res.status(400).json({ message: "No hay codigo 2FA pendiente" });
    }

    // Revisa si el codigo ya vencio.
    if (user.twoFactorCodeExpires.getTime() < Date.now()) {
      user.twoFactorCode = null;
      user.twoFactorCodeExpires = null;
      await user.save();

      return res.status(400).json({ message: "El codigo 2FA expiro" });
    }

    // Compara el codigo escrito contra el hash guardado.
    const codeMatches = await bcrypt.compare(`${code}`.trim(), user.twoFactorCode);

    if (!codeMatches) {
      return res.status(401).json({ message: "Codigo 2FA incorrecto" });
    }

    // Limpia el codigo para que no pueda reutilizarse.
    user.twoFactorCode = null;
    user.twoFactorCodeExpires = null;
    await user.save();

    // Ahora si genera el JWT final de sesion.
    const token = generateJwt(user);

    return res.status(200).json({
      message: "Login exitoso",
      token,
      user: buildAuthUser(user)
    });
  } catch (error) {
    console.error("Error verificando 2FA:", error);
    return res.status(500).json({ message: "Error verificando codigo 2FA" });
  }
};

// Endpoint de login con Google.
const googleAuth = async (req, res) => {
  // Extrae la credencial enviada por el frontend.
  const { credential } = req.body;

  // Valida que exista la credencial.
  if (!credential) {
    return res.status(400).json({ message: "La credencial de Google es requerida" });
  }

  // Variable para guardar el payload.
  let payload;

  try {
    // Verifica la credencial.
    payload = await verifyGoogleCredential(credential);
  } catch (error) {
    // Log del error.
    console.error("Error verifying Google credential:", error);

    // Respuesta según el tipo de error.
    return res.status(error.message.includes("GOOGLE_CLIENT_ID") ? 500 : 401).json({
      message: error.message.includes("GOOGLE_CLIENT_ID")
        ? "Google no esta configurado en el servidor"
        : "No se pudo validar la cuenta de Google"
    });
  }

  // Extrae google id.
  const googleId = `${payload.sub}`.trim();

  // Extrae y normaliza el correo.
  const email = `${payload.email}`.toLowerCase().trim();

  try {
    // Busca usuario por googleId.
    const googleUser = await User.findOne({ googleId });

    // Si existe, intenta login directo.
    if (googleUser) {
      // Si por alguna razón sigue pendiente, también se bloquea.
      if (googleUser.accountStatus === "Pendiente") {
        return res.status(403).json({
          message: "Debes verificar tu correo antes de iniciar sesion"
        });
      }

      // Genera JWT de sesión.
      const token = generateJwt(googleUser);

      // Responde login exitoso.
      return res.status(200).json({
        message: "Login con Google exitoso",
        token,
        user: buildAuthUser(googleUser)
      });
    }

    // Busca si ya existe una cuenta local con ese correo.
    const emailUser = await User.findOne({ email });

    // Si existe, evita enlazar cuentas automáticamente.
    if (emailUser) {
      return res.status(409).json({
        message: "Ese correo ya existe en el sistema. Usa tu metodo de acceso actual."
      });
    }

    // Si no existe, indica al frontend que falta cédula.
    return res.status(200).json({
      message: "Cuenta de Google verificada. Falta validar la cedula.",
      needsCedula: true,
      googleProfile: {
        email,
        name: payload.name || ""
      }
    });
  } catch (error) {
    // Log del error.
    console.error("Error en Google auth:", error);

    // Respuesta genérica.
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
    // Verifica firma y expiración del JWT.
    const decoded = jwt.verify(token, EMAIL_VERIFICATION_SECRET);

    // Si el propósito no coincide, lo rechaza.
    if (decoded.purpose !== "email_verification") {
      return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
    }

    // Busca el usuario por id.
    const user = await User.findById(decoded.userId);

    // Si no existe, redirige con error.
    if (!user) {
      return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
    }

    // Verifica que el token recibido sea exactamente el mismo guardado en BD.
    if (user.emailVerificationToken !== token) {
      return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
    }

    // Verifica la fecha de expiración guardada.
    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
      return res.redirect(`${loginUrl}?verified=0&reason=expired`);
    }

    // Cambia el estado a activa.
    user.accountStatus = "Activa";

    // Guarda la fecha de verificación.
    user.emailVerifiedAt = new Date();

    // Limpia el token para que el link no se pueda volver a usar.
    user.emailVerificationToken = null;

    // Limpia la expiración.
    user.emailVerificationExpiresAt = null;

    // Guarda cambios.
    await user.save();

    // Redirige al login con éxito.
    return res.redirect(`${loginUrl}?verified=1`);
  } catch (error) {
    // Si el JWT ya expiró, redirige con motivo expired.
    if (error.name === "TokenExpiredError") {
      return res.redirect(`${loginUrl}?verified=0&reason=expired`);
    }

    // Log del error.
    console.error("Error verificando correo:", error);

    // Redirige con error genérico.
    return res.redirect(`${loginUrl}?verified=0&reason=invalid`);
  }
};

// Endpoint de logout.
const logout = async (_req, res) => {
  // Responde logout exitoso.
  return res.json({ message: "Logout exitoso" });
};

// Exporta todo lo necesario.
module.exports = {
  authenticateToken,
  buildAuthUser,
  generateJwt,
  generateToken,
  googleAuth,
  logout,
  verifyEmail,
  verifyGoogleCredential,
  verifyTwoFactorCode
};

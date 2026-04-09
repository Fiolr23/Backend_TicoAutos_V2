const bcrypt = require("bcryptjs");
// Importa jsonwebtoken para generar JWT de verificación.
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { buildAuthUser, generateJwt, verifyGoogleCredential } = require("../middleware/auth");
const { sendVerificationEmail } = require("../utils/sendGrid");

// Verifica que tenga formato: texto@texto.dominio
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Valida que la cédula tenga exactamente 9 dígitos numéricos
// Convierte a string, elimina espacios y aplica regex
const isValidCedula = (cedula) => /^\d{9}$/.test(`${cedula || ""}`.trim());

// Secret para firmar el JWT de verificación de correo.
const EMAIL_VERIFICATION_SECRET = process.env.EMAIL_VERIFICATION_SECRET || "email-verification-secret";

// Tiempo de expiración del JWT de verificación.
const EMAIL_VERIFICATION_EXPIRES_IN = process.env.EMAIL_VERIFICATION_EXPIRES_IN || "1d";

// Función simple para calcular fecha de expiración real en la BD.
const getVerificationExpirationDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

// Genera el JWT que viajará en el correo.
const generateEmailVerificationToken = (user) =>
  jwt.sign(
    {
      // Guarda el id del usuario.
      userId: user._id,
      // Guarda el correo del usuario.
      email: user.email,
      // Guarda el propósito del token para saber que es de verificación.
      purpose: "email_verification"
    },
    // Secret usado para firmar el token.
    EMAIL_VERIFICATION_SECRET,
    // Configura la expiración del JWT.
    { expiresIn: EMAIL_VERIFICATION_EXPIRES_IN }
  );

// Función que consulta el API del padrón
// Sirve para validar si la cédula existe y obtener datos reales
const getPadronData = async (cedula) => {

  // URL del API del padrón (usa variable de entorno o localhost por defecto)
  const padronUrl = process.env.PADRON_API_URL || "http://localhost:3001/index.php";

  // Hace la petición GET al padrón enviando la cédula como parámetro
  const response = await fetch(`${padronUrl}?cedula=${encodeURIComponent(cedula)}`);

  // Convierte la respuesta a JSON (si falla, retorna objeto vacío)
  const data = await response.json().catch(() => ({}));

  // Si la respuesta HTTP no es exitosa indica error
  if (!response.ok) {
    return {
      ok: false, 
      status: response.status,
      message: data.message || data.error || "No se pudo validar la cedula en el padron",
    };
  }

  // Si el padrón no devuelve los datos esperados, se considera inválida
  if (!data?.nombre || !data?.apellidoPaterno || !data?.apellidoMaterno) {
    return {
      ok: false,
      status: 404,
      message: "La cedula no existe en el padron",
    };
  }

  // Si todo sale bien, retorna los datos normalizados
  return {
    ok: true,
    data: {
      // Usa la cédula del padrón o la enviada
      cedula: `${data.cedula || cedula}`.trim(),

      // Nombre limpio sin espacios extra
      nombre: `${data.nombre}`.trim(),

      // Apellido paterno limpio
      apellidoPaterno: `${data.apellidoPaterno}`.trim(),

      // Apellido materno limpio
      apellidoMaterno: `${data.apellidoMaterno}`.trim(),
    },
  };
};

// Endpoint que valida la cédula desde el frontend
// Se usa para autocompletar nombre y apellidos
const validateCedula = async (req, res) => {
  try {
    // Obtiene la cédula desde query params (?cedula=...)
    const cedula = `${req.query.cedula || ""}`.trim();

    // Valida formato de la cédula
    if (!isValidCedula(cedula)) {
      return res.status(400).json({ message: "La cedula debe tener exactamente 9 digitos" });
    }

    // Consulta el padrón
    const padronResult = await getPadronData(cedula);

    // Si falla la consulta o la cédula no existe
    if (!padronResult.ok) {
      return res.status(padronResult.status).json({ message: padronResult.message });
    }

    // Si todo es correcto, retorna los datos al frontend
    return res.json({
      cedula: padronResult.data.cedula,
      nombre: padronResult.data.nombre,
      apellidoPaterno: padronResult.data.apellidoPaterno,
      apellidoMaterno: padronResult.data.apellidoMaterno,
    });

  } catch (error) {
    // Captura errores internos del servidor
    console.error("Error validando cedula en padron:", error);

    return res.status(500).json({ message: "No se pudo validar la cedula" });
  }
};

// Endpoint para registrar un usuario
const register = async (req, res) => {
  try {
    // Extrae datos del body (POST)
    const { cedula, email, password } = req.body;

    // Valida que todos los campos existan
    if (!cedula || !email || !password) {
      return res.status(400).json({ message: "Cedula, correo y contraseña son requeridos" });
    }

    // Valida formato de cédula
    if (!isValidCedula(cedula)) {
      return res.status(400).json({ message: "La cedula debe tener exactamente 9 digitos" });
    }

    // Valida formato de correo
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Correo inválido" });
    }

    // Valida longitud mínima de contraseña
    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    // Consulta nuevamente el padrón (seguridad backend)
    // Evita que el usuario se salte validaciones del frontend
    const padronResult = await getPadronData(cedula.trim());

    // Si la cédula no es válida en padrón
    if (!padronResult.ok) {
      return res.status(400).json({ message: "La cedula no existe o no pudo validarse en el padron" });
    }

    // Verifica si ya existe un usuario con ese correo
    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) {
      return res.status(409).json({ message: "Ya existe un usuario con ese correo" });
    }

    // Verifica si ya existe un usuario con esa cédula
    const cedulaExists = await User.findOne({ cedula: cedula.trim() });
    if (cedulaExists) {
      return res.status(409).json({ message: "Ya existe un usuario con esa cedula" });
    }

    // Encripta la contraseña usando bcrypt (salt rounds = 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Une los dos apellidos en un solo campo "lastname"
    // Esto se hace para no modificar el resto del proyecto
    const lastname = `${padronResult.data.apellidoPaterno} ${padronResult.data.apellidoMaterno}`.trim();

    // Crea el nuevo usuario en la base de datos
    const newUser = await User.create({
      cedula: padronResult.data.cedula,
      name: padronResult.data.nombre,
      lastname,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      accountStatus: "Pendiente", // La cuenta queda pendiente hasta verificar correo
    });

    // Genera el JWT de verificación usando el usuario ya creado.
    const emailVerificationToken = generateEmailVerificationToken(newUser);

    // Guarda el JWT en la base para que sea de un solo uso.
    newUser.emailVerificationToken = emailVerificationToken;

    // Guarda la expiración del token en la base.
    newUser.emailVerificationExpiresAt = getVerificationExpirationDate();

    // Guarda los cambios.
    await newUser.save();

    try {
      // Envía el correo real con SendGrid.
      await sendVerificationEmail({
        to: newUser.email,
        name: newUser.name,
        token: emailVerificationToken
      });
    } catch (emailError) {
      // Muestra el error del correo en consola.
      console.error("Error enviando correo de verificacion:", emailError?.response?.body || emailError);

      // Si falla el envío, elimina el usuario recién creado para no dejar basura.
      await User.findByIdAndDelete(newUser._id);

      // Devuelve error al cliente.
      return res.status(500).json({
        message: "No se pudo enviar el correo de verificacion. Intenta nuevamente."
      });
    }

    // Responde éxito de registro.
    return res.status(201).json({
      message: "Registro exitoso. Revisa tu correo para activar la cuenta",
      user: {
        id: newUser._id,
        cedula: newUser.cedula,
        name: newUser.name,
        lastname: newUser.lastname,
        email: newUser.email,
        accountStatus: newUser.accountStatus
      }
    });
  } catch (error) {
    // Log de error interno.
    console.error("Error en register:", error);
    // Respuesta genérica.
    return res.status(500).json({ message: "Error registrando usuario" });
  }
};

// Registro con Google.
// El usuario no se crea al hacer clic en Google por primera vez.
// Solo se crea cuando la cuenta Google ya fue verificada y además la cédula
// pasó la validación existente contra el padrón.
const registerWithGoogle = async (req, res) => {
  try {
    const { credential, cedula } = req.body;

    // Extrae la credencial y la cédula.
    if (!credential || !cedula) {
      return res.status(400).json({ message: "La credencial de Google y la cedula son requeridas" });
    }

    if (!isValidCedula(cedula)) {
      return res.status(400).json({ message: "La cedula debe tener exactamente 9 digitos" });
    }

    let payload;

    try {
      // Verifica la credencial de Google.
      payload = await verifyGoogleCredential(credential);
    } catch (error) {
      console.error("Error validando Google en registerWithGoogle:", error);

      return res.status(error.message.includes("GOOGLE_CLIENT_ID") ? 500 : 401).json({
        message: error.message.includes("GOOGLE_CLIENT_ID")
          ? "Google no esta configurado en el servidor"
          : "No se pudo validar la cuenta de Google",
      });
    }

    const googleId = `${payload.sub}`.trim();
    const email = `${payload.email}`.toLowerCase().trim();

    const googleUserExists = await User.findOne({ googleId });
    if (googleUserExists) {
      return res.status(409).json({
        message: "Esta cuenta de Google ya fue registrada. Usa Acceder con Google.",
      });
    }

    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(409).json({ message: "Ya existe un usuario con ese correo" });
    }

    const cedulaExists = await User.findOne({ cedula: cedula.trim() });
    if (cedulaExists) {
      return res.status(409).json({ message: "Ya existe un usuario con esa cedula" });
    }

    const padronResult = await getPadronData(cedula.trim());

    if (!padronResult.ok) {
      return res.status(400).json({ message: "La cedula no existe o no pudo validarse en el padron" });
    }

    const lastname = `${padronResult.data.apellidoPaterno} ${padronResult.data.apellidoMaterno}`.trim();

    const newUser = await User.create({
      cedula: padronResult.data.cedula,
      name: padronResult.data.nombre,
      lastname,
      email,
      googleId,
      accountStatus: "Activa",
      emailVerifiedAt: new Date()
    });

    const token = generateJwt(newUser);

    return res.status(201).json({
      message: "Registro con Google exitoso",
      token,
      user: buildAuthUser(newUser),
    });
  } catch (error) {
    console.error("Error en registerWithGoogle:", error);
    return res.status(500).json({ message: "Error registrando usuario con Google" });
  }
};

module.exports = { register, registerWithGoogle, validateCedula };

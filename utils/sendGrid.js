// Importa el cliente oficial de SendGrid.
const sgMail = require("@sendgrid/mail");

// Lee la API key desde variables de entorno.
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";

// Lee el correo remitente desde variables de entorno.
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";

// Lee el nombre remitente desde variables de entorno.
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "TicoAutos";

// Lee la URL base del backend.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

// Si existe API key, la configura en SendGrid.
if (SENDGRID_API_KEY) {
  // Configura la autenticación del SDK.
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// Función que envía el correo de verificación.
const sendVerificationEmail = async ({ to, name, token }) => {
  // Si falta la API key, lanza error.
  if (!SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY no configurado");
  }

  // Si falta el correo remitente, lanza error.
  if (!SENDGRID_FROM_EMAIL) {
    throw new Error("SENDGRID_FROM_EMAIL no configurado");
  }

  // Construye el link único que abrirá el usuario.
  const verificationLink = `${BACKEND_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  // Construye el mensaje que se enviará.
  const msg = {
    // Correo destino.
    to,
    // Correo remitente.
    from: {
      // Email remitente verificado en SendGrid.
      email: SENDGRID_FROM_EMAIL,
      // Nombre visible del remitente.
      name: SENDGRID_FROM_NAME
    },
    // Asunto del correo.
    subject: "Activa tu cuenta de TicoAutos",
    // Versión en texto plano del correo.
    text:
      `Hola ${name || ""},\n\n` +
      `Gracias por registrarte en TicoAutos.\n` +
      `Para activar tu cuenta, haz click en este enlace:\n\n` +
      `${verificationLink}\n\n` +
      `Si no fuiste tu, puedes ignorar este correo.`,
    // Versión HTML del correo.
    html:
      `<h2>Hola ${name || ""}</h2>` +
      `<p>Gracias por registrarte en <strong>TicoAutos</strong>.</p>` +
      `<p>Para activar tu cuenta, haz clic en este enlace:</p>` +
      `<p><a href="${verificationLink}">Activar cuenta</a></p>` +
      `<p>Si no fuiste tu, puedes ignorar este correo.</p>`
  };

  // Envía el correo real usando SendGrid.
  await sgMail.send(msg);
};

// Exporta la función para usarla en el registro.
module.exports = { sendVerificationEmail };

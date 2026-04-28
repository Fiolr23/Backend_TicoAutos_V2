const twilio = require("twilio");

// Credenciales de Twilio leidas desde .env.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";

// Crea el cliente de Twilio solo si hay credenciales.
const client = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

const sendTwoFactorCode = async ({ to, code }) => {
  // Valida que Twilio este configurado.
  if (!client) {
    throw new Error("Twilio no esta configurado");
  }

  // Valida que exista el numero remitente.
  if (!TWILIO_PHONE_NUMBER) {
    throw new Error("TWILIO_PHONE_NUMBER no configurado");
  }

  // Envia el codigo real por SMS al telefono del usuario.
  await client.messages.create({
    body: `Tu codigo de TicoAutos es: ${code}`,
    from: TWILIO_PHONE_NUMBER,
    to
  });
};

module.exports = { sendTwoFactorCode };

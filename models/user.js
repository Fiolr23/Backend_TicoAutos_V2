const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Se agrega cedula al usuario.
    // No se separan los apellidos en la base para no romper el resto del proyecto,
    // que actualmente ya trabaja con un solo lastname.
    cedula: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    lastname: { 
        type: String, 
        required: true, 
        trim: true 
    },
    email: { 
        type: String,
        required: true, 
        unique: true, 
        trim: true, 
        lowercase: true 
    },
    // Se guarda el identificador estable que Google entrega en "sub".
    // Solo existe cuando la cuenta fue creada con Google.
    googleId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    password: { // se guarda hasheada para cuentas locales
        type: String
    },

    // Telefono usado para enviar el codigo 2FA por SMS.
    phone: {
        type: String,
        trim: true
    },

    // Codigo 2FA guardado como hash con bcrypt.
    twoFactorCode: {
      type: String,
      default: null
    },

    // Fecha y hora en que vence el codigo 2FA.
    twoFactorCodeExpires: {
      type: Date,
      default: null
    },

    accountStatus: {
      // El tipo es texto.
      type: String,
      // Solo permite estos dos valores.
      enum: ["Pendiente", "Activa"],
      // Por defecto una cuenta nueva queda activa.
      // Luego en el registro local la pondremos manualmente en Pendiente.
      default: "Activa",
      // Elimina espacios extras.
      trim: true
    },

    // Guarda el JWT de verificación que se envía por correo.
    emailVerificationToken: {
      type: String,
      default: null
    },

    // Guarda la fecha de expiración del JWT de verificación.
    emailVerificationExpiresAt: {
      type: Date,
      default: null
    },

    // Guarda cuándo fue verificado el correo.
    emailVerifiedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);


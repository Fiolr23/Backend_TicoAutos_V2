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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

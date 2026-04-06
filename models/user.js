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
    password: { // se guarda hasheada
        type: String, 
        required: true 
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

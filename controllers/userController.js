const bcrypt = require("bcryptjs");
const User = require("../models/user");

//Valida que el correo vaya en formato de correo
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const register = async (req, res) => {
  try {
    const { name, lastname, email, password } = req.body;

    if (!name || !lastname || !email || !password) {
      return res.status(400).json({ message: "Nombre, apellido, correo y contraseña son requeridos" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Correo inválido" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    // Evitar correos repetidos
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ message: "Ya existe un usuario con ese correo" });
    }

    // Hashear contraseña antes de guardar
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name.trim(),
      lastname: lastname.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    // No devolver password
    return res.status(201).json({
      message: "Registro exitoso",
      user: { id: newUser._id, name: newUser.name, lastname: newUser.lastname, email: newUser.email },
    });
  } catch (error) {
    console.error("Error en register:", error);
    return res.status(500).json({ message: "Error registrando usuario" });
  }
};

module.exports = { register };
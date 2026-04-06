const bcrypt = require("bcryptjs");
const User = require("../models/user");

// Verifica que tenga formato: texto@texto.dominio
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Valida que la cédula tenga exactamente 9 dígitos numéricos
// Convierte a string, elimina espacios y aplica regex
const isValidCedula = (cedula) => /^\d{9}$/.test(`${cedula || ""}`.trim());

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
    });

    // Respuesta exitosa 
    return res.status(201).json({
      message: "Registro exitoso",
      user: {
        id: newUser._id,
        cedula: newUser.cedula,
        name: newUser.name,
        lastname: newUser.lastname,
        email: newUser.email,
      },
    });

  } catch (error) {
    console.error("Error en register:", error);
    return res.status(500).json({ message: "Error registrando usuario" });
  }
};

module.exports = { register, validateCedula };
const express = require("express");
const router = express.Router();
const { register, validateCedula } = require("../controllers/userController");

// Este endpoint lo usa el formulario para consultar MI backend
// y obtener nombre + apellidos desde el padron.
router.get("/validate-cedula", validateCedula);

router.post("/register", register);

module.exports = router;
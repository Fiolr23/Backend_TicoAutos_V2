const express = require("express");
const router = express.Router();
const { register, registerWithGoogle, validateCedula } = require("../controllers/userController");

// Este endpoint lo usa el formulario para consultar MI backend
// y obtener nombre + apellidos desde el padron.
router.get("/validate-cedula", validateCedula);

router.post("/register", register);
router.post("/register-google", registerWithGoogle);

module.exports = router;

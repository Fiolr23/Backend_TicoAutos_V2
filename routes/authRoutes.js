const express = require("express");
const router = express.Router();

const { generateToken, googleAuth, authenticateToken, logout, verifyEmail } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", generateToken);

// POST /api/auth/google
router.post("/google", googleAuth);

// Ruta que verifica el correo al abrir el link.
router.get("/verify-email", verifyEmail);

// POST /api/auth/logout (protegida)
router.post("/logout", authenticateToken, logout);

// GET /api/auth/me (protegida) para probar token fácil
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    message: "Token válido",
    user: { id: req.user._id, name: req.user.name, lastname: req.user.lastname, email: req.user.email, accountStatus: req.user.accountStatus },
  });
});

module.exports = router;

const express = require("express");
const router = express.Router();

const { generateToken, authenticateToken, logout } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", generateToken);

// POST /api/auth/logout (protegida)
router.post("/logout", authenticateToken, logout);

// GET /api/auth/me (protegida) para probar token fácil
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    message: "Token válido",
    user: { id: req.user._id, name: req.user.name, lastname: req.user.lastname, email: req.user.email },
  });
});

module.exports = router;
const express = require("express");

const { authenticateToken } = require("../middleware/auth");
const { uploadVehicleImages } = require("../middleware/uploadVehicleImages");
const {
  vehicleDelete,
  vehicleGet,
  vehicleGetById,
  vehicleGetMine,
  vehiclePost,
  vehiclePut,
} = require("../controllers/crudVehiculosController");
const {
  vehiclePatchSold,
  vehiclePatchStatus,
} = require("../controllers/vehicleController");

const router = express.Router();

// Centraliza errores de multer para las imagenes del vehiculo.
const runVehicleUpload = (req, res, next) => {
  uploadVehicleImages(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return next();
  });
};

// GET /api/vehicles
router.get("/", vehicleGet);

// GET /api/vehicles/mine
router.get("/mine", authenticateToken, vehicleGetMine);

// GET /api/vehicles/:id
router.get("/:id", vehicleGetById);

// POST /api/vehicles
router.post("/", authenticateToken, runVehicleUpload, vehiclePost);

// PUT /api/vehicles/:id
router.put("/:id", authenticateToken, runVehicleUpload, vehiclePut);

// DELETE /api/vehicles/:id
router.delete("/:id", authenticateToken, vehicleDelete);

// Compatibilidad con la ruta anterior.
router.patch("/:id/sold", authenticateToken, vehiclePatchSold);

// PATCH /api/vehicles/:id/status
router.patch("/:id/status", authenticateToken, vehiclePatchStatus);

module.exports = router;

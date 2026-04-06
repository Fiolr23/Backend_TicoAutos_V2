const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const Vehicle = require("../models/vehicle");
const { VALID_STATUSES } = require("../validations/vehicleValidation");

const VEHICLE_UPLOADS_DIR = path.join(__dirname, "..", "uploads", "vehicles");
const OWNER_FIELDS = "name lastname email";

// Valida si el id tiene formato ObjectId.
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Borra archivos temporales cuando algo falla.
const cleanupUploadedFiles = async (files = []) => {
  await Promise.all(
    files.map(async (file) => {
      const filename = path.basename(file.filename || file.path || "");
      if (!filename) {
        return;
      }

      try {
        await fs.unlink(path.join(VEHICLE_UPLOADS_DIR, filename));
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("No se pudo borrar el archivo temporal:", error);
        }
      }
    })
  );
};

// Borra imagenes viejas del vehiculo.
const cleanupImagePaths = async (imagePaths = []) => {
  await Promise.all(
    imagePaths.map(async (imagePath) => {
      const filename = path.basename(imagePath || "");
      if (!filename) {
        return;
      }

      try {
        await fs.unlink(path.join(VEHICLE_UPLOADS_DIR, filename));
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("No se pudo borrar la imagen del vehiculo:", error);
        }
      }
    })
  );
};

// Convierte la imagen subida al path publico.
const toPublicImagePath = (file) => `/uploads/vehicles/${path.basename(file.filename || file.path || "")}`;

// Agrega owner cuando el usuario viene poblado.
const serializeVehicle = (vehicle) => {
  const data = vehicle?.toObject ? vehicle.toObject() : vehicle;
  const owner = data?.userId && typeof data.userId === "object" ? data.userId : null;

  return {
    ...data,
    owner,
  };
};

// Da formato a respuestas paginadas.
const buildPaginatedResponse = (results, total, page, limit) => ({
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  page,
  limit,
  results: results.map(serializeVehicle),
});

// Responde un error y limpia archivos si hace falta.
const sendError = async (res, status, message, files = []) => {
  if (files.length) {
    await cleanupUploadedFiles(files);
  }

  return res.status(status).json({ message });
};

// Busca el vehiculo con datos del propietario.
const findVehicleWithOwner = (vehicleId) => Vehicle.findById(vehicleId).populate("userId", OWNER_FIELDS);

// Devuelve el vehiculo ya serializado.
const sendVehicleResponse = async (res, vehicleId, status = 200) => {
  const vehicle = await findVehicleWithOwner(vehicleId);
  return res.status(status).json(serializeVehicle(vehicle));
};

// Busca el vehiculo y valida propiedad.
const getOwnedVehicleOrFail = async (req, res, options = {}) => {
  const {
    files = [],
    forbiddenMessage = "No puedes modificar este vehiculo",
  } = options;
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    await sendError(res, 400, "ID de vehiculo invalido", files);
    return null;
  }

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    await sendError(res, 404, "Vehiculo no encontrado", files);
    return null;
  }

  if (vehicle.userId.toString() !== req.user._id.toString()) {
    await sendError(res, 403, forbiddenMessage, files);
    return null;
  }

  return vehicle;
};

// PATCH para cambiar el estado del vehiculo.
const vehiclePatchStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: "El estado del vehiculo es invalido" });
    }

    const vehicle = await getOwnedVehicleOrFail(req, res, {
      forbiddenMessage: "No puedes actualizar este vehiculo",
    });
    if (!vehicle) {
      return;
    }

    vehicle.status = status;
    await vehicle.save();

    return sendVehicleResponse(res, vehicle._id);
  } catch (error) {
    console.error("Error actualizando el estado del vehiculo:", error);
    return res.status(500).json({ message: "No se pudo actualizar el estado del vehiculo" });
  }
};

// PATCH de compatibilidad para marcarlo vendido.
const vehiclePatchSold = async (req, res) => {
  req.body.status = "vendido";
  return vehiclePatchStatus(req, res);
};

module.exports = {
  OWNER_FIELDS,
  buildPaginatedResponse,
  cleanupImagePaths,
  cleanupUploadedFiles,
  findVehicleWithOwner,
  getOwnedVehicleOrFail,
  isValidObjectId,
  sendError,
  sendVehicleResponse,
  serializeVehicle,
  toPublicImagePath,
  vehiclePatchSold,
  vehiclePatchStatus,
};

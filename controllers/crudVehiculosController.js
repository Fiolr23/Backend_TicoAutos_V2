const Vehicle = require("../models/vehicle");
const {
  buildVehicleFilters,
  normalizeKeepImages,
  validateVehiclePayload,
} = require("../validations/vehicleValidation");
const {
  OWNER_FIELDS,
  buildPaginatedResponse,
  cleanupImagePaths,
  findVehicleWithOwner,
  getOwnedVehicleOrFail,
  isValidObjectId,
  sendError,
  sendVehicleResponse,
  serializeVehicle,
  toPublicImagePath,
} = require("./vehicleController");

// GET /api/vehicles
const vehicleGet = async (req, res) => {
  try {
    // Construye filtros, paginación y límites desde query params
    const { filters, page, limit, skip } = buildVehicleFilters(req.query);

    // Ejecuta búsqueda y conteo total en paralelo
    const [results, total] = await Promise.all([
      Vehicle.find(filters)
        .populate("userId", OWNER_FIELDS) // Incluye datos del dueño
        .sort({ createdAt: -1 }) // Ordena por más recientes
        .skip(skip)
        .limit(limit),
      Vehicle.countDocuments(filters),
    ]);

    // Retorna respuesta paginada
    return res.json(buildPaginatedResponse(results, total, page, limit));
  } catch (error) {
    console.error("Error listando vehiculos:", error);
    return res.status(500).json({ message: "No se pudieron cargar los vehiculos" });
  }
};

// GET /api/vehicles/mine
const vehicleGetMine = async (req, res) => {
  try {
    // Obtiene paginación
    const { page, limit, skip } = buildVehicleFilters(req.query);

    // Filtra solo vehículos del usuario autenticado
    const filters = { userId: req.user._id };

    const [results, total] = await Promise.all([
      Vehicle.find(filters)
        .populate("userId", OWNER_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Vehicle.countDocuments(filters),
    ]);

    return res.json(buildPaginatedResponse(results, total, page, limit));
  } catch (error) {
    console.error("Error listando mis vehiculos:", error);
    return res.status(500).json({ message: "No se pudieron cargar tus vehiculos" });
  }
};

// GET /api/vehicles/:id
const vehicleGetById = async (req, res) => {
  try {
    const { id } = req.params;

    // Valida que el ID tenga formato correcto
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID de vehiculo invalido" });
    }

    // Busca vehículo con datos del dueño
    const vehicle = await findVehicleWithOwner(id);

    // Si no existe, retorna 404
    if (!vehicle) {
      return res.status(404).json({ message: "Vehiculo no encontrado" });
    }

    // Devuelve vehículo serializado
    return res.json(serializeVehicle(vehicle));
  } catch (error) {
    console.error("Error cargando el vehiculo:", error);
    return res.status(500).json({ message: "No se pudo cargar el vehiculo" });
  }
};

// POST /api/vehicles
const vehiclePost = async (req, res) => {
  // Archivos subidos (imágenes)
  const uploadedFiles = req.files || [];

  try {
    // Valida datos del vehículo
    const validation = validateVehiclePayload(req.body, {
      requireImages: true,
      imageCount: uploadedFiles.length,
    });

    // Si falla validación, retorna error 400
    if (!validation.ok) {
      return sendError(res, 400, validation.message, uploadedFiles);
    }

    // Crea el vehículo en la base de datos
    const vehicle = await Vehicle.create({
      ...validation.data,
      userId: req.user._id, // Asigna dueño
      images: uploadedFiles.map(toPublicImagePath), // Guarda rutas de imágenes
    });

    // Retorna respuesta con status 201 (creado)
    return sendVehicleResponse(res, vehicle._id, 201);
  } catch (error) {
    await sendError(res, 500, "No se pudo crear el vehiculo", uploadedFiles);
    console.error("Error creando vehiculo:", error);
  }
};

// PUT /api/vehicles/:id
const vehiclePut = async (req, res) => {
  const uploadedFiles = req.files || [];

  try {
    // Verifica que el vehículo pertenezca al usuario
    const vehicle = await getOwnedVehicleOrFail(req, res, {
      files: uploadedFiles,
      forbiddenMessage: "No puedes editar este vehiculo",
    });
    if (!vehicle) return;

    // Mantiene imágenes seleccionadas y agrega nuevas
    const keepImages = normalizeKeepImages(req.body.keepImages)
      .filter((image) => vehicle.images.includes(image));

    const nextImages = [...keepImages, ...uploadedFiles.map(toPublicImagePath)];

    // Valida mínimo 1 imagen
    if (!nextImages.length) {
      return sendError(res, 400, "Debes conservar o subir al menos una imagen", uploadedFiles);
    }

    // Máximo 6 imágenes
    if (nextImages.length > 6) {
      return sendError(res, 400, "Solo puedes guardar hasta 6 imagenes", uploadedFiles);
    }

    // Valida datos del body
    const validation = validateVehiclePayload(req.body, {
      requireImages: false,
      imageCount: nextImages.length,
    });

    if (!validation.ok) {
      return sendError(res, 400, validation.message, uploadedFiles);
    }

    // Detecta imágenes eliminadas
    const removedImages = vehicle.images.filter(
      (image) => !keepImages.includes(image)
    );

    // Actualiza datos del vehículo
    Object.assign(vehicle, validation.data, { images: nextImages });
    await vehicle.save();

    // Elimina imágenes del servidor
    await cleanupImagePaths(removedImages);

    return sendVehicleResponse(res, vehicle._id);
  } catch (error) {
    await sendError(res, 500, "No se pudo actualizar el vehiculo", uploadedFiles);
    console.error("Error actualizando vehiculo:", error);
  }
};

// DELETE /api/vehicles/:id
const vehicleDelete = async (req, res) => {
  try {
    // Verifica que el vehículo sea del usuario
    const vehicle = await getOwnedVehicleOrFail(req, res, {
      forbiddenMessage: "No puedes eliminar este vehiculo",
    });
    if (!vehicle) return;

    // Guarda imágenes para eliminarlas después
    const imagesToDelete = [...vehicle.images];

    // Elimina el vehículo de la base de datos
    await vehicle.deleteOne();

    // Limpia imágenes del servidor
    await cleanupImagePaths(imagesToDelete);

    return res.json({ message: "Vehiculo eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando vehiculo:", error);
    return res.status(500).json({ message: "No se pudo eliminar el vehiculo" });
  }
};

module.exports = {
  vehicleDelete,
  vehicleGet,
  vehicleGetById,
  vehicleGetMine,
  vehiclePost,
  vehiclePut,
};
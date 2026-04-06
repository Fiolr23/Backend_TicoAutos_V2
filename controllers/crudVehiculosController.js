const mongoose = require("mongoose");
const Vehicle = require("../models/vehicle");
const {
  buildImagesForCreate,
  cleanupImagePaths,
  resolveImagesForUpdate,
  sendImageError,
  validateImagesForUpdate,
} = require("./vehicleImageController");

const OWNER_FIELDS = "name lastname email";
const VALID_STATUSES = ["disponible", "vendido"];
const VALID_TRANSMISSIONS = ["manual", "automatica", "cvt"];
const VALID_FUEL_TYPES = ["gasolina", "diesel", "electrico", "hibrido"];

// Valida si el id recibido en req.params puede usarse como ObjectId.
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Convierte textos del body para evitar espacios sobrantes.
const normalizeText = (value) => value?.trim();

// Convierte numeros del body o query.
// Si viene vacio devuelve null, y si viene invalido devuelve NaN.
const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Agrega owner cuando userId viene poblado.
// Esto mantiene la misma forma de respuesta que ya usa el frontend.
const serializeVehicle = (vehicle) => {
  const data = vehicle?.toObject ? vehicle.toObject() : vehicle;
  const owner = data?.userId && typeof data.userId === "object" ? data.userId : null;

  return {
    ...data,
    owner,
  };
};

// Formato comun para respuestas paginadas del listado.
const buildPaginatedResponse = (results, total, page, limit) => ({
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  page,
  limit,
  results: results.map(serializeVehicle),
});

// Busca el vehiculo con datos del propietario.
const findVehicleWithOwner = (vehicleId) =>
  Vehicle.findById(vehicleId).populate("userId", OWNER_FIELDS);

// Reutiliza la respuesta de detalle despues de crear, editar o cambiar estado.
const sendVehicleResponse = async (res, vehicleId, status = 200) => {
  const vehicle = await findVehicleWithOwner(vehicleId);
  return res.status(status).json(serializeVehicle(vehicle));
};

// Construye filtros y paginacion del listado.
// Se mantiene dentro de crudVehicle porque corresponde al listado de vehiculos.
const buildVehicleFilters = (query) => {
  const filters = {};

  if (query.brand) {
    filters.brand = { $regex: query.brand.trim(), $options: "i" };
  }

  if (query.model) {
    filters.model = { $regex: query.model.trim(), $options: "i" };
  }

  if (query.status && VALID_STATUSES.includes(query.status)) {
    filters.status = query.status;
  }

  const minYear = parseNumber(query.minYear);
  const maxYear = parseNumber(query.maxYear);
  if (minYear !== null || maxYear !== null) {
    filters.year = {};
    if (minYear !== null && !Number.isNaN(minYear)) {
      filters.year.$gte = minYear;
    }
    if (maxYear !== null && !Number.isNaN(maxYear)) {
      filters.year.$lte = maxYear;
    }
  }

  const minPrice = parseNumber(query.minPrice);
  const maxPrice = parseNumber(query.maxPrice);
  if (minPrice !== null || maxPrice !== null) {
    filters.price = {};
    if (minPrice !== null && !Number.isNaN(minPrice)) {
      filters.price.$gte = minPrice;
    }
    if (maxPrice !== null && !Number.isNaN(maxPrice)) {
      filters.price.$lte = maxPrice;
    }
  }

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(query.limit, 10) || 9));
  const skip = (page - 1) * limit;

  return { filters, page, limit, skip };
};

// Valida y normaliza exclusivamente datos del vehiculo.
// Las imagenes no se procesan aqui; solo se revisa la cantidad cuando aplica.
const validateVehiclePayload = (body, options = {}) => {
  const {
    requireImages = false,
    imageCount = 0,
  } = options;

  const brand = normalizeText(body.brand);
  const model = normalizeText(body.model);
  const color = normalizeText(body.color);
  const description = normalizeText(body.description) || "";
  const location = normalizeText(body.location) || "";
  const transmission = normalizeText(body.transmission) || "";
  const fuelType = normalizeText(body.fuelType) || "";
  const year = parseNumber(body.year);
  const price = parseNumber(body.price);
  const mileage = parseNumber(body.mileage);

  // Campos minimos del vehiculo.
  if (!brand || !model || !color || year === null || price === null) {
    return {
      ok: false,
      message: "Marca, modelo, ano, precio y color son obligatorios",
    };
  }

  if (Number.isNaN(year) || year < 1900 || year > new Date().getFullYear() + 1) {
    return { ok: false, message: "El ano del vehiculo es invalido" };
  }

  if (Number.isNaN(price) || price <= 0) {
    return { ok: false, message: "El precio debe ser mayor a 0" };
  }

  if (mileage !== null && (Number.isNaN(mileage) || mileage < 0)) {
    return { ok: false, message: "El kilometraje es invalido" };
  }

  if (transmission && !VALID_TRANSMISSIONS.includes(transmission)) {
    return { ok: false, message: "La transmision es invalida" };
  }

  if (fuelType && !VALID_FUEL_TYPES.includes(fuelType)) {
    return { ok: false, message: "El tipo de combustible es invalido" };
  }

  if (description.length > 1000) {
    return { ok: false, message: "La descripcion no puede superar 1000 caracteres" };
  }

  // Se conserva esta validacion porque ya formaba parte del flujo actual.
  if (requireImages && imageCount < 1) {
    return { ok: false, message: "Debes subir al menos una imagen del vehiculo" };
  }

  return {
    ok: true,
    data: {
      brand,
      model,
      year,
      price,
      color,
      description,
      location,
      mileage: mileage ?? 0,
      transmission: transmission || "manual",
      fuelType: fuelType || "gasolina",
      status: VALID_STATUSES.includes(body.status) ? body.status : "disponible",
    },
  };
};

// Busca el vehiculo y valida propiedad.
// req se usa para leer params y el usuario autenticado.
// res se usa para devolver el error exacto cuando algo falla.
const getOwnedVehicleOrFail = async (req, res, options = {}) => {
  const {
    forbiddenMessage = "No puedes modificar este vehiculo",
    onError,
  } = options;
  const { id } = req.params;

  const sendError = async (status, message) => {
    if (typeof onError === "function") {
      return onError(status, message);
    }

    return res.status(status).json({ message });
  };

  if (!isValidObjectId(id)) {
    await sendError(400, "ID de vehiculo invalido");
    return null;
  }

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    await sendError(404, "Vehiculo no encontrado");
    return null;
  }

  if (vehicle.userId.toString() !== req.user._id.toString()) {
    await sendError(403, forbiddenMessage);
    return null;
  }

  return vehicle;
};

// GET /api/vehicles
const vehicleGet = async (req, res) => {
  try {
    // req.query trae filtros y paginacion desde la URL.
    const { filters, page, limit, skip } = buildVehicleFilters(req.query);

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
    console.error("Error listando vehiculos:", error);
    return res.status(500).json({ message: "No se pudieron cargar los vehiculos" });
  }
};

// GET /api/vehicles/mine
const vehicleGetMine = async (req, res) => {
  try {
    // req.user viene del middleware de auth y permite filtrar solo mis vehiculos.
    const { page, limit, skip } = buildVehicleFilters(req.query);
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

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID de vehiculo invalido" });
    }

    const vehicle = await findVehicleWithOwner(id);

    if (!vehicle) {
      return res.status(404).json({ message: "Vehiculo no encontrado" });
    }

    return res.json(serializeVehicle(vehicle));
  } catch (error) {
    console.error("Error cargando el vehiculo:", error);
    return res.status(500).json({ message: "No se pudo cargar el vehiculo" });
  }
};

// POST /api/vehicles
const vehiclePost = async (req, res) => {
  // req.files llega desde multer con las imagenes subidas.
  const uploadedFiles = req.files || [];

  try {
    // Primero se validan los datos del vehiculo.
    // La cantidad de imagenes se pasa como apoyo, pero el manejo real de imagenes
    // queda delegado al controlador de imagenes.
    const validation = validateVehiclePayload(req.body, {
      requireImages: true,
      imageCount: uploadedFiles.length,
    });

    if (!validation.ok) {
      return sendImageError(res, 400, validation.message, uploadedFiles);
    }

    const vehicle = await Vehicle.create({
      ...validation.data,
      userId: req.user._id,
      images: buildImagesForCreate(uploadedFiles),
    });

    return sendVehicleResponse(res, vehicle._id, 201);
  } catch (error) {
    await sendImageError(res, 500, "No se pudo crear el vehiculo", uploadedFiles);
    console.error("Error creando vehiculo:", error);
  }
};

// PUT /api/vehicles/:id
const vehiclePut = async (req, res) => {
  const uploadedFiles = req.files || [];

  try {
    // Se valida que el vehiculo exista y sea del usuario autenticado.
    // Si algo falla, tambien se limpian las imagenes nuevas para no dejarlas huerfanas.
    const vehicle = await getOwnedVehicleOrFail(req, res, {
      forbiddenMessage: "No puedes editar este vehiculo",
      onError: (status, message) => sendImageError(res, status, message, uploadedFiles),
    });

    if (!vehicle) {
      return;
    }

    // La logica de conservar, agregar y quitar imagenes se resuelve fuera de crudVehicle.
    const { nextImages, removedImages } = resolveImagesForUpdate({
      currentImages: vehicle.images,
      keepImagesInput: req.body.keepImages,
      uploadedFiles,
    });

    const imageError = validateImagesForUpdate(nextImages);
    if (imageError) {
      return sendImageError(res, 400, imageError, uploadedFiles);
    }

    // Luego se validan los datos del vehiculo ya con la cantidad final de imagenes.
    const validation = validateVehiclePayload(req.body, {
      requireImages: false,
      imageCount: nextImages.length,
    });

    if (!validation.ok) {
      return sendImageError(res, 400, validation.message, uploadedFiles);
    }

    // Se actualiza el documento con los datos del body y con las imagenes finales.
    Object.assign(vehicle, validation.data, { images: nextImages });
    await vehicle.save();

    // Solo despues de guardar se eliminan del disco las imagenes quitadas.
    await cleanupImagePaths(removedImages);

    return sendVehicleResponse(res, vehicle._id);
  } catch (error) {
    await sendImageError(res, 500, "No se pudo actualizar el vehiculo", uploadedFiles);
    console.error("Error actualizando vehiculo:", error);
  }
};

// DELETE /api/vehicles/:id
const vehicleDelete = async (req, res) => {
  try {
    const vehicle = await getOwnedVehicleOrFail(req, res, {
      forbiddenMessage: "No puedes eliminar este vehiculo",
    });

    if (!vehicle) {
      return;
    }

    // Se guardan las rutas para borrar tambien las imagenes fisicas del servidor.
    const imagesToDelete = [...vehicle.images];

    await vehicle.deleteOne();
    await cleanupImagePaths(imagesToDelete);

    return res.json({ message: "Vehiculo eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando vehiculo:", error);
    return res.status(500).json({ message: "No se pudo eliminar el vehiculo" });
  }
};

// PATCH /api/vehicles/:id/status
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

// PATCH de compatibilidad para mantener la ruta anterior.
const vehiclePatchSold = async (req, res) => {
  req.body.status = "vendido";
  return vehiclePatchStatus(req, res);
};

module.exports = {
  vehicleDelete,
  vehicleGet,
  vehicleGetById,
  vehicleGetMine,
  vehiclePatchSold,
  vehiclePatchStatus,
  vehiclePost,
  vehiclePut,
};

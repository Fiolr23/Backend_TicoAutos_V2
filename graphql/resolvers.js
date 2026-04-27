const mongoose = require("mongoose");

const User = require("../models/user");
const Vehicle = require("../models/vehicle");
const { cleanupImagePaths } = require("../controllers/vehicleImageController");

const OWNER_FIELDS = "name lastname email accountStatus";
const VALID_STATUSES = ["disponible", "vendido"];
const VALID_TRANSMISSIONS = ["manual", "automatica", "cvt"];
const VALID_FUEL_TYPES = ["gasolina", "diesel", "electrico", "hibrido"];

// Obliga a tener usuario autenticado en queries y mutations privadas.
function requireAuth(ctx) {
  if (!ctx.user) {
    const err = new Error("Authentication token required");
    err.extensions = { code: "UNAUTHENTICATED" };
    throw err;
  }

  return ctx.user;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function normalizeText(value) {
  return value?.trim();
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// Reutiliza reglas simples del CRUD de vehiculos.
function validateVehicleInput(input = {}, options = {}) {
  const { requireImages = false } = options;

  const brand = normalizeText(input.brand);
  const model = normalizeText(input.model);
  const color = normalizeText(input.color);
  const description = normalizeText(input.description) || "";
  const location = normalizeText(input.location) || "";
  const transmission = normalizeText(input.transmission) || "";
  const fuelType = normalizeText(input.fuelType) || "";
  const year = parseNumber(input.year);
  const price = parseNumber(input.price);
  const mileage = parseNumber(input.mileage);
  const images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];

  if (!brand || !model || !color || year === null || price === null) {
    throw new Error("Marca, modelo, ano, precio y color son obligatorios");
  }

  if (Number.isNaN(year) || year < 1900 || year > new Date().getFullYear() + 1) {
    throw new Error("El ano del vehiculo es invalido");
  }

  if (Number.isNaN(price) || price <= 0) {
    throw new Error("El precio debe ser mayor a 0");
  }

  if (mileage !== null && (Number.isNaN(mileage) || mileage < 0)) {
    throw new Error("El kilometraje es invalido");
  }

  if (transmission && !VALID_TRANSMISSIONS.includes(transmission)) {
    throw new Error("La transmision es invalida");
  }

  if (fuelType && !VALID_FUEL_TYPES.includes(fuelType)) {
    throw new Error("El tipo de combustible es invalido");
  }

  if (description.length > 1000) {
    throw new Error("La descripcion no puede superar 1000 caracteres");
  }

  if (requireImages && !images.length) {
    throw new Error("Debes subir al menos una imagen del vehiculo");
  }

  if (images.length > 6) {
    throw new Error("Solo puedes guardar hasta 6 imagenes");
  }

  return {
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
    status: VALID_STATUSES.includes(input.status) ? input.status : "disponible",
    images,
  };
}

function buildVehicleFilters(args = {}) {
  const filters = {};

  if (args.brand) {
    filters.brand = { $regex: args.brand.trim(), $options: "i" };
  }

  if (args.model) {
    filters.model = { $regex: args.model.trim(), $options: "i" };
  }

  if (args.status && VALID_STATUSES.includes(args.status)) {
    filters.status = args.status;
  }

  const minYear = parseNumber(args.minYear);
  const maxYear = parseNumber(args.maxYear);
  if (minYear !== null || maxYear !== null) {
    filters.year = {};
    if (minYear !== null && !Number.isNaN(minYear)) {
      filters.year.$gte = minYear;
    }
    if (maxYear !== null && !Number.isNaN(maxYear)) {
      filters.year.$lte = maxYear;
    }
  }

  const minPrice = parseNumber(args.minPrice);
  const maxPrice = parseNumber(args.maxPrice);
  if (minPrice !== null || maxPrice !== null) {
    filters.price = {};
    if (minPrice !== null && !Number.isNaN(minPrice)) {
      filters.price.$gte = minPrice;
    }
    if (maxPrice !== null && !Number.isNaN(maxPrice)) {
      filters.price.$lte = maxPrice;
    }
  }

  return filters;
}

async function findVehicles(filters = {}, options = {}) {
  const limit = options.limit ? Math.max(1, Math.min(24, Number(options.limit) || 24)) : null;
  const query = Vehicle.find(filters).populate("userId", OWNER_FIELDS).sort({ createdAt: -1 });

  if (limit) {
    query.limit(limit);
  }

  return query;
}

async function findVehicleWithOwner(id) {
  return Vehicle.findById(id).populate("userId", OWNER_FIELDS);
}

async function getOwnedVehicleOrThrow(id, userId, message = "No puedes modificar este vehiculo") {
  if (!isValidObjectId(id)) {
    const err = new Error("ID de vehiculo invalido");
    err.extensions = { code: "BAD_USER_INPUT" };
    throw err;
  }

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    const err = new Error("Vehiculo no encontrado");
    err.extensions = { code: "NOT_FOUND" };
    throw err;
  }

  if (vehicle.userId.toString() !== userId.toString()) {
    const err = new Error(message);
    err.extensions = { code: "FORBIDDEN" };
    throw err;
  }

  return vehicle;
}

const resolvers = {
  User: {
    id: (doc) => String(doc._id),
  },

  Vehicle: {
    id: (doc) => String(doc._id),
    owner: async (doc) => {
      if (doc.userId && typeof doc.userId === "object" && doc.userId._id) {
        return doc.userId;
      }

      return User.findById(doc.userId);
    },
  },

  Query: {
    me: async (_parent, _args, ctx) => ctx.user,

    vehicles: async (_parent, args) => {
      const filters = buildVehicleFilters(args);
      return findVehicles(filters, { limit: args.limit });
    },

    vehicle: async (_parent, { id }) => {
      if (!isValidObjectId(id)) {
        const err = new Error("ID de vehiculo invalido");
        err.extensions = { code: "BAD_USER_INPUT" };
        throw err;
      }

      return findVehicleWithOwner(id);
    },

    myVehicles: async (_parent, _args, ctx) => {
      const user = requireAuth(ctx);
      return findVehicles({ userId: user._id });
    },
  },

  Mutation: {
    createVehicle: async (_parent, { input }, ctx) => {
      const user = requireAuth(ctx);
      const payload = validateVehicleInput(input, { requireImages: true });

      const vehicle = await Vehicle.create({
        ...payload,
        userId: user._id,
      });

      return findVehicleWithOwner(vehicle._id);
    },

    updateVehicle: async (_parent, { id, input, keepImages = [] }, ctx) => {
      const user = requireAuth(ctx);
      const vehicle = await getOwnedVehicleOrThrow(id, user._id, "No puedes editar este vehiculo");
      const safeKeepImages = Array.isArray(keepImages)
        ? keepImages.filter((image) => vehicle.images.includes(image))
        : [];
      const nextImages = [
        ...safeKeepImages,
        ...((Array.isArray(input.images) ? input.images : []).filter(Boolean)),
      ];

      const payload = validateVehicleInput({ ...input, images: nextImages }, { requireImages: false });
      const removedImages = vehicle.images.filter((image) => !safeKeepImages.includes(image));

      Object.assign(vehicle, payload, { images: nextImages });
      await vehicle.save();
      await cleanupImagePaths(removedImages);

      return findVehicleWithOwner(vehicle._id);
    },

    deleteVehicle: async (_parent, { id }, ctx) => {
      const user = requireAuth(ctx);
      const vehicle = await getOwnedVehicleOrThrow(id, user._id, "No puedes eliminar este vehiculo");
      const imagesToDelete = [...vehicle.images];

      await vehicle.deleteOne();
      await cleanupImagePaths(imagesToDelete);

      return true;
    },

    updateVehicleStatus: async (_parent, { id, status }, ctx) => {
      const user = requireAuth(ctx);

      if (!VALID_STATUSES.includes(status)) {
        const err = new Error("El estado del vehiculo es invalido");
        err.extensions = { code: "BAD_USER_INPUT" };
        throw err;
      }

      const vehicle = await getOwnedVehicleOrThrow(id, user._id, "No puedes actualizar este vehiculo");
      vehicle.status = status;
      await vehicle.save();

      return findVehicleWithOwner(vehicle._id);
    },

    markVehicleSold: async (_parent, { id }, ctx) => {
      const user = requireAuth(ctx);
      const vehicle = await getOwnedVehicleOrThrow(id, user._id, "No puedes actualizar este vehiculo");
      vehicle.status = "vendido";
      await vehicle.save();

      return findVehicleWithOwner(vehicle._id);
    },
  },
};

module.exports = {
  resolvers,
};

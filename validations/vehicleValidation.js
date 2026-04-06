const VALID_STATUSES = ["disponible", "vendido"];
const VALID_TRANSMISSIONS = ["manual", "automatica", "cvt"];
const VALID_FUEL_TYPES = ["gasolina", "diesel", "electrico", "hibrido"];

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeText = (value) => value?.trim();

const normalizeKeepImages = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => item?.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => `${item}`.trim()).filter(Boolean);
      }
    } catch (_error) {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

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

module.exports = {
  VALID_FUEL_TYPES,
  VALID_STATUSES,
  VALID_TRANSMISSIONS,
  buildVehicleFilters,
  normalizeKeepImages,
  validateVehiclePayload,
};

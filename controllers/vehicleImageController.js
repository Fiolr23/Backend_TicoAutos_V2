const fs = require("fs/promises");
const path = require("path");

const VEHICLE_UPLOADS_DIR = path.join(__dirname, "..", "uploads", "vehicles");

// Convierte el archivo subido por multer a la ruta publica guardada en MongoDB.
const toPublicImagePath = (file) => `/uploads/vehicles/${path.basename(file.filename || file.path || "")}`;

// Borra archivos recien subidos cuando el flujo falla despues de pasar por multer.
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

// Borra imagenes que ya estaban asociadas al vehiculo y fueron eliminadas del CRUD.
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

// Centraliza la respuesta de error cuando ya hubo carga de imagenes.
// Asi el CRUD no mezcla demasiado la logica de vehiculos con limpieza de archivos.
const sendImageError = async (res, status, message, files = []) => {
  if (files.length) {
    await cleanupUploadedFiles(files);
  }

  return res.status(status).json({ message });
};

// En creacion solo se guardan las imagenes nuevas subidas en req.files.
const buildImagesForCreate = (uploadedFiles = []) => uploadedFiles.map(toPublicImagePath);

// Normaliza keepImages porque desde el frontend puede venir como:
// - array
// - string
// - texto JSON
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

// En edicion:
// 1. conserva solo imagenes que ya pertenecen al vehiculo
// 2. agrega las nuevas subidas
// 3. detecta cuales imagenes viejas deben borrarse luego
const resolveImagesForUpdate = ({
  currentImages = [],
  keepImagesInput,
  uploadedFiles = [],
}) => {
  const keepImages = normalizeKeepImages(keepImagesInput)
    .filter((image) => currentImages.includes(image));

  const newImages = uploadedFiles.map(toPublicImagePath);
  const nextImages = [...keepImages, ...newImages];
  const removedImages = currentImages.filter((image) => !keepImages.includes(image));

  return {
    nextImages,
    removedImages,
  };
};

// Mantiene las mismas reglas actuales del CRUD:
// minimo 1 imagen y maximo 6.
const validateImagesForUpdate = (images = []) => {
  if (!images.length) {
    return "Debes conservar o subir al menos una imagen";
  }

  if (images.length > 6) {
    return "Solo puedes guardar hasta 6 imagenes";
  }

  return null;
};

module.exports = {
  buildImagesForCreate,
  cleanupImagePaths,
  resolveImagesForUpdate,
  sendImageError,
  validateImagesForUpdate,
};

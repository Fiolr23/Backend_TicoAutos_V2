const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    // Vehiculo sobre el que existe la conversacion.
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },

    // Propietario/publicador del vehiculo.
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Usuario interesado que hizo la consulta.
    interestedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Sirve para mostrar una vista previa realista en la bandeja.
    lastMessagePreview: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    // Ultima actividad del chat.
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Indica si el propietario todavia debe responder algo.
    hasPendingQuestion: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Cantidad de preguntas registradas en la conversacion.
    questionCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Un solo chat por vehiculo + propietario + interesado.
conversationSchema.index(
  { vehicleId: 1, ownerUserId: 1, interestedUserId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);

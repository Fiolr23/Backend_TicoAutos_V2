const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    // Conversacion a la que pertenece la pregunta.
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    askedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    answeredByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    questionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    answerText: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    status: {
      type: String,
      enum: ["pending", "answered"],
      default: "pending",
      index: true,
    },

    askedAt: {
      type: Date,
      default: Date.now,
    },

    answeredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Facilita obtener el historial ordenado de un chat.
questionSchema.index({ conversationId: 1, askedAt: 1 });

module.exports = mongoose.model("Question", questionSchema);

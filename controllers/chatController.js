const mongoose = require("mongoose");
const Vehicle = require("../models/vehicle");
const Question = require("../models/question");
const Conversation = require("../models/conversation");

const USER_SELECT = "name lastname email";
const VEHICLE_SELECT = "brand model year price color status images location";

const QUESTION_POPULATE = [
  { path: "vehicleId", select: VEHICLE_SELECT },
  { path: "ownerId", select: USER_SELECT },
  { path: "askedByUserId", select: USER_SELECT },
  { path: "answeredByUserId", select: USER_SELECT },
  {
    path: "conversationId",
    select: "vehicleId ownerUserId interestedUserId lastMessagePreview lastMessageAt hasPendingQuestion questionCount",
    populate: [
      { path: "vehicleId", select: VEHICLE_SELECT },
      { path: "ownerUserId", select: USER_SELECT },
      { path: "interestedUserId", select: USER_SELECT },
    ],
  },
];

const CONVERSATION_POPULATE = [
  { path: "vehicleId", select: VEHICLE_SELECT },
  { path: "ownerUserId", select: USER_SELECT },
  { path: "interestedUserId", select: USER_SELECT },
];

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Determina si el usuario actual es propietario o interesado en ese chat.
const resolveConversationRole = (conversation, currentUserId) => {
  const ownerId = conversation.ownerUserId?._id?.toString() || conversation.ownerUserId?.toString();
  const interestedId =
    conversation.interestedUserId?._id?.toString() || conversation.interestedUserId?.toString();
  const userId = currentUserId.toString();

  const isOwner = ownerId === userId;
  const isInterested = interestedId === userId;

  return {
    isOwner,
    isInterested,
    otherUser: isOwner ? conversation.interestedUserId : conversation.ownerUserId,
  };
};

// Arma el resumen para la bandeja de chats.
const serializeChat = (conversation, currentUserId) => {
  const { isOwner, otherUser } = resolveConversationRole(conversation, currentUserId);

  return {
    _id: conversation._id,
    vehicle: conversation.vehicleId,
    ownerUser: conversation.ownerUserId,
    interestedUser: conversation.interestedUserId,
    otherUser,
    isOwner,
    questionCount: conversation.questionCount || 0,
    hasPendingQuestion: Boolean(conversation.hasPendingQuestion),
    lastActivityAt: conversation.lastMessageAt || conversation.updatedAt,
    lastMessagePreview: conversation.lastMessagePreview || "Sin mensajes registrados",
  };
};

// Carga toda la informacion necesaria para renderizar el chat.
const buildConversationPayload = async (conversation, currentUserId) => {
  const results = await Question.find({ conversationId: conversation._id })
    .populate(QUESTION_POPULATE)
    .sort({ askedAt: 1 });

  const { isOwner, otherUser } = resolveConversationRole(conversation, currentUserId);

  return {
    conversation,
    vehicle: conversation.vehicleId,
    ownerUser: conversation.ownerUserId,
    interestedUser: conversation.interestedUserId,
    otherUser,
    isOwner,
    canAsk: !isOwner && !results.some((question) => question.status === "pending"),
    results,
  };
};

const getChats = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      $or: [{ interestedUserId: req.user._id }, { ownerUserId: req.user._id }],
    })
      .populate(CONVERSATION_POPULATE)
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    return res.json({
      results: conversations.map((conversation) => serializeChat(conversation, req.user._id)),
    });
  } catch (error) {
    console.error("Error loading chats:", error);
    return res.status(500).json({ message: "No fue posible cargar los chats." });
  }
};

const getConversationMessages = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "El identificador de la conversacion no es valido." });
    }

    const conversation = await Conversation.findById(conversationId).populate(CONVERSATION_POPULATE);

    if (!conversation) {
      return res.status(404).json({ message: "La conversacion solicitada no fue encontrada." });
    }

    const { isOwner, isInterested } = resolveConversationRole(conversation, req.user._id);

    if (!isOwner && !isInterested) {
      return res.status(403).json({ message: "No puedes acceder a esta conversacion." });
    }

    const payload = await buildConversationPayload(conversation, req.user._id);
    return res.json(payload);
  } catch (error) {
    console.error("Error loading conversation messages:", error);
    return res.status(500).json({ message: "No fue posible cargar la conversacion." });
  }
};

// Sirve para abrir el chat desde la pagina del vehiculo.
// Si todavia no existe, devuelve contexto vacio para que el interesado mande la primera pregunta.
const getVehicleConversation = async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;

    if (!isValidObjectId(vehicleId)) {
      return res.status(400).json({ message: "El identificador del vehiculo no es valido." });
    }

    const vehicle = await Vehicle.findById(vehicleId).populate("userId", USER_SELECT);

    if (!vehicle) {
      return res.status(404).json({ message: "El vehiculo solicitado no fue encontrado." });
    }

    if (vehicle.userId._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        message: "Como propietario debes abrir la conversacion desde tu bandeja de chats para elegir al interesado correcto.",
      });
    }

    const conversation = await Conversation.findOne({
      vehicleId,
      ownerUserId: vehicle.userId._id,
      interestedUserId: req.user._id,
    }).populate(CONVERSATION_POPULATE);

    if (!conversation) {
      return res.json({
        conversation: null,
        vehicle,
        ownerUser: vehicle.userId,
        interestedUser: req.user,
        otherUser: vehicle.userId,
        isOwner: false,
        canAsk: true,
        results: [],
      });
    }

    const payload = await buildConversationPayload(conversation, req.user._id);
    return res.json(payload);
  } catch (error) {
    console.error("Error loading vehicle conversation:", error);
    return res.status(500).json({ message: "No fue posible cargar el chat del vehiculo." });
  }
};

module.exports = {
  getChats,
  getConversationMessages,
  getVehicleConversation,
};

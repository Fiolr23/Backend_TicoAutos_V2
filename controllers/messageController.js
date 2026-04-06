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

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Busca el chat exacto por vehiculo + propietario + interesado.
// Si no existe, lo crea.
const findOrCreateConversation = async ({ vehicleId, ownerUserId, interestedUserId }) => {
  const filters = { vehicleId, ownerUserId, interestedUserId };

  const existingConversation = await Conversation.findOne(filters);
  if (existingConversation) {
    return existingConversation;
  }

  try {
    return await Conversation.create({
      ...filters,
      lastMessageAt: new Date(),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return Conversation.findOne(filters);
    }

    throw error;
  }
};

const askQuestion = async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;
    const questionText = req.body.questionText?.trim();

    if (!isValidObjectId(vehicleId)) {
      return res.status(400).json({ message: "El identificador del vehiculo no es valido." });
    }

    if (!questionText) {
      return res.status(400).json({ message: "Debes ingresar una pregunta." });
    }

    if (questionText.length > 1000) {
      return res.status(400).json({ message: "La pregunta no puede superar los 1000 caracteres." });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: "El vehiculo solicitado no fue encontrado." });
    }

    if (vehicle.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "No puedes realizar preguntas sobre tu propio vehiculo." });
    }

    const conversation = await findOrCreateConversation({
      vehicleId,
      ownerUserId: vehicle.userId,
      interestedUserId: req.user._id,
    });

    // Se mantiene la logica base:
    // no se puede preguntar de nuevo hasta que respondan la anterior en ese mismo chat.
    const pendingQuestion = await Question.findOne({
      conversationId: conversation._id,
      status: "pending",
    });

    if (pendingQuestion) {
      return res.status(409).json({
        message: "Ya tienes una pregunta pendiente en este chat. Debes esperar la respuesta del propietario.",
      });
    }

    const askedAt = new Date();

    const question = await Question.create({
      conversationId: conversation._id,
      vehicleId,
      ownerId: vehicle.userId,
      askedByUserId: req.user._id,
      questionText,
      askedAt,
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      $set: {
        hasPendingQuestion: true,
        lastMessageAt: askedAt,
        lastMessagePreview: `Pregunta: ${questionText}`,
      },
      $inc: { questionCount: 1 },
    });

    const populatedQuestion = await Question.findById(question._id).populate(QUESTION_POPULATE);

    return res.status(201).json({
      conversationId: conversation._id,
      question: populatedQuestion,
    });
  } catch (error) {
    console.error("Error creating question:", error);
    return res.status(500).json({ message: "No fue posible registrar la pregunta." });
  }
};

const answerQuestion = async (req, res) => {
  try {
    const questionId = req.params.id;
    const answerText = req.body.answerText?.trim();

    if (!isValidObjectId(questionId)) {
      return res.status(400).json({ message: "El identificador de la pregunta no es valido." });
    }

    if (!answerText) {
      return res.status(400).json({ message: "Debes ingresar una respuesta." });
    }

    if (answerText.length > 1000) {
      return res.status(400).json({ message: "La respuesta no puede superar los 1000 caracteres." });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "La pregunta solicitada no fue encontrada." });
    }

    if (question.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Solo el propietario del vehiculo puede responder esta pregunta." });
    }

    if (question.status === "answered") {
      return res.status(400).json({ message: "Esta pregunta ya fue respondida anteriormente." });
    }

    question.answerText = answerText;
    question.answeredAt = new Date();
    question.answeredByUserId = req.user._id;
    question.status = "answered";
    await question.save();

    await Conversation.findByIdAndUpdate(question.conversationId, {
      $set: {
        hasPendingQuestion: false,
        lastMessageAt: question.answeredAt,
        lastMessagePreview: `Respuesta: ${answerText}`,
      },
    });

    const populatedQuestion = await Question.findById(question._id).populate(QUESTION_POPULATE);

    return res.json({
      conversationId: question.conversationId,
      question: populatedQuestion,
    });
  } catch (error) {
    console.error("Error answering question:", error);
    return res.status(500).json({ message: "No fue posible registrar la respuesta." });
  }
};

module.exports = {
  askQuestion,
  answerQuestion,
};

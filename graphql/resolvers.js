const mongoose = require("mongoose");
const { GraphQLError } = require("graphql");
const Vehicle = require("../models/vehicle");
const Conversation = require("../models/conversation");
const Question = require("../models/question");

const USER_SELECT = "name lastname email accountStatus";
const VEHICLE_SELECT =
  "userId brand model year price color mileage transmission fuelType location description status images createdAt updatedAt";

const QUESTION_POPULATE = [
  {
    path: "vehicleId",
    select: VEHICLE_SELECT,
    populate: { path: "userId", select: USER_SELECT },
  },
  { path: "ownerId", select: USER_SELECT },
  { path: "askedByUserId", select: USER_SELECT },
  { path: "answeredByUserId", select: USER_SELECT },
];

const CONVERSATION_POPULATE = [
  {
    path: "vehicleId",
    select: VEHICLE_SELECT,
    populate: { path: "userId", select: USER_SELECT },
  },
  { path: "ownerUserId", select: USER_SELECT },
  { path: "interestedUserId", select: USER_SELECT },
];

const VALID_STATUSES = ["disponible", "vendido"];

// Convierte ids de Mongo a texto.
const toId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toString();
};

// Lanza el mismo error de autenticacion desde GraphQL.
const requireUser = (context) => {
  if (!context.user) {
    throw new GraphQLError("Debes iniciar sesion para consultar esta informacion.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  return context.user;
};

// Valida ObjectId antes de consultar Mongo.
const ensureValidObjectId = (value, message) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new GraphQLError(message, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
};

// Mantiene la misma logica numerica que el REST.
const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Construye los filtros del listado de vehiculos.
const buildVehicleFilters = (args, currentUser) => {
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
    if (minYear !== null) {
      filters.year.$gte = minYear;
    }
    if (maxYear !== null) {
      filters.year.$lte = maxYear;
    }
  }

  const minPrice = parseNumber(args.minPrice);
  const maxPrice = parseNumber(args.maxPrice);
  if (minPrice !== null || maxPrice !== null) {
    filters.price = {};
    if (minPrice !== null) {
      filters.price.$gte = minPrice;
    }
    if (maxPrice !== null) {
      filters.price.$lte = maxPrice;
    }
  }

  if (args.mine) {
    filters.userId = currentUser._id;
  }

  const page = Math.max(1, Number.parseInt(args.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(args.limit, 10) || 9));
  const skip = (page - 1) * limit;

  return { filters, page, limit, skip };
};

// Convierte el usuario a una forma simple para GraphQL.
const mapUser = (user) => {
  if (!user) {
    return null;
  }

  const data = user.toObject ? user.toObject() : user;

  return {
    id: toId(data._id || data.id),
    name: data.name || "",
    lastname: data.lastname || "",
    email: data.email || "",
    accountStatus: data.accountStatus || null,
  };
};

// Convierte el vehiculo y deja el owner listo si vino poblado.
const mapVehicle = (vehicle) => {
  if (!vehicle) {
    return null;
  }

  const data = vehicle.toObject ? vehicle.toObject() : vehicle;
  const ownerDoc = data.userId && typeof data.userId === "object" ? data.userId : null;

  return {
    id: toId(data._id || data.id),
    userId: toId(ownerDoc ? ownerDoc._id : data.userId),
    owner: mapUser(ownerDoc),
    brand: data.brand,
    model: data.model,
    year: data.year,
    price: data.price,
    color: data.color,
    mileage: data.mileage,
    transmission: data.transmission,
    fuelType: data.fuelType,
    location: data.location,
    description: data.description,
    status: data.status,
    images: data.images || [],
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : null,
    updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
  };
};

// Reutiliza la misma deteccion de rol que ya existe en REST.
const resolveConversationRole = (conversation, currentUserId) => {
  const ownerId = toId(conversation.ownerUserId?._id || conversation.ownerUserId);
  const interestedId = toId(conversation.interestedUserId?._id || conversation.interestedUserId);
  const userId = toId(currentUserId);

  const isOwner = ownerId === userId;
  const isInterested = interestedId === userId;

  return {
    isOwner,
    isInterested,
    otherUser: isOwner ? conversation.interestedUserId : conversation.ownerUserId,
  };
};

// Convierte cada pregunta al formato GraphQL.
const mapQuestion = (question) => {
  if (!question) {
    return null;
  }

  const data = question.toObject ? question.toObject() : question;

  return {
    id: toId(data._id || data.id),
    questionText: data.questionText,
    answerText: data.answerText || "",
    status: data.status,
    askedAt: data.askedAt ? new Date(data.askedAt).toISOString() : null,
    answeredAt: data.answeredAt ? new Date(data.answeredAt).toISOString() : null,
    vehicle: mapVehicle(data.vehicleId),
    ownerUser: mapUser(data.ownerId),
    askedByUser: mapUser(data.askedByUserId),
    answeredByUser: mapUser(data.answeredByUserId),
  };
};

// Construye la vista detalle del chat.
const buildConversationPayload = (conversation, currentUserId, questions = []) => {
  const { isOwner, otherUser } = resolveConversationRole(conversation, currentUserId);
  const mappedQuestions = questions.map(mapQuestion);

  return {
    id: toId(conversation._id || conversation.id),
    vehicle: mapVehicle(conversation.vehicleId),
    ownerUser: mapUser(conversation.ownerUserId),
    interestedUser: mapUser(conversation.interestedUserId),
    otherUser: mapUser(otherUser),
    isOwner,
    canAsk: !isOwner && !mappedQuestions.some((question) => question.status === "pending"),
    questionCount: conversation.questionCount || mappedQuestions.length,
    hasPendingQuestion: Boolean(conversation.hasPendingQuestion),
    lastActivityAt: conversation.lastMessageAt
      ? new Date(conversation.lastMessageAt).toISOString()
      : conversation.updatedAt
        ? new Date(conversation.updatedAt).toISOString()
        : null,
    lastMessagePreview: conversation.lastMessagePreview || "Sin mensajes registrados",
    results: mappedQuestions,
  };
};

// Construye la tarjeta simple de la bandeja.
const buildConversationSummary = (conversation, currentUserId) =>
  buildConversationPayload(conversation, currentUserId, []);

// Carga preguntas de una conversacion ya autorizada.
const loadConversationQuestions = async (conversationId) =>
  Question.find({ conversationId })
    .populate(QUESTION_POPULATE)
    .sort({ askedAt: 1 });

const resolvers = {
  Query: {
    vehicles: async (_parent, args, context) => {
      const currentUser = args.mine ? requireUser(context) : context.user;
      const { filters, page, limit, skip } = buildVehicleFilters(args, currentUser);

      const [vehicles, total] = await Promise.all([
        Vehicle.find(filters)
          .populate("userId", USER_SELECT)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Vehicle.countDocuments(filters),
      ]);

      return {
        vehicles: vehicles.map(mapVehicle),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    },

    vehicle: async (_parent, { id }) => {
      ensureValidObjectId(id, "El identificador del vehiculo no es valido.");

      const vehicle = await Vehicle.findById(id).populate("userId", USER_SELECT);
      return mapVehicle(vehicle);
    },

    conversations: async (_parent, _args, context) => {
      const user = requireUser(context);

      const conversations = await Conversation.find({
        $or: [{ interestedUserId: user._id }, { ownerUserId: user._id }],
      })
        .populate(CONVERSATION_POPULATE)
        .sort({ lastMessageAt: -1, updatedAt: -1 });

      return conversations.map((conversation) => buildConversationSummary(conversation, user._id));
    },

    conversation: async (_parent, { id }, context) => {
      const user = requireUser(context);
      ensureValidObjectId(id, "El identificador de la conversacion no es valido.");

      const conversation = await Conversation.findById(id).populate(CONVERSATION_POPULATE);
      if (!conversation) {
        return null;
      }

      const { isOwner, isInterested } = resolveConversationRole(conversation, user._id);
      if (!isOwner && !isInterested) {
        throw new GraphQLError("No puedes acceder a esta conversacion.", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const questions = await loadConversationQuestions(conversation._id);
      return buildConversationPayload(conversation, user._id, questions);
    },

    vehicleConversation: async (_parent, { vehicleId }, context) => {
      const user = requireUser(context);
      ensureValidObjectId(vehicleId, "El identificador del vehiculo no es valido.");

      const vehicle = await Vehicle.findById(vehicleId).populate("userId", USER_SELECT);
      if (!vehicle) {
        return null;
      }

      const ownerId = toId(vehicle.userId?._id || vehicle.userId);
      if (ownerId === toId(user._id)) {
        throw new GraphQLError(
          "Como propietario debes abrir la conversacion desde tu bandeja de chats para elegir al interesado correcto.",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      const conversation = await Conversation.findOne({
        vehicleId,
        ownerUserId: ownerId,
        interestedUserId: user._id,
      }).populate(CONVERSATION_POPULATE);

      if (!conversation) {
        return {
          id: null,
          vehicle: mapVehicle(vehicle),
          ownerUser: mapUser(vehicle.userId),
          interestedUser: mapUser(user),
          otherUser: mapUser(vehicle.userId),
          isOwner: false,
          canAsk: true,
          questionCount: 0,
          hasPendingQuestion: false,
          lastActivityAt: null,
          lastMessagePreview: "Sin mensajes registrados",
          results: [],
        };
      }

      const questions = await loadConversationQuestions(conversation._id);
      return buildConversationPayload(conversation, user._id, questions);
    },
  },
};

module.exports = resolvers;

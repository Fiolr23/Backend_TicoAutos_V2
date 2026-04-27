module.exports = `#graphql
  type User {
    id: ID!
    name: String
    lastname: String
    email: String
    accountStatus: String
  }

  type Vehicle {
    id: ID!
    userId: ID!
    owner: User
    brand: String!
    model: String!
    year: Int!
    price: Float!
    color: String!
    mileage: Float
    transmission: String
    fuelType: String
    location: String
    description: String
    status: String!
    images: [String!]!
    createdAt: String
    updatedAt: String
  }

  type VehicleListResponse {
    vehicles: [Vehicle!]!
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  type Question {
    id: ID!
    questionText: String!
    answerText: String
    status: String!
    askedAt: String
    answeredAt: String
    vehicle: Vehicle
    ownerUser: User
    askedByUser: User
    answeredByUser: User
  }

  type Conversation {
    id: ID
    vehicle: Vehicle
    ownerUser: User
    interestedUser: User
    otherUser: User
    isOwner: Boolean!
    canAsk: Boolean!
    questionCount: Int!
    hasPendingQuestion: Boolean!
    lastActivityAt: String
    lastMessagePreview: String
    results: [Question!]!
  }

  type Query {
    vehicles(
      brand: String
      model: String
      status: String
      minYear: Int
      maxYear: Int
      minPrice: Float
      maxPrice: Float
      page: Int
      limit: Int
      mine: Boolean
    ): VehicleListResponse!
    vehicle(id: ID!): Vehicle
    conversations: [Conversation!]!
    conversation(id: ID!): Conversation
    vehicleConversation(vehicleId: ID!): Conversation
  }
`;

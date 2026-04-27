const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
    lastname: String!
    email: String!
    accountStatus: String!
  }

  type Vehicle {
    id: ID!
    brand: String!
    model: String!
    year: Int!
    price: Int!
    color: String!
    mileage: Int!
    transmission: String!
    fuelType: String!
    location: String!
    description: String!
    status: String!
    images: [String!]!
    owner: User
  }

  input VehicleInput {
    brand: String!
    model: String!
    year: Int!
    price: Int!
    color: String!
    mileage: Int
    transmission: String
    fuelType: String
    location: String
    description: String
    status: String
    images: [String!]
  }

  type Query {
    me: User
    vehicles(
      brand: String
      model: String
      status: String
      minYear: Int
      maxYear: Int
      minPrice: Int
      maxPrice: Int
      limit: Int
    ): [Vehicle!]!
    vehicle(id: ID!): Vehicle
    myVehicles: [Vehicle!]!
  }

  type Mutation {
    createVehicle(input: VehicleInput!): Vehicle!
    updateVehicle(id: ID!, input: VehicleInput!, keepImages: [String!]): Vehicle!
    deleteVehicle(id: ID!): Boolean!
    updateVehicleStatus(id: ID!, status: String!): Vehicle!
    markVehicleSold(id: ID!): Vehicle!
  }
`;

module.exports = {
  typeDefs,
};

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@as-integrations/express5");
const { ApolloServerPluginLandingPageLocalDefault } = require("@apollo/server/plugin/landingPage/default");

const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const messageRoutes = require("./routes/messageRoutes");
const typeDefs = require("./graphql/typeDefs");
const resolvers = require("./graphql/resolvers");
const { buildGraphqlContext } = require("./graphql/context");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/questions", messageRoutes);

const PORT = process.env.PORT || 3000;

// Inicia Apollo y Express en el mismo servidor.
const startServer = async () => {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true })],
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    expressMiddleware(apolloServer, {
      context: buildGraphqlContext,
    })
  );

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo conectado");
  app.listen(PORT, () => {
    console.log(`API en http://localhost:${PORT}`);
    console.log(`Apollo GraphQL en http://localhost:${PORT}/graphql`);
  });
};

startServer().catch((err) => {
    console.error("Error Mongo:", err);
    process.exit(1);
  });

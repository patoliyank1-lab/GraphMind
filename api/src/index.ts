import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars from the root .env file if available
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PORT = process.env.PORT || 4000;

// Minimal placeholder schema
const typeDefs = `#graphql
  type Query {
    health: String
  }
`;

const resolvers = {
  Query: {
    health: () => 'Introspect API is running',
  },
};

interface MyContext {
  // auth and DB access will be wired in here later
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer<MyContext>({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await server.start();

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Stub context function
        return {};
      },
    })
  );

  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
}

startServer().catch((err) => {
  console.error('Failed to start server', err);
});

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import * as dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';

import { typeDefs } from './schema/typeDefs';
import { resolvers } from './resolvers';
import { MyContext, createContext } from './context';

// Load env vars from the root .env file if available
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

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
        const baseContext = await createContext();
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            baseContext.user = { id: decoded.userId, email: decoded.email };
          } catch (e) {
            // Invalid token, ignore
          }
        }
        return baseContext;
      },
    })
  );

  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
}

startServer().catch((err) => {
  console.error('Failed to start server', err);
});

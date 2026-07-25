import { 
  Repo, 
  Build, 
  TestRun, 
  TestResult, 
  Deployment, 
  Environment,
  BuildStatus
} from '@prisma/client';
import { DateTimeResolver } from 'graphql-scalars';

import { prisma } from '../lib/prisma';
import { MyContext } from '../context';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;


export const resolvers = {
  DateTime: DateTimeResolver,

  Query: {
    health: () => 'Introspect API is running',
    hello: () => 'Hello from a new field the agent has never seen.',
    repos: () => {
      return prisma.repo.findMany();
    },
    repo: (_: unknown, { id }: { id: string }) => {
      return prisma.repo.findUnique({ where: { id } });
    },
    builds: (_: unknown, { repoId, status }: { repoId?: string; status?: BuildStatus }) => {
      const where: any = {};
      if (repoId) where.repoId = repoId;
      if (status) where.status = status;
      return prisma.build.findMany({ where });
    },
    deployments: (_: unknown, { repoId, environmentId }: { repoId?: string; environmentId?: string }) => {
      const where: any = {};
      if (repoId) where.repoId = repoId;
      if (environmentId) where.environmentId = environmentId;
      return prisma.deployment.findMany({ where });
    },
  },
  Mutation: {
    signup: async (_: unknown, { email, password }: any) => {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, password: hashedPassword }
      });
      return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET);
    },
    login: async (_: unknown, { email, password }: any) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new Error('Invalid credentials');
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new Error('Invalid credentials');
      return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET);
    },
    retriggerBuild: async (_: unknown, { buildId }: any, context: MyContext) => {
      if (!context.user) throw new Error('Authentication required');
      const original = await prisma.build.findUnique({ where: { id: buildId } });
      if (!original) throw new Error('Build not found');
      return prisma.build.create({
        data: {
          repoId: original.repoId,
          status: 'PENDING',
          branch: original.branch,
          commitSha: original.commitSha,
        }
      });
    }
  },
  Repo: {
    builds: (parent: Repo, _args: unknown, context: MyContext) => {
      return context.loaders.buildsByRepoLoader.load(parent.id);
    },
    deployments: (parent: Repo, _args: unknown, context: MyContext) => {
      return context.loaders.deploymentsByRepoLoader.load(parent.id);
    },
  },
  Build: {
    repo: (parent: Build) => {
      return prisma.repo.findUnique({ where: { id: parent.repoId } });
    },
    testRuns: (parent: Build, _args: unknown, context: MyContext) => {
      return context.loaders.testRunsByBuildLoader.load(parent.id);
    },
  },
  TestRun: {
    build: (parent: TestRun) => {
      return prisma.build.findUnique({ where: { id: parent.buildId } });
    },
    testResults: (parent: TestRun, _args: unknown, context: MyContext) => {
      return context.loaders.testResultsByTestRunLoader.load(parent.id);
    },
  },
  TestResult: {
    testRun: (parent: TestResult) => {
      return prisma.testRun.findUnique({ where: { id: parent.testRunId } });
    },
  },
  Deployment: {
    repo: (parent: Deployment) => {
      return prisma.repo.findUnique({ where: { id: parent.repoId } });
    },
    environment: (parent: Deployment) => {
      return prisma.environment.findUnique({ where: { id: parent.environmentId } });
    },
  },
  Environment: {
    deployments: (parent: Environment) => {
      return prisma.deployment.findMany({ where: { environmentId: parent.id } });
    }
  }
};

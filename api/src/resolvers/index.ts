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


export const resolvers = {
  DateTime: DateTimeResolver,

  Query: {
    health: () => 'Introspect API is running',
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

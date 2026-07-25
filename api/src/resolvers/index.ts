import { 
  Repo, 
  Build, 
  TestRun, 
  TestResult, 
  Deployment, 
  Environment,
  BuildStatus
} from '@prisma/client';

import { prisma } from '../lib/prisma';


export const resolvers = {
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
    // Naive resolvers (causes N+1)
    builds: (parent: Repo) => {
      return prisma.build.findMany({ where: { repoId: parent.id } });
    },
    deployments: (parent: Repo) => {
      return prisma.deployment.findMany({ where: { repoId: parent.id } });
    },
  },
  Build: {
    repo: (parent: Build) => {
      return prisma.repo.findUnique({ where: { id: parent.repoId } });
    },
    testRuns: (parent: Build) => {
      return prisma.testRun.findMany({ where: { buildId: parent.id } });
    },
  },
  TestRun: {
    build: (parent: TestRun) => {
      return prisma.build.findUnique({ where: { id: parent.buildId } });
    },
    testResults: (parent: TestRun) => {
      return prisma.testResult.findMany({ where: { testRunId: parent.id } });
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

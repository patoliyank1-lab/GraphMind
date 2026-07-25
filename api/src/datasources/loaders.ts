import DataLoader from 'dataloader';
import { Build, TestRun, TestResult, Deployment } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Groups an array of records by a foreign-key field, returning results
 * in the same order as the input keys. IDs with no matches get an empty array.
 */
function groupByKey<T>(keys: readonly string[], items: T[], keyFn: (item: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return keys.map((key) => map.get(key) ?? []);
}

/**
 * Creates a fresh set of DataLoader instances.
 * Must be called once per request so caching stays request-scoped.
 */
export function createLoaders() {
  const buildsByRepoLoader = new DataLoader<string, Build[]>(async (repoIds: readonly string[]) => {
    const builds = await prisma.build.findMany({
      where: { repoId: { in: [...repoIds] } },
    });
    return groupByKey(repoIds, builds, (b) => b.repoId);
  });

  const testRunsByBuildLoader = new DataLoader<string, TestRun[]>(async (buildIds: readonly string[]) => {
    const testRuns = await prisma.testRun.findMany({
      where: { buildId: { in: [...buildIds] } },
    });
    return groupByKey(buildIds, testRuns, (tr) => tr.buildId);
  });

  const testResultsByTestRunLoader = new DataLoader<string, TestResult[]>(async (testRunIds: readonly string[]) => {
    const testResults = await prisma.testResult.findMany({
      where: { testRunId: { in: [...testRunIds] } },
    });
    return groupByKey(testRunIds, testResults, (r) => r.testRunId);
  });

  const deploymentsByRepoLoader = new DataLoader<string, Deployment[]>(async (repoIds: readonly string[]) => {
    const deployments = await prisma.deployment.findMany({
      where: { repoId: { in: [...repoIds] } },
    });
    return groupByKey(repoIds, deployments, (d) => d.repoId);
  });

  return {
    buildsByRepoLoader,
    testRunsByBuildLoader,
    testResultsByTestRunLoader,
    deploymentsByRepoLoader,
  };
}

export type Loaders = ReturnType<typeof createLoaders>;

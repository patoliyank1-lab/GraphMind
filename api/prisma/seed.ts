import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Create Environments
  const envStaging = await prisma.environment.upsert({
    where: { name: 'staging' },
    update: {},
    create: { name: 'staging' },
  });
  const envProd = await prisma.environment.upsert({
    where: { name: 'production' },
    update: {},
    create: { name: 'production' },
  });

  // Create Repos
  const repoCoreApi = await prisma.repo.create({
    data: { name: 'core-api', description: 'Main backend API' },
  });
  const repoFrontend = await prisma.repo.create({
    data: { name: 'web-frontend', description: 'React web application' },
  });
  const repoMobile = await prisma.repo.create({
    data: { name: 'mobile-app', description: 'React Native mobile app' },
  });

  // Seed data for core-api
  const build1 = await prisma.build.create({
    data: {
      repoId: repoCoreApi.id,
      status: 'SUCCESS',
      branch: 'main',
      commitSha: 'a1b2c3d4e5f6',
      startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      finishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 300000), // + 5 mins
      testRuns: {
        create: {
          status: 'PASSED',
          durationMs: 15000,
          testResults: {
            create: [
              { testName: 'Auth spec', status: 'PASS' },
              { testName: 'Billing spec', status: 'PASS' },
            ],
          },
        },
      },
    },
  });

  const build2 = await prisma.build.create({
    data: {
      repoId: repoCoreApi.id,
      status: 'FAILED',
      branch: 'feature/auth',
      commitSha: 'f6e5d4c3b2a1',
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      finishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 400000),
      testRuns: {
        create: {
          status: 'FAILED',
          durationMs: 20000,
          testResults: {
            create: [
              { testName: 'Auth spec', status: 'FAIL', errorMessage: 'Expected 200 got 401' },
              { testName: 'Billing spec', status: 'PASS' },
            ],
          },
        },
      },
    },
  });

  // Seed flaky data for web-frontend
  for (let i = 0; i < 5; i++) {
    const isEven = i % 2 === 0;
    await prisma.build.create({
      data: {
        repoId: repoFrontend.id,
        status: isEven ? 'SUCCESS' : 'FAILED',
        branch: 'main',
        commitSha: `commit-${i}`,
        startedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        finishedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 120000),
        testRuns: {
          create: {
            status: isEven ? 'PASSED' : 'FLAKY',
            durationMs: 10000,
            testResults: {
              create: [
                {
                  testName: 'Login Button Render',
                  status: isEven ? 'PASS' : 'FAIL',
                  errorMessage: isEven ? null : 'Timeout waiting for selector',
                },
              ],
            },
          },
        },
      },
    });
  }

  // Deployments
  await prisma.deployment.create({
    data: {
      repoId: repoCoreApi.id,
      environmentId: envStaging.id,
      status: 'SUCCESS',
      deployedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.deployment.create({
    data: {
      repoId: repoCoreApi.id,
      environmentId: envProd.id,
      status: 'SUCCESS',
      deployedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export const typeDefs = `#graphql
  scalar DateTime

  enum BuildStatus {
    PENDING
    RUNNING
    SUCCESS
    FAILED
  }

  enum TestRunStatus {
    PASSED
    FAILED
    FLAKY
  }

  enum TestResultStatus {
    PASS
    FAIL
    SKIP
  }

  enum DeploymentStatus {
    PENDING
    SUCCESS
    FAILED
    ROLLED_BACK
  }

  type Repo {
    id: ID!
    name: String!
    description: String
    createdAt: DateTime!
    builds: [Build!]!
    deployments: [Deployment!]!
  }

  type Build {
    id: ID!
    repoId: ID!
    status: BuildStatus!
    branch: String!
    commitSha: String!
    startedAt: DateTime!
    finishedAt: DateTime
    repo: Repo!
    testRuns: [TestRun!]!
  }

  type TestRun {
    id: ID!
    buildId: ID!
    status: TestRunStatus!
    durationMs: Int!
    build: Build!
    testResults: [TestResult!]!
  }

  type TestResult {
    id: ID!
    testRunId: ID!
    testName: String!
    status: TestResultStatus!
    errorMessage: String
    testRun: TestRun!
  }

  type Environment {
    id: ID!
    name: String!
    deployments: [Deployment!]!
  }

  type Deployment {
    id: ID!
    repoId: ID!
    environmentId: ID!
    status: DeploymentStatus!
    deployedAt: DateTime!
    repo: Repo!
    environment: Environment!
  }

  type Query {
    health: String
    repos: [Repo!]!
    repo(id: ID!): Repo
    builds(repoId: ID, status: BuildStatus): [Build!]!
    deployments(repoId: ID, environmentId: ID): [Deployment!]!
  }
`;

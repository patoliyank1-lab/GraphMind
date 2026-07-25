import Groq from "groq-sdk";

// The endpoint for our local Apollo GraphQL API
const GRAPHQL_URL = "http://localhost:5000/graphql";

/**
 * Base utility to execute GraphQL queries against our API.
 * It sends the query and variables via a POST fetch request.
 * Throws errors if the HTTP request fails or if GraphQL returns errors.
 */
export async function executeQuery(query: string, variables: Record<string, any> = {}) {
  // Format the query output nicely for the terminal
  console.log(`\n--- [GraphQL Query Executed] ---`);
  console.log(query.trim());
  if (Object.keys(variables).length > 0) {
    console.log(`Variables:`, JSON.stringify(variables));
  }
  console.log(`--------------------------------\n`);

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  
  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }
  
  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  
  return data.data;
}

// ---------------------------------------------------------
// Tool Implementations (Functions that actually execute queries)
// ---------------------------------------------------------

/**
 * Tool: listRepos
 * Executes a basic query to fetch all repositories.
 */
export const listReposTool = async () => {
  return executeQuery(`
    query ListRepos {
      repos { id name description }
    }
  `);
};

/**
 * Tool: getRepoBuilds
 * Executes a query to fetch builds for a specific repository.
 * Optionally filters by the build status (e.g., SUCCESS, FAILED).
 */
export const getRepoBuildsTool = async (args: { repoId: string, status?: string }) => {
  return executeQuery(`
    query GetRepoBuilds($repoId: ID, $status: BuildStatus) {
      builds(repoId: $repoId, status: $status) {
        id branch commitSha status startedAt finishedAt
      }
    }
  `, { repoId: args.repoId, status: args.status });
};

/**
 * Tool: getDeployments
 * Executes a query to fetch deployments.
 * Optionally filters by repository ID and/or environment ID.
 */
export const getDeploymentsTool = async (args: { repoId?: string, environmentId?: string }) => {
  return executeQuery(`
    query GetDeployments($repoId: ID, $environmentId: ID) {
      deployments(repoId: $repoId, environmentId: $environmentId) {
        id status deployedAt
        repo { name }
        environment { name }
      }
    }
  `, { repoId: args.repoId, environmentId: args.environmentId });
};

/**
 * Tool: getFullRepoDetail
 * Executes a deeply nested query to fetch a repository's full state,
 * including builds, test runs, test results, and deployments.
 */
export const getFullRepoDetailTool = async (args: { repoId: string }) => {
  return executeQuery(`
    query GetFullRepoDetail($repoId: ID!) {
      repo(id: $repoId) {
        id name description createdAt
        builds {
          id branch commitSha status startedAt finishedAt
          testRuns {
            id status durationMs
            testResults { id testName status errorMessage }
          }
        }
        deployments {
          id status deployedAt
          environment { name }
        }
      }
    }
  `, { repoId: args.repoId });
};

// ---------------------------------------------------------
// Groq (OpenAI-compatible) Function Declarations
// ---------------------------------------------------------

export const tools: Groq.Chat.Completions.CompletionCreateParams.Tool[] = [
  {
    type: "function",
    function: {
      name: "listRepos",
      description: "Returns a list of all repositories with their IDs, names, and descriptions.",
      parameters: {
        type: "object",
        properties: {},
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getRepoBuilds",
      description: "Returns builds for a given repository. Optionally filter by status (PENDING, RUNNING, SUCCESS, FAILED).",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "The ID of the repository" },
          status: { type: "string", description: "Optional build status filter" }
        },
        required: ["repoId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getDeployments",
      description: "Returns a list of deployments. Can optionally be filtered by repository ID and/or environment ID.",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "Optional repository ID filter" },
          environmentId: { type: "string", description: "Optional environment ID filter" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getFullRepoDetail",
      description: "Returns detailed information about a single repository, including all its builds, test runs, test results, and deployments.",
      parameters: {
        type: "object",
        properties: {
          repoId: { type: "string", description: "The ID of the repository to get details for" }
        },
        required: ["repoId"]
      }
    }
  }
];

// ---------------------------------------------------------
// Tool Registry Map
// ---------------------------------------------------------
// Maps the string name of the tool (which the model returns) 
// to the actual TypeScript function that executes it.

export const toolsMap: Record<string, (args: any) => Promise<any>> = {
  listRepos: listReposTool,
  getRepoBuilds: getRepoBuildsTool,
  getDeployments: getDeploymentsTool,
  getFullRepoDetail: getFullRepoDetailTool,
};

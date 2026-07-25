import dotenv from "dotenv";
dotenv.config();

const GRAPHQL_URL = process.env.GRAPHQL_URL || "http://localhost:5000/graphql";

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        ...FullType
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: false) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
    }
    enumValues(includeDeprecated: false) {
      name
      description
    }
  }

  fragment InputValue on __InputValue {
    name
    description
    type {
      ...TypeRef
    }
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function fetchSchema() {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schema. Status ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL Introspection Error: ${JSON.stringify(result.errors)}`);
  }

  return result.data.__schema;
}

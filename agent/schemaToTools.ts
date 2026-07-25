import Groq from "groq-sdk";

export function generateTools(schema: any): Groq.Chat.Completions.CompletionCreateParams.Tool[] {
  const queryType = schema.types.find((t: any) => t.name === schema.queryType.name);
  const tools: Groq.Chat.Completions.CompletionCreateParams.Tool[] = [];

  for (const field of queryType.fields) {
    if (field.name.startsWith("__")) continue;

    // Fallback description if missing
    let description = field.description;
    if (!description) {
      const formattedName = field.name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
      description = `Fetches ${formattedName} data from the GraphQL API.`;
    }

    const properties: Record<string, any> = {};
    const required: string[] = [];

    let hasListArg = false;

    for (const arg of field.args) {
      let isNonNull = false;
      let currentType = arg.type;

      if (currentType.kind === "NON_NULL") {
        isNonNull = true;
        currentType = currentType.ofType;
        required.push(arg.name);
      }

      if (currentType.kind === "LIST") {
        hasListArg = true; // Known gap per spec
        continue;
      }

      let propType = "string";
      let enumValues: string[] | undefined = undefined;

      const baseTypeName = currentType.name;

      if (currentType.kind === "SCALAR") {
        if (baseTypeName === "Int" || baseTypeName === "Float") propType = "number";
        else if (baseTypeName === "Boolean") propType = "boolean";
        else propType = "string"; // String, ID, DateTime etc
      } else if (currentType.kind === "ENUM") {
        propType = "string";
        const enumType = schema.types.find((t: any) => t.name === baseTypeName);
        if (enumType && enumType.enumValues) {
          enumValues = enumType.enumValues.map((e: any) => e.name);
        }
      }

      properties[arg.name] = { type: propType };
      if (enumValues) {
        properties[arg.name].enum = enumValues;
      }
      
      properties[arg.name].description = arg.description || `The ${arg.name} argument`;
    }

    // Skip tools that require LIST args since they aren't implemented in mapping yet
    if (hasListArg) {
      continue;
    }

    tools.push({
      type: "function",
      function: {
        name: field.name,
        description,
        parameters: {
          type: "object",
          properties,
          required: required.length > 0 ? required : undefined,
        }
      }
    });
  }

  return tools;
}

export function buildDynamicQuery(schema: any, fieldName: string): string {
  const queryType = schema.types.find((t: any) => t.name === schema.queryType.name);
  const field = queryType.fields.find((f: any) => f.name === fieldName);
  if (!field) throw new Error(`Field ${fieldName} not found in schema Query type`);

  // Resolve base return type
  let returnType = field.type;
  while (returnType.ofType) {
    returnType = returnType.ofType;
  } 

  // Generate simple 1-level scalar/enum selection set
  let selectionSet = "";
  if (returnType.kind === "OBJECT") {
    const typeDef = schema.types.find((t: any) => t.name === returnType.name);
    if (typeDef && typeDef.fields) {
      const scalars = typeDef.fields.filter((f: any) => {
        let ft = f.type;
        while (ft.ofType) ft = ft.ofType;
        return ft.kind === "SCALAR" || ft.kind === "ENUM";
      }).map((f: any) => f.name);
      
      if (scalars.length > 0) {
        selectionSet = `{ ${scalars.join(" ")} }`;
      }
    }
  }

  // Construct GraphQL arguments/variables strings
  let varDefs = "";
  let argDefs = "";
  if (field.args && field.args.length > 0) {
    const getTypeName = (t: any): string => {
      if (t.kind === 'NON_NULL') return `${getTypeName(t.ofType)}!`;
      if (t.kind === 'LIST') return `[${getTypeName(t.ofType)}]`;
      return t.name;
    };

    const vars = field.args.map((arg: any) => {
      return { name: arg.name, typeStr: getTypeName(arg.type) };
    });

    varDefs = `(${vars.map((v: any) => `$${v.name}: ${v.typeStr}`).join(", ")})`;
    argDefs = `(${vars.map((v: any) => `${v.name}: $${v.name}`).join(", ")})`;
  }

  return `query DynamicQuery${varDefs} {\n  ${fieldName}${argDefs} ${selectionSet}\n}`;
}

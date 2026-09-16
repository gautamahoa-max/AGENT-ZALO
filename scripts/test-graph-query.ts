import { queryKnowledgeGraphTool } from "../src/agent/tools/query-knowledge-graph-tool.js";

async function run() {
  const sql = `
    SELECT a.key, a.value
    FROM entities e
    JOIN relations r ON e.id = r.source_id
    JOIN entities policy ON r.target_id = policy.id
    JOIN attributes a ON policy.id = a.entity_id
    WHERE e.name LIKE '%Bcons%'
  `;
  // @ts-ignore
  const result = await queryKnowledgeGraphTool.execute({ sqlQuery: sql });
  console.log("KẾT QUẢ TỪ KNOWLEDGE GRAPH:");
  console.log(result);
}

run().catch(console.error);

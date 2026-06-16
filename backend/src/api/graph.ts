/**
 * /api/graph — the config knowledge graph (nodes + edges), built in-process
 * from the existing api modules. Validated against the GraphResponse contract.
 */
import { buildGraph } from "../lib/graph.ts";
import { GraphResponse } from "../../../shared/contracts.ts";

export async function graph(): Promise<GraphResponse> {
  return GraphResponse.parse(await buildGraph());
}

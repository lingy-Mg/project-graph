import { Project, service } from "@/core/Project";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { invoke } from "@tauri-apps/api/core";
import { Vector } from "@graphif/data-structures";
import { TextNode } from "@/core/stage/stageObject/entity/TextNode";
import { Edge } from "@/core/stage/stageObject/association/Edge";

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * MCP (Model Context Protocol) Server Service
 * Exposes project-graph data and operations to AI agents through MCP protocol
 */
@service("mcpServer")
export class MCPServer {
  private server: Server | null = null;
  private isRunning = false;

  constructor(private readonly project: Project) {}

  /**
   * Initialize and start the MCP server
   */
  async init() {
    if (this.isRunning) {
      throw new Error("[MCPServer] Server is already running. Cannot reinitialize.");
    }

    this.server = new Server(
      {
        name: "project-graph",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      },
    );

    this.setupHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.isRunning = true;

    console.log("[MCPServer] MCP Server initialized and running");
  }

  /**
   * Setup all MCP protocol handlers
   */
  private setupHandlers() {
    if (!this.server) return;

    this.setupResourceHandlers();
    this.setupToolHandlers();
    this.setupPromptHandlers();
  }

  /**
   * Setup resource handlers (read-only data access)
   */
  private setupResourceHandlers() {
    if (!this.server) return;

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "project://nodes",
          name: "All Nodes",
          description: "List all text nodes in the project",
          mimeType: "application/json",
        },
        {
          uri: "project://edges",
          name: "All Edges",
          description: "List all edges (connections) in the project",
          mimeType: "application/json",
        },
        {
          uri: "project://screenshot",
          name: "Screenshot",
          description: "Capture screenshot of the current project view",
          mimeType: "image/png",
        },
        {
          uri: "project://tags",
          name: "Tags",
          description: "List all tags in the project",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === "project://nodes") {
        const nodes = this.project.stageManager.getTextNodes();
        const nodeData = nodes.map((node: TextNode) => ({
          id: node.uuid,
          text: node.text,
          location: {
            x: node.collisionBox.location.x,
            y: node.collisionBox.location.y,
          },
          size: {
            width: node.collisionBox.size.x,
            height: node.collisionBox.size.y,
          },
        }));

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(nodeData, null, 2),
            },
          ],
        };
      }

      if (uri === "project://edges") {
        const edges = this.project.stageManager.getEdges();
        const edgeData = edges.map((edge: Edge) => ({
          id: edge.uuid,
          source: edge.source.uuid,
          target: edge.target.uuid,
          sourceRectangleRate: {
            x: edge.sourceRectangleRate.x,
            y: edge.sourceRectangleRate.y,
          },
          targetRectangleRate: {
            x: edge.targetRectangleRate.x,
            y: edge.targetRectangleRate.y,
          },
        }));

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(edgeData, null, 2),
            },
          ],
        };
      }

      if (uri === "project://screenshot") {
        try {
          // Returns base64-encoded PNG string
          const base64Image = await invoke<string>("capture_app_screenshot");
          return {
            contents: [
              {
                uri,
                mimeType: "image/png",
                // MCP expects base64 string in blob field for binary data
                blob: base64Image,
              },
            ],
          };
        } catch (error) {
          throw new Error(`Failed to capture screenshot: ${error}`);
        }
      }

      if (uri === "project://tags") {
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(this.project.tags, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    });
  }

  /**
   * Setup tool handlers (operations that can be performed)
   */
  private setupToolHandlers() {
    if (!this.server) return;

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "addNode",
          description: "Add a new text node to the project",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "The text content of the node",
              },
              x: {
                type: "number",
                description: "X coordinate of the node",
              },
              y: {
                type: "number",
                description: "Y coordinate of the node",
              },
              width: {
                type: "number",
                description: `Width of the node (default: ${DEFAULT_NODE_WIDTH})`,
              },
              height: {
                type: "number",
                description: `Height of the node (default: ${DEFAULT_NODE_HEIGHT})`,
              },
            },
            required: ["text", "x", "y"],
          },
        },
        {
          name: "connectNodes",
          description: "Create an edge connecting two nodes",
          inputSchema: {
            type: "object",
            properties: {
              sourceId: {
                type: "string",
                description: "UUID of the source node",
              },
              targetId: {
                type: "string",
                description: "UUID of the target node",
              },
            },
            required: ["sourceId", "targetId"],
          },
        },
        {
          name: "updateNode",
          description: "Update the text content of a node",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: {
                type: "string",
                description: "UUID of the node to update",
              },
              text: {
                type: "string",
                description: "New text content",
              },
            },
            required: ["nodeId", "text"],
          },
        },
        {
          name: "deleteNode",
          description: "Delete a node from the project",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: {
                type: "string",
                description: "UUID of the node to delete",
              },
            },
            required: ["nodeId"],
          },
        },
        {
          name: "updateNodePosition",
          description: "Update the position of a node",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: {
                type: "string",
                description: "UUID of the node to update",
              },
              x: {
                type: "number",
                description: "New X coordinate",
              },
              y: {
                type: "number",
                description: "New Y coordinate",
              },
            },
            required: ["nodeId", "x", "y"],
          },
        },
        {
          name: "updateNodeSize",
          description: "Update the size of a node",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: {
                type: "string",
                description: "UUID of the node to update",
              },
              width: {
                type: "number",
                description: "New width",
              },
              height: {
                type: "number",
                description: "New height (optional, will be auto-calculated based on text if not provided)",
              },
            },
            required: ["nodeId", "width"],
          },
        },
        {
          name: "updateEdgeDirection",
          description:
            "Update the direction of an edge connection. Controls which side of the nodes the edge connects to. Use rate values between 0 and 1 to specify the position on the node's rectangle. Common values: 0.5 (center), 0.01 (left/top edge), 0.99 (right/bottom edge)",
          inputSchema: {
            type: "object",
            properties: {
              edgeId: {
                type: "string",
                description: "UUID of the edge to update",
              },
              sourceRateX: {
                type: "number",
                description: "X rate for source connection point (0-1, where 0.5 is center)",
              },
              sourceRateY: {
                type: "number",
                description: "Y rate for source connection point (0-1, where 0.5 is center)",
              },
              targetRateX: {
                type: "number",
                description: "X rate for target connection point (0-1, where 0.5 is center)",
              },
              targetRateY: {
                type: "number",
                description: "Y rate for target connection point (0-1, where 0.5 is center)",
              },
            },
            required: ["edgeId"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "addNode") {
        const { text, x, y, width, height } = args as {
          text: string;
          x: number;
          y: number;
          width?: number;
          height?: number;
        };
        const nodeWidth = width ?? DEFAULT_NODE_WIDTH;
        const nodeHeight = height ?? DEFAULT_NODE_HEIGHT;
        const node = new TextNode(new Vector(x, y), new Vector(nodeWidth, nodeHeight));
        node.text = text;
        this.project.stageManager.add(node);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, nodeId: node.uuid }),
            },
          ],
        };
      }

      if (name === "connectNodes") {
        const { sourceId, targetId } = args as { sourceId: string; targetId: string };
        const source = this.project.stageManager.get(sourceId);
        const target = this.project.stageManager.get(targetId);

        if (!source || !target) {
          throw new Error("Source or target node not found");
        }

        const nodeConnector = this.project.nodeConnector;
        if (!nodeConnector) {
          throw new Error("NodeConnector service not available");
        }

        const edge = nodeConnector.connectNode(source, target);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, edgeId: edge?.uuid }),
            },
          ],
        };
      }

      if (name === "updateNode") {
        const { nodeId, text } = args as { nodeId: string; text: string };
        const node = this.project.stageManager.get(nodeId);

        if (!node || !(node instanceof TextNode)) {
          throw new Error("Node not found or not a text node");
        }

        node.text = text;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, nodeId }),
            },
          ],
        };
      }

      if (name === "deleteNode") {
        const { nodeId } = args as { nodeId: string };
        const node = this.project.stageManager.get(nodeId);

        if (!node) {
          throw new Error("Node not found");
        }

        this.project.stageManager.delete(node);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, nodeId }),
            },
          ],
        };
      }

      if (name === "updateNodePosition") {
        const { nodeId, x, y } = args as { nodeId: string; x: number; y: number };
        const node = this.project.stageManager.get(nodeId);

        if (!node || !(node instanceof TextNode)) {
          throw new Error("Node not found or not a text node");
        }

        node.moveTo(new Vector(x, y));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, nodeId, x, y }),
            },
          ],
        };
      }

      if (name === "updateNodeSize") {
        const { nodeId, width } = args as { nodeId: string; width: number; height?: number };
        const node = this.project.stageManager.get(nodeId);

        if (!node || !(node instanceof TextNode)) {
          throw new Error("Node not found or not a text node");
        }

        node.resizeWidthTo(width);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                nodeId,
                width,
                actualHeight: node.rectangle.size.y,
              }),
            },
          ],
        };
      }

      if (name === "updateEdgeDirection") {
        const { edgeId, sourceRateX, sourceRateY, targetRateX, targetRateY } = args as {
          edgeId: string;
          sourceRateX?: number;
          sourceRateY?: number;
          targetRateX?: number;
          targetRateY?: number;
        };
        const edge = this.project.stageManager.get(edgeId);

        if (!edge || !(edge instanceof Edge)) {
          throw new Error("Edge not found");
        }

        if (sourceRateX !== undefined && sourceRateY !== undefined) {
          edge.sourceRectangleRate = new Vector(sourceRateX, sourceRateY);
        }
        if (targetRateX !== undefined && targetRateY !== undefined) {
          edge.targetRectangleRate = new Vector(targetRateX, targetRateY);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                edgeId,
                sourceRectangleRate: {
                  x: edge.sourceRectangleRate.x,
                  y: edge.sourceRectangleRate.y,
                },
                targetRectangleRate: {
                  x: edge.targetRectangleRate.x,
                  y: edge.targetRectangleRate.y,
                },
              }),
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  /**
   * Setup prompt handlers (AI prompt templates)
   */
  private setupPromptHandlers() {
    if (!this.server) return;

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "analyze-project",
          description: "Analyze the current project structure and provide insights",
        },
        {
          name: "suggest-organization",
          description: "Suggest ways to organize and improve the project structure",
        },
      ],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;

      if (name === "analyze-project") {
        const nodes = this.project.stageManager.getTextNodes();
        const edges = this.project.stageManager.getEdges();

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Analyze this project graph:
- Total nodes: ${nodes.length}
- Total edges: ${edges.length}
- Tags: ${this.project.tags.join(", ")}

Please provide insights about the project structure, complexity, and any observations.`,
              },
            },
          ],
        };
      }

      if (name === "suggest-organization") {
        const nodes = this.project.stageManager.getTextNodes();
        const nodesData = nodes.map((node: TextNode) => ({
          text: node.text,
          location: {
            x: node.collisionBox.location.x,
            y: node.collisionBox.location.y,
          },
        }));

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Here is the current project structure:
${JSON.stringify(nodesData, null, 2)}

Please suggest ways to better organize this project graph, including:
1. Grouping related nodes
2. Improving layout
3. Adding helpful connections
4. Reducing complexity`,
              },
            },
          ],
        };
      }

      throw new Error(`Unknown prompt: ${name}`);
    });
  }

  /**
   * Dispose the MCP server
   */
  async dispose() {
    if (this.server) {
      await this.server.close();
      this.server = null;
      this.isRunning = false;
      console.log("[MCPServer] MCP Server disposed");
    }
  }
}

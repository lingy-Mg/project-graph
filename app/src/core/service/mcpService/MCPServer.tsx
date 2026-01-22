import { Project, service } from "@/core/Project";
import { invoke } from "@tauri-apps/api/core";
import { Vector } from "@graphif/data-structures";
import { TextNode } from "@/core/stage/stageObject/entity/TextNode";
import { Edge } from "@/core/stage/stageObject/association/Edge";
import { CollisionBox } from "@/core/stage/stageObject/collisionBox/collisionBox";
import { Rectangle } from "@graphif/shapes";

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * MCP (Model Context Protocol) Server Service
 * Exposes project-graph data and operations to AI agents through HTTP API
 *
 * The service exposes a global API (window.__mcpServer) that can be accessed
 * by an HTTP bridge server for external MCP clients.
 */
@service("mcpServer")
export class MCPServer {
  private isRunning = false;

  constructor(private readonly project: Project) {}

  /**
   * Initialize and start the MCP server
   */
  async init() {
    if (this.isRunning) {
      throw new Error("[MCPServer] Server is already running. Cannot reinitialize.");
    }

    // Expose MCP API via window global
    this.setupWindowAPI();

    this.isRunning = true;

    console.log(`[MCPServer] MCP API initialized and available via window.__mcpServer`);
  }

  /**
   * Setup window API for MCP operations
   */
  private setupWindowAPI() {
    (window as any).__mcpServer = {
      // Meta
      getServerInfo: () => ({
        name: "project-graph",
        version: "1.0.0",
        protocol: "mcp/1.0",
      }),

      // Resources
      listResources: async () => this.listResources(),
      readResource: async (uri: string) => this.readResource(uri),

      // Tools
      listTools: async () => this.listTools(),
      callTool: async (name: string, args: any) => this.callTool(name, args),

      // Prompts
      listPrompts: async () => this.listPrompts(),
      getPrompt: async (name: string) => this.getPrompt(name),
    };
  }

  /**
   * List available resources
   */
  private async listResources() {
    return {
      resources: [
        {
          uri: "project://nodes",
          name: "All Nodes",
          description: "List all text nodes with their locations and sizes",
          mimeType: "application/json",
        },
        {
          uri: "project://edges",
          name: "All Edges",
          description: "List all edges (connections) between nodes",
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
    };
  }

  /**
   * Read a resource by URI
   */
  private async readResource(uri: string) {
    if (uri === "project://nodes") {
      const nodes = this.project.stageManager.getTextNodes();
      const nodeData = nodes.map((node: TextNode) => ({
        id: node.uuid,
        text: node.text,
        location: {
          x: node.rectangle.location.x,
          y: node.rectangle.location.y,
        },
        size: {
          width: node.rectangle.size.x,
          height: node.rectangle.size.y,
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
        const base64Image = await invoke<string>("capture_app_screenshot");
        return {
          contents: [
            {
              uri,
              mimeType: "image/png",
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
  }

  /**
   * List available tools
   */
  private async listTools() {
    return {
      tools: [
        {
          name: "addNode",
          description: "Add a new text node to the project",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", description: "The text content of the node" },
              x: { type: "number", description: "X coordinate of the node" },
              y: { type: "number", description: "Y coordinate of the node" },
              width: { type: "number", description: `Width of the node (default: ${DEFAULT_NODE_WIDTH})` },
              height: { type: "number", description: `Height of the node (default: ${DEFAULT_NODE_HEIGHT})` },
            },
            required: ["text", "x", "y"],
          },
        },
        {
          name: "updateNode",
          description: "Update the text content of a node",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "UUID of the node to update" },
              text: { type: "string", description: "New text content" },
            },
            required: ["nodeId", "text"],
          },
        },
        {
          name: "updateNodePosition",
          description: "Update the position of a node",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "UUID of the node to update" },
              x: { type: "number", description: "New X coordinate" },
              y: { type: "number", description: "New Y coordinate" },
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
              nodeId: { type: "string", description: "UUID of the node to update" },
              width: { type: "number", description: "New width" },
            },
            required: ["nodeId", "width"],
          },
        },
        {
          name: "connectNodes",
          description: "Create an edge connecting two nodes",
          inputSchema: {
            type: "object",
            properties: {
              sourceId: { type: "string", description: "UUID of the source node" },
              targetId: { type: "string", description: "UUID of the target node" },
            },
            required: ["sourceId", "targetId"],
          },
        },
        {
          name: "updateEdgeDirection",
          description: "Update the direction of an edge connection",
          inputSchema: {
            type: "object",
            properties: {
              edgeId: { type: "string", description: "UUID of the edge to update" },
              sourceRateX: { type: "number", description: "X rate for source (0-1)" },
              sourceRateY: { type: "number", description: "Y rate for source (0-1)" },
              targetRateX: { type: "number", description: "X rate for target (0-1)" },
              targetRateY: { type: "number", description: "Y rate for target (0-1)" },
            },
            required: ["edgeId"],
          },
        },
        {
          name: "deleteNode",
          description: "Delete a node from the project",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "UUID of the node to delete" },
            },
            required: ["nodeId"],
          },
        },
      ],
    };
  }

  /**
   * Call a tool with arguments
   */
  private async callTool(name: string, args: any) {
    if (name === "addNode") {
      const { text, x, y, width, height } = args;
      const nodeWidth = width ?? DEFAULT_NODE_WIDTH;
      const nodeHeight = height ?? DEFAULT_NODE_HEIGHT;
      const node = new TextNode(this.project, {
        text,
        collisionBox: new CollisionBox([new Rectangle(new Vector(x, y), new Vector(nodeWidth, nodeHeight))]),
      });
      this.project.stageManager.add(node);

      return { success: true, nodeId: node.uuid };
    }

    if (name === "updateNode") {
      const { nodeId, text } = args;
      const node = this.project.stageManager.get(nodeId);
      if (!node || !(node instanceof TextNode)) {
        throw new Error("Node not found or not a text node");
      }
      node.text = text;
      return { success: true, nodeId };
    }

    if (name === "updateNodePosition") {
      const { nodeId, x, y } = args;
      const node = this.project.stageManager.get(nodeId);
      if (!node || !(node instanceof TextNode)) {
        throw new Error("Node not found or not a text node");
      }
      node.moveTo(new Vector(x, y));
      return { success: true, nodeId, x, y };
    }

    if (name === "updateNodeSize") {
      const { nodeId, width } = args;
      const node = this.project.stageManager.get(nodeId);
      if (!node || !(node instanceof TextNode)) {
        throw new Error("Node not found or not a text node");
      }
      node.resizeWidthTo(width);
      return { success: true, nodeId, width, actualHeight: node.rectangle.size.y };
    }

    if (name === "connectNodes") {
      const { sourceId, targetId } = args;
      const source = this.project.stageManager.get(sourceId);
      const target = this.project.stageManager.get(targetId);

      if (!source || !target) {
        throw new Error("Source or target node not found");
      }

      const nodeConnector = this.project.nodeConnector;
      if (!nodeConnector) {
        throw new Error("NodeConnector service not available");
      }

      nodeConnector.connectConnectableEntity(source as any, target as any);
      const edges = this.project.stageManager.getEdges();
      const edge = edges.find(
        (e) =>
          (e.source.uuid === sourceId && e.target.uuid === targetId) ||
          (e.source.uuid === targetId && e.target.uuid === sourceId),
      );

      return { success: true, edgeId: edge?.uuid };
    }

    if (name === "updateEdgeDirection") {
      const { edgeId, sourceRateX, sourceRateY, targetRateX, targetRateY } = args;
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
        success: true,
        edgeId,
        sourceRectangleRate: { x: edge.sourceRectangleRate.x, y: edge.sourceRectangleRate.y },
        targetRectangleRate: { x: edge.targetRectangleRate.x, y: edge.targetRectangleRate.y },
      };
    }

    if (name === "deleteNode") {
      const { nodeId } = args;
      const node = this.project.stageManager.get(nodeId);
      if (!node) {
        throw new Error("Node not found");
      }
      this.project.stageManager.delete(node);
      return { success: true, nodeId };
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  /**
   * List available prompts
   */
  private async listPrompts() {
    return {
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
    };
  }

  /**
   * Get a prompt by name
   */
  private async getPrompt(name: string) {
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
          x: node.rectangle.location.x,
          y: node.rectangle.location.y,
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
  }

  /**
   * Dispose the MCP server
   */
  async dispose() {
    if (this.isRunning) {
      // Clean up global API
      delete (window as any).__mcpServer;

      this.isRunning = false;
      console.log("[MCPServer] MCP Server disposed");
    }
  }
}

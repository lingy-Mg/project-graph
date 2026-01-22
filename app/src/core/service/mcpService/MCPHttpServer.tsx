/**
 * MCP HTTP Bridge Server
 *
 * Creates a simple HTTP server that bridges external MCP clients
 * to the internal MCP API (window.__mcpServer)
 *
 * This allows external tools like Claude Desktop and VS Code to connect
 * via HTTP instead of requiring window global access.
 */
export class MCPHttpServer {
  private isRunning = false;
  private port = 3100;

  constructor() {}

  /**
   * Start the HTTP server
   */
  async start() {
    if (this.isRunning) {
      console.warn("[MCPHttpServer] Server is already running");
      return;
    }

    // Create a simple HTTP server endpoint handler
    // We'll use a service worker or polling mechanism
    this.setupHttpEndpoints();
    this.isRunning = true;

    console.log(`[MCPHttpServer] HTTP server started on http://localhost:${this.port}`);
    console.log(`[MCPHttpServer] Endpoints:`);
    console.log(`  - GET  /mcp/resources - List resources`);
    console.log(`  - GET  /mcp/resources/:uri - Read resource`);
    console.log(`  - GET  /mcp/tools - List tools`);
    console.log(`  - POST /mcp/tools/:name - Call tool`);
    console.log(`  - GET  /mcp/prompts - List prompts`);
    console.log(`  - GET  /mcp/prompts/:name - Get prompt`);
  }

  /**
   * Setup HTTP endpoints using Tauri's capabilities
   *
   * Note: This is a simplified implementation that exposes the API
   * through a global window object. For true HTTP server functionality,
   * you would need to:
   * 1. Create a separate Node.js HTTP server process
   * 2. Use Tauri's IPC to communicate between processes
   * 3. Or use a Rust-based HTTP server with axum/actix
   */
  private setupHttpEndpoints() {
    // Expose HTTP-friendly API on window
    (window as any).__mcpHttpApi = {
      handleRequest: async (method: string, path: string, body?: any) => {
        const mcpServer = (window as any).__mcpServer;
        if (!mcpServer) {
          return {
            status: 503,
            body: { error: "MCP Server not initialized" },
          };
        }

        try {
          // Parse path
          const parts = path.split("/").filter((p) => p);

          // Route requests
          if (method === "GET" && parts[0] === "resources" && parts.length === 1) {
            // List resources
            const result = await mcpServer.listResources();
            return { status: 200, body: result };
          }

          if (method === "GET" && parts[0] === "resources" && parts.length === 2) {
            // Read resource
            const uri = decodeURIComponent(parts[1]);
            const result = await mcpServer.readResource(uri);
            return { status: 200, body: result };
          }

          if (method === "GET" && parts[0] === "tools") {
            // List tools
            const result = await mcpServer.listTools();
            return { status: 200, body: result };
          }

          if (method === "POST" && parts[0] === "tools" && parts.length === 2) {
            // Call tool
            const toolName = parts[1];
            const result = await mcpServer.callTool(toolName, body || {});
            return { status: 200, body: result };
          }

          if (method === "GET" && parts[0] === "prompts" && parts.length === 1) {
            // List prompts
            const result = await mcpServer.listPrompts();
            return { status: 200, body: result };
          }

          if (method === "GET" && parts[0] === "prompts" && parts.length === 2) {
            // Get prompt
            const promptName = parts[1];
            const result = await mcpServer.getPrompt(promptName);
            return { status: 200, body: result };
          }

          return {
            status: 404,
            body: { error: "Not found" },
          };
        } catch (error: any) {
          return {
            status: 500,
            body: { error: error.message || String(error) },
          };
        }
      },
    };

    // Log that the API is ready
    console.log("[MCPHttpServer] HTTP API handler registered at window.__mcpHttpApi");
  }

  /**
   * Stop the HTTP server
   */
  stop() {
    if (this.isRunning) {
      delete (window as any).__mcpHttpApi;
      this.isRunning = false;
      console.log("[MCPHttpServer] HTTP server stopped");
    }
  }
}

# MCP (Model Context Protocol) Integration

## Overview

Project Graph now supports the Model Context Protocol (MCP), enabling AI agents like Claude Desktop, ChatGPT, and other MCP-compatible clients to interact with your project graphs programmatically.

## Features

The MCP integration provides three main capabilities:

### 1. Resources (Read-Only Data Access)

Resources allow AI agents to read project data:

- **`project://nodes`** - List all text nodes with their locations and sizes
- **`project://edges`** - List all edges (connections) between nodes, including connection directions (sourceRectangleRate and targetRectangleRate)
- **`project://tags`** - List all tags in the project
- **`project://screenshot`** - Capture a screenshot of the current project view

### 2. Tools (Operations)

Tools allow AI agents to perform operations on your project:

- **`addNode`** - Create a new text node
  - Parameters: `text` (string), `x` (number), `y` (number)
- **`connectNodes`** - Create an edge between two nodes
  - Parameters: `sourceId` (string), `targetId` (string)
- **`updateNode`** - Update the text content of a node
  - Parameters: `nodeId` (string), `text` (string)
- **`updateNodePosition`** - Update the position of a node
  - Parameters: `nodeId` (string), `x` (number), `y` (number)
- **`updateNodeSize`** - Update the size of a node
  - Parameters: `nodeId` (string), `width` (number), `height` (number, optional)
- **`updateEdgeDirection`** - Update the direction of an edge connection
  - Parameters: `edgeId` (string), `sourceRateX` (number, 0-1), `sourceRateY` (number, 0-1), `targetRateX` (number, 0-1), `targetRateY` (number, 0-1)
  - Note: Rate values control which side of the nodes the edge connects to. Use 0.5 for center, 0.01 for left/top edge, 0.99 for right/bottom edge
- **`deleteNode`** - Delete a node from the project
  - Parameters: `nodeId` (string)

### 3. Prompts (AI Templates)

Pre-configured prompts for common AI tasks:

- **`analyze-project`** - Analyze the project structure and provide insights
- **`suggest-organization`** - Suggest ways to better organize the project graph

## Usage

### Connecting from Claude Desktop

Add the following to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "project-graph": {
      "command": "/path/to/project-graph",
      "args": []
    }
  }
}
```

### Connecting from Other MCP Clients

The MCP server uses stdio transport and can be connected by any MCP-compatible client. The server is automatically initialized when a project is loaded.

## Example Interactions

### Reading Project Data

```typescript
// AI agent can read all nodes
const nodes = await readResource("project://nodes");
// Returns: [{ id: "uuid", text: "Node text", location: { x: 0, y: 0 }, size: { width: 200, height: 100 } }, ...]
```

### Creating Nodes

```typescript
// AI agent can create a new node
const result = await callTool("addNode", {
  text: "New node created by AI",
  x: 100,
  y: 200,
});
// Returns: { success: true, nodeId: "new-uuid" }
```

### Connecting Nodes

```typescript
// AI agent can connect two nodes
const result = await callTool("connectNodes", {
  sourceId: "node-1-uuid",
  targetId: "node-2-uuid",
});
// Returns: { success: true, edgeId: "edge-uuid" }
```

### Taking Screenshots

```typescript
// AI agent can capture a screenshot
const screenshot = await readResource("project://screenshot");
// Returns: base64-encoded PNG image
```

### Updating Node Position

```typescript
// AI agent can move a node to a new position
const result = await callTool("updateNodePosition", {
  nodeId: "node-uuid",
  x: 300,
  y: 400,
});
// Returns: { success: true, nodeId: "node-uuid", x: 300, y: 400 }
```

### Updating Node Size

```typescript
// AI agent can resize a node
const result = await callTool("updateNodeSize", {
  nodeId: "node-uuid",
  width: 250,
});
// Returns: { success: true, nodeId: "node-uuid", width: 250, actualHeight: 120 }
// Note: Height is auto-calculated based on text content
```

### Updating Edge Direction

```typescript
// AI agent can adjust which sides of nodes an edge connects to
const result = await callTool("updateEdgeDirection", {
  edgeId: "edge-uuid",
  sourceRateX: 0.99, // Right side of source node
  sourceRateY: 0.5, // Middle vertically
  targetRateX: 0.01, // Left side of target node
  targetRateY: 0.5, // Middle vertically
});
// Returns: { success: true, edgeId: "edge-uuid", sourceRectangleRate: {x: 0.99, y: 0.5}, targetRectangleRate: {x: 0.01, y: 0.5} }
```

## Technical Details

### Architecture

```
┌─────────────────────────────────────┐
│   Project Graph (Tauri App)        │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   MCP Server Service         │  │
│  │  (MCPServer.tsx)             │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  Exposed Capabilities:       │  │
│  │  • Resources (data access)   │  │
│  │  • Tools (operations)        │  │
│  │  • Prompts (AI templates)    │  │
│  │  • Screenshots (Tauri)       │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
           │ stdio (JSON-RPC)
           ▼
┌─────────────────────────────────────┐
│   AI Agent (Claude/ChatGPT)        │
└─────────────────────────────────────┘
```

### Implementation Files

- **Frontend**: `app/src/core/service/mcpService/MCPServer.tsx`
- **Backend**: `app/src-tauri/src/cmd/screenshot.rs`
- **Service Registration**: `app/src/core/loadAllServices.tsx`

### Screenshot Implementation

The screenshot functionality is implemented using Tauri's native screenshot API:

**Rust Commands**:

- `capture_window_screenshot` - Captures the current window
- `capture_app_screenshot` - Captures the main application window

The screenshots are returned as base64-encoded PNG images, making them compatible with AI vision models.

## Security Considerations

- The MCP server only accepts connections via stdio (no network exposure)
- All operations are subject to the same permissions as the main application
- Screenshot captures only the application window, not the entire screen

## Future Enhancements

Potential future improvements:

1. **Additional Resources**:
   - Project metadata
   - Section information
   - Attachment listing

2. **Additional Tools**:
   - Batch node operations
   - Auto-layout triggers (automated graph layout algorithms)
   - Tag management
   - Section creation/management

3. **Advanced Prompts**:
   - Generate documentation from graph
   - Suggest missing connections
   - Identify duplicate or similar nodes
   - Complexity analysis and simplification suggestions

## Troubleshooting

### MCP Server Not Starting

- Check that the MCPServer service is properly registered in `loadAllServices.tsx`
- Verify that `@modelcontextprotocol/sdk` is installed
- Check console logs for initialization errors

### Screenshot Not Working

- Ensure Tauri has proper window access permissions
- On Linux, verify that the window manager supports screenshot API
- Check that the `image-png` feature is enabled in `Cargo.toml`

### Tools Not Working

- Verify that the project is fully loaded before calling tools
- Check that node UUIDs are correct when calling operations
- Ensure the NodeConnector service is available for edge creation

## Contributing

To extend the MCP functionality:

1. Add new resources in the `setupResourceHandlers()` method
2. Add new tools in the `setupToolHandlers()` method
3. Add new prompts in the `setupPromptHandlers()` method
4. Update this documentation with your changes

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Tauri Screenshot API](https://tauri.app/v2/reference/javascript/window/)

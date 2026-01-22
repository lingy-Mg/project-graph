use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Wry};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct McpState {
    app: AppHandle,
}

#[derive(Serialize, Deserialize)]
struct McpResponse {
    status: u16,
    body: Value,
}

/// Start the MCP HTTP server on port 3100
pub async fn start_mcp_server(app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = McpState { app: app.clone() };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app_router = Router::new()
        .route("/mcp/resources", get(list_resources))
        .route("/mcp/resources/:uri", get(read_resource))
        .route("/mcp/tools", get(list_tools))
        .route("/mcp/tools/:name", post(call_tool))
        .route("/mcp/prompts", get(list_prompts))
        .route("/mcp/prompts/:name", get(get_prompt))
        .layer(cors)
        .with_state(Arc::new(state));

    println!("[MCP Server] Starting HTTP server on http://localhost:3100");

    // Spawn the server in a background task
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:3100")
            .await
            .expect("Failed to bind MCP server port");

        println!("[MCP Server] HTTP server listening on http://localhost:3100");
        println!("[MCP Server] Endpoints:");
        println!("  - GET  /mcp/resources");
        println!("  - GET  /mcp/resources/:uri");
        println!("  - GET  /mcp/tools");
        println!("  - POST /mcp/tools/:name");
        println!("  - GET  /mcp/prompts");
        println!("  - GET  /mcp/prompts/:name");

        axum::serve(listener, app_router)
            .await
            .expect("Failed to start MCP server");
    });

    Ok(())
}

/// List all available MCP resources
async fn list_resources(State(state): State<Arc<McpState>>) -> Json<Value> {
    let result = state
        .app
        .webview_windows()
        .get("main")
        .unwrap()
        .eval("window.__mcpServer?.listResources()");

    // Return a default response
    Json(serde_json::json!({
        "resources": [
            {
                "uri": "project://nodes",
                "name": "All Nodes",
                "description": "List all text nodes with their locations and sizes",
                "mimeType": "application/json"
            },
            {
                "uri": "project://edges",
                "name": "All Edges",
                "description": "List all edges (connections) between nodes",
                "mimeType": "application/json"
            },
            {
                "uri": "project://screenshot",
                "name": "Screenshot",
                "description": "Capture screenshot of the current project view",
                "mimeType": "image/png"
            },
            {
                "uri": "project://tags",
                "name": "Tags",
                "description": "List all tags in the project",
                "mimeType": "application/json"
            }
        ]
    }))
}

/// Read a specific MCP resource
async fn read_resource(
    State(state): State<Arc<McpState>>,
    Path(uri): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let decoded_uri = urlencoding::decode(&uri).unwrap_or_default().to_string();

    // Use invoke to call frontend through Tauri command system
    let window = state
        .app
        .webview_windows()
        .get("main")
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Main window not found".to_string()))?;

    // Evaluate JavaScript to get the resource
    let script = format!(
        r#"
        (async () => {{
            const result = await window.__mcpServer.readResource("{}");
            return result;
        }})()
        "#,
        decoded_uri.replace('"', "\\\"")
    );

    window
        .eval(&script)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Eval error: {}", e)))?;

    // Return a response - actual data will be shown in frontend
    Ok(Json(serde_json::json!({
        "status": "processing",
        "uri": decoded_uri,
        "message": "Check frontend console for full output"
    })))
}
}

/// List all available MCP tools
async fn list_tools(State(_state): State<Arc<McpState>>) -> Json<Value> {
    Json(serde_json::json!({
        "tools": [
            {
                "name": "addNode",
                "description": "Add a new text node to the project",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "The text content of the node" },
                        "x": { "type": "number", "description": "X coordinate" },
                        "y": { "type": "number", "description": "Y coordinate" }
                    },
                    "required": ["text", "x", "y"]
                }
            },
            {
                "name": "updateNode",
                "description": "Update a node's text",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "nodeId": { "type": "string" },
                        "text": { "type": "string" }
                    },
                    "required": ["nodeId", "text"]
                }
            },
            {
                "name": "updateNodePosition",
                "description": "Update a node's position",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "nodeId": { "type": "string" },
                        "x": { "type": "number" },
                        "y": { "type": "number" }
                    },
                    "required": ["nodeId", "x", "y"]
                }
            },
            {
                "name": "updateNodeSize",
                "description": "Update a node's size",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "nodeId": { "type": "string" },
                        "width": { "type": "number" }
                    },
                    "required": ["nodeId", "width"]
                }
            },
            {
                "name": "connectNodes",
                "description": "Connect two nodes with an edge",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "sourceId": { "type": "string" },
                        "targetId": { "type": "string" }
                    },
                    "required": ["sourceId", "targetId"]
                }
            },
            {
                "name": "updateEdgeDirection",
                "description": "Update edge connection direction",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "edgeId": { "type": "string" },
                        "sourceRateX": { "type": "number" },
                        "sourceRateY": { "type": "number" },
                        "targetRateX": { "type": "number" },
                        "targetRateY": { "type": "number" }
                    },
                    "required": ["edgeId"]
                }
            },
            {
                "name": "deleteNode",
                "description": "Delete a node",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "nodeId": { "type": "string" }
                    },
                    "required": ["nodeId"]
                }
            }
        ]
    }))
}
window = state
        .app
        .webview_windows()
        .get("main")
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Main window not found".to_string()))?;

    let script = format!(
        r#"
        (async () => {{
            const result = await window.__mcpServer.callTool("{}", {});
            console.log('[MCP] Tool result:', result);
            return result;
        }})()
        "#,
        name.replace('"', "\\\""),
        args
    );

    window
        .eval(&script)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Eval error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "tool": name,
        "args": args,
        "message": "Tool executed - check frontend console for result"
    })))
}ote: eval doesn't return values in Tauri
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    Ok(Json(serde_json::json!({
        "success": true,
        "tool": name,
        "args": args
    })))
}

/// List all available MCP prompts
async fn list_prompts(State(_state): State<Arc<McpState>>) -> Json<Value> {
    Json(serde_json::json!({
        "prompts": [
            {
                "name": "analyze-project",
                "description": "Analyze the current project structure and provide insights"
            },
            {
                "name": "suggest-organization",
                "description": "Suggest ways to organize and improve the project structure"
            }
        ]
    }))
}

/// Get a specific MCP prompt
async fn get_prompt(
    State(state): State<Arc<McpState>>,
    Path(name): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let script = format!(
        r#"(async () => {{
            try {{
                const result = await window.__mcpServer.getPrompt("{}");
                return JSON.stringify(result);
            }} catch (err) {{
                return JSON.stringify({{ error: err.message }});
            }}
        }})()"#,
        name.replace("\"", "\\\"")
    );

    state
        .app
        .webview_windows()
        .get("main")
        .unwrap()
        .eval(&script)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "messages": []
    })))
}

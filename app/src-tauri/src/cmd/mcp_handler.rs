use tauri::command;
use serde_json::Value;

#[command]
pub async fn mcp_read_resource(uri: String) -> Result<Value, String> {
    // This will be called from Rust HTTP handler and forwarded to frontend
    // The frontend should have registered a listener for this
    Ok(serde_json::json!({
        "uri": uri,
        "action": "read_resource"
    }))
}

#[command]
pub async fn mcp_call_tool(name: String, args: Value) -> Result<Value, String> {
    // This will be called from Rust HTTP handler and forwarded to frontend
    Ok(serde_json::json!({
        "tool": name,
        "args": args,
        "action": "call_tool"
    }))
}

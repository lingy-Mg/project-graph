use tauri::{AppHandle, Manager, Window};
use base64::prelude::*;

#[tauri::command]
pub async fn capture_window_screenshot(window: Window) -> Result<String, String> {
    let image = window
        .screenshot()
        .map_err(|e| format!("Failed to capture screenshot: {}", e))?;
    
    Ok(BASE64_STANDARD.encode(&image))
}

#[tauri::command]
pub async fn capture_app_screenshot(app: AppHandle) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    
    let image = window
        .screenshot()
        .map_err(|e| format!("Failed to capture screenshot: {}", e))?;
    
    Ok(BASE64_STANDARD.encode(&image))
}

#!/usr/bin/env node

/**
 * MCP HTTP Bridge Server
 * 
 * This is a standalone HTTP server that bridges external MCP clients
 * (like Claude Desktop, VS Code) to the running Project Graph application.
 * 
 * Communication flow:
 * External MCP Client <-> HTTP Bridge (this server) <-> Project Graph App (via HTTP API)
 * 
 * Usage:
 *   node mcp-http-bridge.js
 * 
 * The bridge will start on port 3100 and communicate with Project Graph
 * running on port 1420 (Tauri dev server default).
 */

import http from 'http';
import { URL } from 'url';

const PORT = 3100;
const TAURI_DEV_PORT = 1420; // Default Tauri dev server port
const BASE_URL = `http://localhost:${TAURI_DEV_PORT}`;

/**
 * Forward request to the Tauri app
 */
async function forwardToTauri(method, path, body) {
  try {
    const response = await fetch(`${BASE_URL}/__mcp${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error('[Bridge] Error forwarding to Tauri:', error.message);
    return {
      status: 503,
      data: { error: 'Failed to connect to Project Graph application. Make sure it is running.' },
    };
  }
}

/**
 * Handle MCP requests
 */
async function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  console.log(`[Bridge] ${req.method} ${path}`);

  // Parse body for POST requests
  let body = null;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyStr = Buffer.concat(chunks).toString();
    try {
      body = JSON.parse(bodyStr);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
  }

  // Forward to Tauri app
  const result = await forwardToTauri(req.method, path, body);

  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.data));
}

// Create HTTP server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           MCP HTTP Bridge Server for Project Graph            ║
╚════════════════════════════════════════════════════════════════╝

  Server listening on: http://localhost:${PORT}
  
  Endpoints:
    GET  /mcp/resources          - List all resources
    GET  /mcp/resources/:uri     - Read a specific resource
    GET  /mcp/tools              - List all tools
    POST /mcp/tools/:name        - Call a tool
    GET  /mcp/prompts            - List all prompts
    GET  /mcp/prompts/:name      - Get a specific prompt

  Status: Waiting for Project Graph app at ${BASE_URL}
  
  Press Ctrl+C to stop the server
`);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n[Bridge] Shutting down...');
  server.close(() => {
    console.log('[Bridge] Server stopped');
    process.exit(0);
  });
});

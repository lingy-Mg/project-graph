#!/usr/bin/env node

/**
 * MCP HTTP Bridge Server
 * 
 * This is a standalone HTTP server that bridges external MCP clients
 * (like Claude Desktop, VS Code) to the running Project Graph application.
 * 
 * Communication flow:
 * External MCP Client <-> HTTP Bridge (this server) <-> Project Graph App (via shared state)
 * 
 * Usage:
 *   node mcp-http-bridge.js
 * 
 * The bridge will start on port 3100 and communicate with Project Graph
 * using a simple file-based message queue for request/response.
 */

import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3100;
const QUEUE_DIR = path.join(__dirname, '.mcp-queue');
const REQUESTS_DIR = path.join(QUEUE_DIR, 'requests');
const RESPONSES_DIR = path.join(QUEUE_DIR, 'responses');

// Ensure queue directories exist
if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR);
if (!fs.existsSync(REQUESTS_DIR)) fs.mkdirSync(REQUESTS_DIR);
if (!fs.existsSync(RESPONSES_DIR)) fs.mkdirSync(RESPONSES_DIR);

/**
 * Send request to Project Graph app via file queue
 */
async function sendToApp(method, path, body) {
  const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const requestFile = path.join(REQUESTS_DIR, `${requestId}.json`);
  const responseFile = path.join(RESPONSES_DIR, `${requestId}.json`);

  // Write request
  fs.writeFileSync(requestFile, JSON.stringify({ method, path, body, requestId }));

  // Wait for response (with timeout)
  const maxWait = 5000; // 5 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    if (fs.existsSync(responseFile)) {
      const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
      // Clean up
      fs.unlinkSync(requestFile);
      fs.unlinkSync(responseFile);
      return response;
    }
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Timeout
  if (fs.existsSync(requestFile)) fs.unlinkSync(requestFile);
  return {
    status: 503,
    data: { 
      error: 'Request timeout. Make sure Project Graph application is running and processing MCP requests.',
      hint: 'Check the browser console for errors.'
    },
  };
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
  const reqPath = url.pathname;

  console.log(`[Bridge] ${req.method} ${reqPath}`);

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

  // Send to app via file queue
  const result = await sendToApp(req.method, reqPath, body);

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
  
  Communication: File-based message queue
  Queue directory: ${QUEUE_DIR}
  
  Endpoints:
    GET  /mcp/resources          - List all resources
    GET  /mcp/resources/:uri     - Read a specific resource  
    GET  /mcp/tools              - List all tools
    POST /mcp/tools/:name        - Call a tool
    GET  /mcp/prompts            - List all prompts
    GET  /mcp/prompts/:name      - Get a specific prompt

  Status: Waiting for Project Graph app to process requests
  
  Press Ctrl+C to stop the server
`);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n[Bridge] Shutting down...');
  
  // Clean up queue directory
  try {
    if (fs.existsSync(REQUESTS_DIR)) {
      fs.readdirSync(REQUESTS_DIR).forEach(file => {
        fs.unlinkSync(path.join(REQUESTS_DIR, file));
      });
    }
    if (fs.existsSync(RESPONSES_DIR)) {
      fs.readdirSync(RESPONSES_DIR).forEach(file => {
        fs.unlinkSync(path.join(RESPONSES_DIR, file));
      });
    }
  } catch (err) {
    console.error('[Bridge] Error cleaning up:', err);
  }
  
  server.close(() => {
    console.log('[Bridge] Server stopped');
    process.exit(0);
  });
});

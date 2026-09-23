#!/usr/bin/env node

/**
 * 项目问题反馈与排障闭环 本地 Stdio MCP 服务端
 */

const readline = require('readline');
const { processJsonRpc, TOOLS } = require('./feedback-service');

function log(...args) {
  process.stderr.write(`[Feedback-MCP-Stdio] ${args.join(' ')}\n`);
}

function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  log('Feedback Stdio MCP 服务已就绪...');

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
    } catch (e) {
      log('Invalid JSON-RPC request:', line);
      return;
    }

    const response = await processJsonRpc(request, 'http://127.0.0.1:8888');
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });

  process.on('SIGINT', () => {
    log('Exiting on SIGINT...');
    process.exit(0);
  });
}

startMcpServer();

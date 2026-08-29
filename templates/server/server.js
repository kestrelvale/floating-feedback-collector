const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { processJsonRpc, handleToolCall, syncRemoteFeedback, TOOLS, DB_FILE, SNAPSHOTS_DIR, readDatabase, writeDatabase, readArchive, writeArchive } = require('../mcp/feedback-service');

const PORT = process.env.PORT || 8888;
const ROOT_DIR = path.resolve(__dirname, '../zhengjiehrm-发布版-20260828');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.htm': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=UTF-8'
};

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const sseSessions = new Map();

function extractAndSavePhysicalImage(record) {
  if (!record || !record.id) return;
  const snapFile = path.join(SNAPSHOTS_DIR, `${record.id}.png`);
  if (record.snapshot && typeof record.snapshot === "string" && record.snapshot.length > 50) {
    try {
      const base64Data = record.snapshot.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(snapFile, Buffer.from(base64Data, "base64"));
      record.snapshotPath = snapFile;
      record.snapshotRelativePath = `data/snapshots/${record.id}.png`;
      record.snapshotUrl = `/data/snapshots/${record.id}.png`;
      delete record.snapshot;
    } catch (e) {
      console.error(`[Image Extraction Error] ${record.id}:`, e.message);
    }
  } else if (fs.existsSync(snapFile)) {
    record.snapshotPath = snapFile;
    record.snapshotRelativePath = `data/snapshots/${record.id}.png`;
    record.snapshotUrl = `/data/snapshots/${record.id}.png`;
  }
}

const server = http.createServer((req, res) => {
  const hostBaseUrl = `http://${req.headers.host || `127.0.0.1:${PORT}`}`;

  // 全局 CORS 支持
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, hostBaseUrl);
  const pathname = decodeURIComponent(urlObj.pathname);

  // =========================================================================
  // 🌟 远程 MCP JSON-RPC 2.0 (POST /mcp 或 /api/mcp)
  // =========================================================================
  if (req.method === 'POST' && (pathname === '/mcp' || pathname === '/api/mcp')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const jsonRpcReq = JSON.parse(body || '{}');
        const jsonRpcRes = await processJsonRpc(jsonRpcReq, hostBaseUrl);
        if (jsonRpcRes) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
          res.end(JSON.stringify(jsonRpcRes, null, 2));
        } else {
          res.writeHead(204);
          res.end();
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` }
        }));
      }
    });
    return;
  }

  // =========================================================================
  // 🌟 远程 MCP SSE (GET /sse 或 /mcp/sse)
  // =========================================================================
  if (req.method === 'GET' && (pathname === '/sse' || pathname === '/mcp/sse')) {
    const sessionId = crypto.randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=UTF-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    sseSessions.set(sessionId, res);
    const messageEndpoint = `/mcp/message?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${messageEndpoint}\n\n`);

    req.on('close', () => {
      sseSessions.delete(sessionId);
    });
    return;
  }

  if (req.method === 'POST' && (pathname === '/mcp/message' || pathname === '/message')) {
    const sessionId = urlObj.searchParams.get('sessionId');
    const sseClient = sseSessions.get(sessionId);

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const jsonRpcReq = JSON.parse(body || '{}');
        const jsonRpcRes = await processJsonRpc(jsonRpcReq, hostBaseUrl);
        if (sseClient && jsonRpcRes) {
          sseClient.write(`event: message\ndata: ${JSON.stringify(jsonRpcRes)}\n\n`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, deliveredViaSse: !!sseClient }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // =========================================================================
  // 🌟 MCP 信息展示 (GET /mcp 或 /mcp/info)
  // =========================================================================
  if (req.method === 'GET' && (pathname === '/mcp' || pathname === '/mcp/info')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({
      name: 'zhengjie-feedback-mcp',
      version: '2.0.0',
      description: '正杰全球聘原型反馈与排障闭环 远程 MCP 服务端',
      availableTools: TOOLS.map(t => ({ name: t.name, description: t.description })),
      health: 'healthy',
      connectedClients: sseSessions.size
    }, null, 2));
    return;
  }

  // =========================================================================
  // API: 获取全量反馈记录 GET /api/feedback/list
  // =========================================================================
  if (req.method === 'GET' && pathname === '/api/feedback/list') {
    const dbRecords = readDatabase();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({
      success: true,
      total: dbRecords.length,
      snapshotsDir: SNAPSHOTS_DIR,
      agentGuide: 'Agent 可通过 MCP 协议或 snapshotPath 绝对路径直接调用查看真实图片',
      data: dbRecords,
      updatedAt: new Date().toISOString()
    }, null, 2));
    return;
  }

  // =========================================================================
  // API: 同步/保存反馈记录 POST /api/feedback/save
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/feedback/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const incomingRecords = payload.records || (payload.record ? [payload.record] : []);
        
        const existing = readDatabase();
        const map = new Map();
        
        existing.forEach(r => { if (r && r.id) map.set(r.id, r); });
        incomingRecords.forEach(r => {
          if (r && r.id) {
            extractAndSavePhysicalImage(r);
            map.set(r.id, r);
          }
        });
        
        const merged = Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.time || 0).getTime() || (parseInt((a.id || '').replace('FB-', '')) || 0);
          const tB = new Date(b.time || 0).getTime() || (parseInt((b.id || '').replace('FB-', '')) || 0);
          return tB - tA;
        });

        writeDatabase(merged);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
          success: true,
          message: '反馈记录与高清快照已持久化落盘至本地数据库！',
          count: incomingRecords.length,
          total: merged.length
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // =========================================================================
  // API: 清空全部反馈记录与快照 POST /api/feedback/clear
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/feedback/clear') {
    try {
      writeDatabase([]);
      if (fs.existsSync(SNAPSHOTS_DIR)) {
        const files = fs.readdirSync(SNAPSHOTS_DIR);
        for (const file of files) {
          if (file.endsWith(x27.pngx27)) {
            try { fs.unlinkSync(path.join(SNAPSHOTS_DIR, file)); } catch(e) {}
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: true, message: '反馈数据库与物理快照已彻底清空归零！' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // =========================================================================
  // API: 标记解决反馈 POST /api/feedback/resolve
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/feedback/resolve') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const fid = payload.feedback_id;
        const notes = payload.resolution_notes;
        if (!fid || !notes) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少 feedback_id 或 resolution_notes' }));
          return;
        }

        const records = readDatabase();
        const target = records.find(r => r.id === fid);
        if (!target) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `未找到编号为 ${fid} 的记录` }));
          return;
        }

        target.status = 'resolved';
        target.resolution = {
          resolvedBy: payload.resolved_by || 'AI Agent',
          resolvedAt: new Date().toLocaleString(),
          notes: notes,
          filesModified: payload.files_modified || []
        };

        writeDatabase(records);

        // 如果需要同步到远程
        if (payload.sync_to_remote !== false && payload.remote_server_url) {
          syncRemoteFeedback({ remote_server_url: payload.remote_server_url, push_resolved_status: true });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
          success: true,
          message: `反馈 【${fid}】 已成功标记为已解决！`,
          feedback: target
        }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // =========================================================================
  // API: 重开反馈 POST /api/feedback/unresolve
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/feedback/unresolve') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const fid = payload.feedback_id;
        const records = readDatabase();
        const target = records.find(r => r.id === fid);
        if (target) {
          target.status = 'pending';
          delete target.resolution;
          writeDatabase(records);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, message: `反馈 【${fid}】 已重置为待解决` }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // =========================================================================
  // API: 删除单条反馈 POST /api/feedback/delete
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/feedback/delete') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const fid = payload.feedback_id;
        let records = readDatabase();
        const initialCount = records.length;
        records = records.filter(r => r.id !== fid);
        writeDatabase(records);

        if (payload.delete_snapshot_file !== false) {
          const snapFile = path.join(SNAPSHOTS_DIR, `${fid}.png`);
          if (fs.existsSync(snapFile)) {
            try { fs.unlinkSync(snapFile); } catch(e) {}
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, deleted: initialCount !== records.length }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // =========================================================================
  // API: 触发双向同步 POST /api/feedback/sync
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/feedback/sync') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const syncRes = await syncRemoteFeedback(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(syncRes));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // =========================================================================
  // API: 获取统计指标 GET /api/feedback/summary
  // =========================================================================
  if (req.method === 'GET' && pathname === '/api/feedback/summary') {
    const records = readDatabase();
    const summary = {
      total: records.length,
      pending: records.filter(r => r.status !== 'resolved').length,
      resolved: records.filter(r => r.status === 'resolved').length,
      p0: records.filter(r => r.severity === 'P0').length,
      p1: records.filter(r => r.severity === 'P1').length,
      p2: records.filter(r => r.severity === 'P2').length,
      p3: records.filter(r => r.severity === 'P3').length,
      snapshots: fs.existsSync(SNAPSHOTS_DIR) ? fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png')).length : 0
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ success: true, summary }));
    return;
  }

  // =========================================================================
  // 静态资源托管：物理图片目录 /data/snapshots/...
  // =========================================================================
  if (pathname.startsWith('/data/snapshots/')) {
    const snapFile = path.join(SNAPSHOTS_DIR, path.basename(pathname));
    if (fs.existsSync(snapFile) && fs.statSync(snapFile).isFile()) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(snapFile).pipe(res);
      return;
    }
  }

  // =========================================================================
  // 路由重定向：/checking 自动规范化到 /checking/
  if (pathname === '/checking') {
    res.writeHead(301, { 'Location': '/checking/' });
    res.end();
    return;
  }

  // 可视化反馈看板：GET /feedback-dashboard.html 或 /feedback 或 /api/feedback/dashboard
  // =========================================================================
  if (pathname === '/feedback-dashboard.html' || pathname === '/feedback' || pathname === '/api/feedback/dashboard') {
    const dashFile = path.resolve(__dirname, '../feedback-dashboard.html');
    if (fs.existsSync(dashFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      fs.createReadStream(dashFile).pipe(res);
      return;
    }
  }

  // =========================================================================
  // 静态页面与原型资源托管
  // =========================================================================
  let filePath = path.join(ROOT_DIR, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>404 - 页面未找到</title></head>
      <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff;">
        <h2>404 - 页面未找到</h2>
        <p>请求路径: ${pathname}</p>
        <p><a href="/" style="color:#38bdf8; font-weight:bold;">← 返回正杰全球聘发布大厅首页</a></p>
      </body>
      </html>
    `);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Server Error: ' + err.code);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('========================================================');
  console.log('  🚀 正杰全球聘 · 局域网服务与本地/远程 MCP 中枢已启动！');
  console.log('========================================================');
  console.log(`  🔗 本地访问:      http://localhost:${PORT}`);
  console.log(`  🌐 局域网访问:    http://${localIp}:${PORT}`);
  console.log(`  🤖 远程 MCP (HTTP): http://${localIp}:${PORT}/mcp`);
  console.log(`  📡 远程 MCP (SSE):  http://${localIp}:${PORT}/sse`);
  console.log(`  💾 反馈数据API:   http://${localIp}:${PORT}/api/feedback/list`);
  console.log(`  🖼️ 视觉反馈看板:  http://${localIp}:${PORT}/feedback-dashboard.html`);
  console.log(`  📂 数据库落盘:    ${DB_FILE}`);
  console.log(`  📸 物理图片目录:  ${SNAPSHOTS_DIR}`);
  console.log('========================================================');
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {
  processJsonRpc,
  handleToolCall,
  syncRemoteFeedback,
  TOOLS,
  DB_FILE,
  SNAPSHOTS_DIR,
  readFullDatabase,
  writeFullDatabase,
  resolveLocalPath,
  readArchive,
  writeArchive,
  readPreferences,
  writePreferences
} = require('../mcp/feedback-service');

const PORT = process.env.PORT || 8888;



const SERVER_VERSION = '3.1.0';
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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB 限制
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // 跨域预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return res.end();
  }




  // 1. 获取反馈列表 API
  if (pathname === '/api/feedback/list' && req.method === 'GET') {
    const status = parsedUrl.searchParams.get('status') || 'all';
    const severity = parsedUrl.searchParams.get('severity') || 'all';
    const mode = parsedUrl.searchParams.get('mode') || 'all';
    const includeTrash = parsedUrl.searchParams.get('includeTrash') === 'true';

    const db = readFullDatabase();
    let list = db.feedbacks || [];

    if (!includeTrash) {
      list = list.filter(r => !r.isTrash && r.status !== 'trash');
    }

    if (status !== 'all') {
      list = list.filter(r => (r.status || 'pending').toLowerCase() === status.toLowerCase());
    }

    if (severity !== 'all') {
      list = list.filter(r => (r.severity || '').toUpperCase() === severity.toUpperCase());
    }

    if (mode !== 'all') {
      list = list.filter(r => (r.mode || 'local').toLowerCase() === mode.toLowerCase());
    }

    return sendJson(res, 200, {
      success: true,
      total: list.length,
      dataVersion: db.dataVersion,
      updatedAt: db.updatedAt,
      data: list,
      trashBin: includeTrash ? (db.trashBin || []) : undefined
    });
  }

  // 2. 获取统计摘要 API
  if (pathname === '/api/feedback/summary' && req.method === 'GET') {
    const db = readFullDatabase();
    const list = (db.feedbacks || []).filter(r => !r.isTrash && r.status !== 'trash');
    const pending = list.filter(r => (r.status || 'pending') === 'pending');
    const resolved = list.filter(r => (r.status || '') === 'resolved');

    return sendJson(res, 200, {
      success: true,
      dataVersion: db.dataVersion,
      summary: {
        total: list.length,
        pending: pending.length,
        resolved: resolved.length,
        trash: (db.trashBin || []).length,
        p0: pending.filter(r => (r.severity || '').toUpperCase() === 'P0').length,
        p1: pending.filter(r => (r.severity || '').toUpperCase() === 'P1').length,
        p2: pending.filter(r => (r.severity || '').toUpperCase() === 'P2').length,
        p3: pending.filter(r => (r.severity || '').toUpperCase() === 'P3').length,
        mappingsCount: (db.urlMappings || []).length
      }
    });
  }

  // 3. 提交/保存反馈 API
  if (pathname === '/api/feedback/save' && req.method === 'POST') {
    const body = await parseBody(req);
    const db = readFullDatabase();
    const records = Array.isArray(body.records) ? body.records : (body.feedback ? [body.feedback] : [body]);

    let savedCount = 0;
    for (const item of records) {
      if (!item || (!item.id && !item.title && !item.description)) continue;

      const feedbackId = item.id || `FB-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      item.id = feedbackId;
      item.status = item.status || 'pending';
      item.isTrash = false;
      item.updatedAt = new Date().toISOString();
      item.createdAt = item.time || item.createdAt || new Date().toISOString();

      // 智能位置映射
      item.localPath = item.localPath || resolveLocalPath(item.url || item.pageUrl, item.pagePath, db.urlMappings);

      // 保存 Base64 截图为物理文件
      if (item.snapshot && typeof item.snapshot === 'string' && item.snapshot.startsWith('data:image/')) {
        const base64Data = item.snapshot.replace(/^data:image\/\w+;base64,/, '');
        const snapPath = path.join(SNAPSHOTS_DIR, `${feedbackId}.png`);
        try {
          fs.writeFileSync(snapPath, Buffer.from(base64Data, 'base64'));
          item.snapshotPath = snapPath;
          item.snapshotRelativePath = `data/snapshots/${feedbackId}.png`;
          item.snapshotUrl = `/data/snapshots/${feedbackId}.png`;
        } catch (e) {}
      }

      const existingIndex = db.feedbacks.findIndex(r => r.id === feedbackId);
      if (existingIndex >= 0) {
        db.feedbacks[existingIndex] = { ...db.feedbacks[existingIndex], ...item };
      } else {
        db.feedbacks.unshift(item);
      }
      savedCount++;
    }

    writeFullDatabase(db);
        return sendJson(res, 200, {
      success: true,
      savedCount: savedCount,
      dataVersion: db.dataVersion,
      feedbacks: db.feedbacks.slice(0, 10)
    });
  }

  // 4. 标记结案 API
  if (pathname === '/api/feedback/resolve' && req.method === 'POST') {
    const body = await parseBody(req);
    const { id, resolvedBy, notes, filesModified } = body;
    if (!id) return sendJson(res, 400, { success: false, message: '缺少参数 id' });

    const db = readFullDatabase();
    const record = db.feedbacks.find(r => r.id === id);
    if (!record) return sendJson(res, 404, { success: false, message: '未找到工单' });

    record.status = 'resolved';
    record.updatedAt = new Date().toISOString();
    record.resolution = {
      resolvedBy: resolvedBy || 'AI Agent',
      resolvedAt: new Date().toISOString(),
      notes: notes || '已修复并闭环',
      filesModified: filesModified || []
    };

    writeFullDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion: db.dataVersion, feedback: record });
  }

  // 5. 录入工程师指导意见 API
  if (pathname === '/api/feedback/engineer-note' && req.method === 'POST') {
    const body = await parseBody(req);
    const { feedback_id, engineer_note, engineer_author } = body;
    if (!feedback_id || !engineer_note) {
      return sendJson(res, 400, { success: false, message: '缺少必需参数: feedback_id 或 engineer_note' });
    }

    const db = readFullDatabase();
    const record = db.feedbacks.find(r => r.id === feedback_id);
    if (!record) return sendJson(res, 404, { success: false, message: '未找到指定反馈' });

    record.engineerNote = engineer_note;
    record.engineerAuthor = engineer_author || '架构师/工程师';
    record.engineerNoteUpdatedAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    writeFullDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion: db.dataVersion, feedback: record });
  }

  // 6. 软删除移入垃圾箱 API
  if (pathname === '/api/feedback/trash' && req.method === 'POST') {
    const body = await parseBody(req);
    const { id, reason } = body;
    if (!id) return sendJson(res, 400, { success: false, message: '缺少参数 id' });

    const db = readFullDatabase();
    const index = db.feedbacks.findIndex(r => r.id === id);
    if (index === -1) return sendJson(res, 404, { success: false, message: '未找到工单' });

    const [removed] = db.feedbacks.splice(index, 1);
    removed.isTrash = true;
    removed.trashedAt = new Date().toISOString();
    removed.status = 'trash';

    if (!Array.isArray(db.trashBin)) db.trashBin = [];
    db.trashBin.unshift({
      feedbackId: id,
      title: removed.title || '无标题',
      originalStatus: removed.status || 'pending',
      deletedBy: 'user_or_agent',
      deleteReason: reason || '移入垃圾箱',
      deletedAt: removed.trashedAt,
      record: removed
    });

    writeFullDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion: db.dataVersion, message: `工单 ${id} 已移入垃圾箱` });
  }

  // 7. 垃圾箱恢复 API
  if (pathname === '/api/feedback/restore' && req.method === 'POST') {
    const body = await parseBody(req);
    const { id } = body;
    if (!id) return sendJson(res, 400, { success: false, message: '缺少参数 id' });

    const db = readFullDatabase();
    const trashIndex = (db.trashBin || []).findIndex(t => t.feedbackId === id);
    if (trashIndex === -1) return sendJson(res, 404, { success: false, message: '垃圾箱中未找到指定工单' });

    const [entry] = db.trashBin.splice(trashIndex, 1);
    const restored = entry.record || {
      id: id,
      title: entry.title,
      status: entry.originalStatus || 'pending',
      updatedAt: new Date().toISOString()
    };
    restored.isTrash = false;
    restored.trashedAt = null;
    restored.status = entry.originalStatus === 'trash' ? 'pending' : (entry.originalStatus || 'pending');

    db.feedbacks.unshift(restored);
    writeFullDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion: db.dataVersion, feedback: restored });
  }

  // 8. 物理销毁 API
  if (pathname === '/api/feedback/purge' && req.method === 'POST') {
    const body = await parseBody(req);
    const { id, deleteSnapshotFile } = body;
    if (!id) return sendJson(res, 400, { success: false, message: '缺少参数 id' });

    const db = readFullDatabase();
    db.feedbacks = (db.feedbacks || []).filter(r => r.id !== id);
    db.trashBin = (db.trashBin || []).filter(t => t.feedbackId !== id);

    if (deleteSnapshotFile) {
      const snapPath = path.join(SNAPSHOTS_DIR, `${id}.png`);
      if (fs.existsSync(snapPath)) {
        try { fs.unlinkSync(snapPath); } catch (e) {}
      }
    }

    writeFullDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion: db.dataVersion, purgedId: id });
  }

  // 9. URL 映射表查询与保存 API
  if (pathname === '/api/mappings/list' && req.method === 'GET') {
    const db = readFullDatabase();
    return sendJson(res, 200, { success: true, mappings: db.urlMappings || [] });
  }

  if (pathname === '/api/mappings/save' && req.method === 'POST') {
    const body = await parseBody(req);
    const { name, remotePattern, localFilePath, terminal } = body;
    if (!name || !remotePattern || !localFilePath) {
      return sendJson(res, 400, { success: false, message: '缺少必要参数: name, remotePattern, localFilePath' });
    }

    const db = readFullDatabase();
    if (!Array.isArray(db.urlMappings)) db.urlMappings = [];
    const index = db.urlMappings.findIndex(m => m.remotePattern === remotePattern);
    const newMapping = {
      id: index >= 0 ? db.urlMappings[index].id : `MAP-${String(db.urlMappings.length + 1).padStart(3, '0')}`,
      name: name,
      terminal: terminal || '通用终端',
      remotePattern: remotePattern,
      localFilePath: localFilePath,
      priority: 100,
      isAutoLearned: false,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) db.urlMappings[index] = newMapping;
    else db.urlMappings.push(newMapping);

    writeFullDatabase(db);
    return sendJson(res, 200, { success: true, mapping: newMapping });
  }

  // 10. 静态快照图片直接访问
  if (pathname.startsWith('/data/snapshots/')) {
    const fileName = path.basename(pathname);
    const filePath = path.join(SNAPSHOTS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Snapshot image not found');
    }
  }

  // 11. 静态 HTML / 资源文件托管 (Dashboard & 原型页面)
  let localFilePath = path.join(__dirname, '..', pathname);
  if (pathname === '/' || pathname === '/index.html') {
    localFilePath = path.join(__dirname, '../index.html');
  } else if (pathname === '/feedback-dashboard.html') {
    localFilePath = path.join(__dirname, '../feedback-dashboard.html');
  }

  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
    const ext = path.extname(localFilePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(localFilePath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
  res.end(`404 Not Found: ${pathname}`);
});

server.listen(PORT, () => {
  const ip = getLocalIp();
  console.log(`\n================================================================`);
  console.log(`  🐞 正杰全球聘 · 反馈与排障中枢服务 V${SERVER_VERSION} 已启动`);
  console.log(`  • 本地中台地址: http://127.0.0.1:${PORT}/feedback-dashboard.html`);
  console.log(`  • 局域网地址:   http://${ip}:${PORT}/feedback-dashboard.html`);
  console.log(`  • REST API 根: http://127.0.0.1:${PORT}/api/feedback/`);
  console.log(`================================================================\n`);
});

module.exports = { server };

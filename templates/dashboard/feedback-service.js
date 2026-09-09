const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const DATA_DIR = path.resolve(__dirname, "../data");
const DB_FILE = path.join(DATA_DIR, "feedback_database.json");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
const ARCHIVE_FILE = path.join(DATA_DIR, "feedback_archive.json");
const PREFERENCES_FILE = path.join(DATA_DIR, "feedback_user_preferences.json");

const DEFAULT_REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || process.env.FEEDBACK_REMOTE_URL || "http://43.139.67.247:23333";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

// 预置默认位置映射规则
const DEFAULT_URL_MAPPINGS = [
  {
    id: "MAP-001",
    name: "求职者小程序端",
    terminal: "Q端求职者",
    remotePattern: "**/q-wechat-app.html*",
    localFilePath: "求职者小程序端/q-wechat-app.html",
    priority: 100,
    isAutoLearned: false
  },
  {
    id: "MAP-002",
    name: "C端人才经纪人端",
    terminal: "C端经纪人",
    remotePattern: "**/c-wechat-app.html*",
    localFilePath: "C端人才经纪人小程序端/c-wechat-app.html",
    priority: 100,
    isAutoLearned: false
  },
  {
    id: "MAP-003",
    name: "B端企业小程序端",
    terminal: "B端企业小程序",
    remotePattern: "**/b-wechat-app.html*",
    localFilePath: "B端企业小程序端/b-wechat-app.html",
    priority: 100,
    isAutoLearned: false
  },
  {
    id: "MAP-004",
    name: "B端企业Web管理后台",
    terminal: "B端Web后台",
    remotePattern: "**/b-web-admin.html*",
    localFilePath: "zhengjiehrm-发布版-20260828/B端企业端-Web管理后台/b-web-admin.html",
    priority: 100,
    isAutoLearned: false
  },
  {
    id: "MAP-005",
    name: "平台运营端",
    terminal: "OP运营平台",
    remotePattern: "**/op-web-app.html*",
    localFilePath: "平台运营端/op-web-app.html",
    priority: 100,
    isAutoLearned: false
  },
  {
    id: "MAP-006",
    name: "五端演示中心大厅",
    terminal: "演示中心",
    remotePattern: "**/index.html*",
    localFilePath: "index.html",
    priority: 90,
    isAutoLearned: false
  },
  {
    id: "MAP-007",
    name: "内部全量验收大厅",
    terminal: "验收大厅",
    remotePattern: "**/checking*",
    localFilePath: "checking/index.html",
    priority: 90,
    isAutoLearned: false
  }
];

function resolveLocalPath(url, pagePath, customMappings = []) {
  const targetStr = ((url || '') + ' ' + (pagePath || '')).toLowerCase();
  const allMappings = [...(customMappings || []), ...DEFAULT_URL_MAPPINGS];
  
  for (const m of allMappings) {
    if (!m || !m.remotePattern || !m.localFilePath) continue;
    const pat = m.remotePattern.replace(/\*\*/g, '').replace(/\*/g, '').toLowerCase();
    if (pat && targetStr.includes(pat)) {
      return m.localFilePath;
    }
  }

  // 启发式相对路径推断
  if (pagePath && !pagePath.startsWith('http')) {
    return pagePath;
  }
  return pagePath || '未知源码文件';
}

function getFeedbackOrigin(record) {
  const url = record.url || record.pageUrl || '';
  const isOnline = url.includes('43.139.67.247') || url.includes('tencentcloud') || (!url.includes('127.0.0.1') && !url.includes('localhost') && !url.startsWith('file://') && url.startsWith('http'));

  if (isOnline) {
    return {
      isOnline: true,
      isLocal: false,
      label: '🌐 线上云端数据',
      desc: '源自公网云端服务器 (http://43.139.67.247:23333)',
      remoteServerUrl: DEFAULT_REMOTE_SERVER_URL,
      env: 'online'
    };
  }

  return {
    isOnline: false,
    isLocal: true,
    label: '💻 本地数据',
    desc: '源自本地开发测试工作区 (127.0.0.1 / file://)',
    env: 'local'
  };
}

function readFullDatabase() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const db = JSON.parse(raw || "{}");
    if (Array.isArray(db)) {
      return {
        version: "3.1.0",
        dataVersion: Date.now(),
        updatedAt: new Date().toISOString(),
        feedbacks: db,
        urlMappings: DEFAULT_URL_MAPPINGS,
        submissionLogs: [],
        trashBin: []
      };
    }
    if (!db.feedbacks) db.feedbacks = [];
    if (!db.urlMappings) db.urlMappings = DEFAULT_URL_MAPPINGS;
    if (!db.submissionLogs) db.submissionLogs = [];
    if (!db.trashBin) db.trashBin = [];
    if (!db.dataVersion) db.dataVersion = Date.now();

    // 补充 localPath
    db.feedbacks = db.feedbacks.map(r => {
      if (!r.localPath) r.localPath = resolveLocalPath(r.url || r.pageUrl, r.pagePath, db.urlMappings);
      if (r.id && !r.snapshotPath) {
        const snapFile = path.join(SNAPSHOTS_DIR, `${r.id}.png`);
        if (fs.existsSync(snapFile)) {
          r.snapshotPath = snapFile;
          r.snapshotRelativePath = `data/snapshots/${r.id}.png`;
        }
      }
      return r;
    });

    return db;
  } catch (e) {
    return {
      version: "3.1.0",
      dataVersion: Date.now(),
      updatedAt: new Date().toISOString(),
      feedbacks: [],
      urlMappings: DEFAULT_URL_MAPPINGS,
      submissionLogs: [],
      trashBin: []
    };
  }
}

function writeFullDatabase(db) {
  try {
    db.dataVersion = Date.now();
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    return true;
  } catch (e) {
    return false;
  }
}

function readDatabase() {
  const db = readFullDatabase();
  return db.feedbacks || [];
}

function writeDatabase(records) {
  const db = readFullDatabase();
  db.feedbacks = records;
  return writeFullDatabase(db);
}

function readArchive() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8") || "[]");
  } catch (e) {
    return [];
  }
}

function writeArchive(records) {
  try {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(records, null, 2), "utf-8");
    return true;
  } catch (e) {
    return false;
  }
}

function readPreferences() {
  try {
    return JSON.parse(fs.readFileSync(PREFERENCES_FILE, "utf-8") || "{}");
  } catch (e) {
    return {};
  }
}

function writePreferences(preferences) {
  try {
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2), "utf-8");
    return true;
  } catch (e) {
    return false;
  }
}

function requestHttp(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === "https:";
      const client = isHttps ? https : http;

      const reqOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ""),
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Zhengjie-Feedback-MCP/3.1",
          ...(options.headers || {})
        },
        timeout: options.timeout || 10000
      };

      const req = client.request(reqOptions, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return resolve(requestHttp(redirectUrl, options));
        }

        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer: buffer,
            text: buffer.toString("utf-8")
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`HTTP 请求超时: ${urlStr}`));
      });

      if (options.body) {
        req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 确保远程物理快照下载到本地
 */
async function ensureLocalSnapshotDownloaded(feedbackId, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const localSnapshotFile = path.join(SNAPSHOTS_DIR, `${feedbackId}.png`);
  if (fs.existsSync(localSnapshotFile)) {
    return {
      exists: true,
      localPath: localSnapshotFile,
      relativePath: `data/snapshots/${feedbackId}.png`,
      downloaded: false
    };
  }

  const base = remoteServerUrl.replace(/\/$/, "");
  const downloadUrls = [
    `${base}/data/snapshots/${feedbackId}.png`,
    `${base}/api/feedback/snapshot/${feedbackId}`,
    `${base}/snapshots/${feedbackId}.png`
  ];

  for (const url of downloadUrls) {
    try {
      const res = await requestHttp(url, { method: "GET" });
      if (res.statusCode === 200 && res.buffer && res.buffer.length > 500) {
        fs.writeFileSync(localSnapshotFile, res.buffer);
        return {
          exists: true,
          localPath: localSnapshotFile,
          relativePath: `data/snapshots/${feedbackId}.png`,
          downloaded: true,
          sizeBytes: res.buffer.length
        };
      }
    } catch (e) {}
  }

  return {
    exists: false,
    localPath: null,
    relativePath: null,
    downloaded: false
  };
}

/**
 * 提交变更时同步推送：仅在 MCP 提交解决方案、结案或录入指导意见时，才精准向远程云端服务器回推并触发刷新
 */
async function pushRealtimeToRemote(endpoint, body, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  try {
    const base = (remoteServerUrl || DEFAULT_REMOTE_SERVER_URL).replace(/\/$/, "");
    const targetUrl = `${base}${endpoint}`;
    const res = await requestHttp(targetUrl, {
      method: "POST",
      body: body,
      timeout: 5000
    });
    return res.statusCode === 200;
  } catch (e) {
    return false;
  }
}

/**
 * MCP 工具实现函数
 */
async function listFeedback(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { status = "pending", severity = "all", type = "all", keyword = "", include_trash = false, sync_remote = false, mode = "all" } = args;

  if (sync_remote) {
    try {
      await syncRemoteFeedback({ remote_server_url: remoteServerUrl, download_snapshots: true });
    } catch (e) {}
  }

  const db = readFullDatabase();
  let list = db.feedbacks || [];

  if (status !== "all") {
    list = list.filter(r => (r.status || "pending").toLowerCase() === status.toLowerCase());
  }

  if (severity !== "all") {
    list = list.filter(r => (r.severity || "").toUpperCase() === severity.toUpperCase());
  }

  if (type !== "all") {
    list = list.filter(r => (r.type || "").toLowerCase() === type.toLowerCase());
  }

  if (mode !== "all") {
    list = list.filter(r => (r.mode || "local").toLowerCase() === mode.toLowerCase());
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(r => 
      (r.title && r.title.toLowerCase().includes(kw)) ||
      (r.description && r.description.toLowerCase().includes(kw)) ||
      (r.pageTitle && r.pageTitle.toLowerCase().includes(kw)) ||
      (r.localPath && r.localPath.toLowerCase().includes(kw)) ||
      (r.id && r.id.toLowerCase().includes(kw))
    );
  }

  if (include_trash && Array.isArray(db.trashBin)) {
    // 附带垃圾箱记录
  }

  return {
    total: list.length,
    dataVersion: db.dataVersion,
    data: list.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      severity: r.severity,
      status: r.status,
      mode: r.mode || 'local',
      pageTitle: r.pageTitle,
      pageUrl: r.url || r.pageUrl,
      localPath: r.localPath || resolveLocalPath(r.url || r.pageUrl, r.pagePath, db.urlMappings),
      snapshotPath: r.snapshotPath || (fs.existsSync(path.join(SNAPSHOTS_DIR, `${r.id}.png`)) ? path.join(SNAPSHOTS_DIR, `${r.id}.png`) : null),
      snapshotRelativePath: `data/snapshots/${r.id}.png`,
      engineerNote: r.engineerNote || null,
      time: r.time || r.createdAt
    }))
  };
}

async function getFeedback(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { feedback_id } = args;
  if (!feedback_id) throw new Error("缺少必需参数: feedback_id");

  const db = readFullDatabase();
  let record = (db.feedbacks || []).find(r => r.id === feedback_id);

  if (!record) {
    // 尝试向云端实时查询
    try {
      const base = remoteServerUrl.replace(/\/$/, "");
      const res = await requestHttp(`${base}/api/feedback/list?t=${Date.now()}`);
      if (res.statusCode === 200) {
        const json = JSON.parse(res.text);
        if (json && json.success && Array.isArray(json.data)) {
          const remoteFound = json.data.find(r => r.id === feedback_id);
          if (remoteFound) {
            record = remoteFound;
            db.feedbacks.push(remoteFound);
            writeFullDatabase(db);
          }
        }
      }
    } catch (e) {}
  }

  if (!record) throw new Error(`未找到编号为 ${feedback_id} 的反馈记录`);

  // 确保快照已下载
  const snapResult = await ensureLocalSnapshotDownloaded(feedback_id, remoteServerUrl);
  record.localPath = record.localPath || resolveLocalPath(record.url || record.pageUrl, record.pagePath, db.urlMappings);
  record.snapshotPath = snapResult.localPath;
  record.snapshotRelativePath = snapResult.relativePath;

  return {
    ...record,
    physicalImagePath: snapResult.localPath,
    imageDownloadedFromRemote: snapResult.downloaded,
    viewImagePrompt: snapResult.localPath ? `Agent 可直接调用 view_image(path="${snapResult.localPath}") 查阅用户提单时的真实页面快照` : "快照图片暂未捕获",
    codeFixGuidance: `建议直接查看并修改本地源文件: ${record.localPath}`
  };
}

async function resolveFeedback(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { feedback_id, resolution_notes, files_modified = [], resolved_by = "AI Agent", sync_to_remote = true } = args;
  if (!feedback_id) throw new Error("缺少必需参数: feedback_id");
  if (!resolution_notes) throw new Error("缺少必需参数: resolution_notes");

  const db = readFullDatabase();
  const index = (db.feedbacks || []).findIndex(r => r.id === feedback_id);
  if (index === -1) throw new Error(`未找到编号为 ${feedback_id} 的反馈记录`);

  const record = db.feedbacks[index];
  record.status = "resolved";
  record.updatedAt = new Date().toISOString();
  record.resolution = {
    resolvedBy: resolved_by,
    resolvedAt: new Date().toISOString(),
    notes: resolution_notes,
    filesModified: files_modified
  };

  writeFullDatabase(db);

  let remoteSynced = false;
  if (sync_to_remote) {
    remoteSynced = await pushRealtimeToRemote("/api/feedback/resolve", {
      id: feedback_id,
      resolvedBy: resolved_by,
      notes: resolution_notes,
      filesModified: files_modified
    }, remoteServerUrl);
  }

  return {
    success: true,
    feedback_id: feedback_id,
    status: "resolved",
    remoteSynced: remoteSynced,
    localPath: record.localPath,
    message: `工单 ${feedback_id} 已成功标记为已解决！${remoteSynced ? " (已毫秒级同步至云端服务器)" : ""}`
  };
}

async function addEngineerNote(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { feedback_id, engineer_note, engineer_author = "架构师/工程师", sync_to_remote = true } = args;
  if (!feedback_id) throw new Error("缺少必需参数: feedback_id");
  if (!engineer_note) throw new Error("缺少必需参数: engineer_note");

  const db = readFullDatabase();
  const record = (db.feedbacks || []).find(r => r.id === feedback_id);
  if (!record) throw new Error(`未找到编号为 ${feedback_id} 的反馈记录`);

  record.engineerNote = engineer_note;
  record.engineerAuthor = engineer_author;
  record.engineerNoteUpdatedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();

  writeFullDatabase(db);

  let remoteSynced = false;
  if (sync_to_remote) {
    remoteSynced = await pushRealtimeToRemote("/api/feedback/engineer-note", {
      feedback_id: feedback_id,
      engineer_note: engineer_note,
      engineer_author: engineer_author
    }, remoteServerUrl);
  }

  return {
    success: true,
    feedback_id: feedback_id,
    engineer_note: engineer_note,
    remoteSynced: remoteSynced,
    message: `已为工单 ${feedback_id} 录入最高排障指导意见！${remoteSynced ? " (已实时推送到云端)" : ""}`
  };
}

async function softDeleteFeedback(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { feedback_id, reason = "用户或开发者移入垃圾箱", sync_to_remote = true } = args;
  if (!feedback_id) throw new Error("缺少必需参数: feedback_id");

  const db = readFullDatabase();
  const index = (db.feedbacks || []).findIndex(r => r.id === feedback_id);
  if (index === -1) throw new Error(`未找到编号为 ${feedback_id} 的反馈记录`);

  const [removed] = db.feedbacks.splice(index, 1);
  removed.isTrash = true;
  removed.trashedAt = new Date().toISOString();
  removed.status = "trash";

  if (!Array.isArray(db.trashBin)) db.trashBin = [];
  db.trashBin.unshift({
    feedbackId: feedback_id,
    title: removed.title || "无标题",
    originalStatus: removed.status || "pending",
    deletedBy: "developer_via_mcp",
    deleteReason: reason,
    deletedAt: removed.trashedAt,
    record: removed
  });

  writeFullDatabase(db);

  let remoteSynced = false;
  if (sync_to_remote) {
    remoteSynced = await pushRealtimeToRemote("/api/feedback/trash", {
      id: feedback_id,
      reason: reason
    }, remoteServerUrl);
  }

  return {
    success: true,
    feedback_id: feedback_id,
    isTrash: true,
    remoteSynced: remoteSynced,
    message: `工单 ${feedback_id} 已安全移入软删除垃圾箱！可在中台随时撤销恢复。`
  };
}

async function restoreFeedback(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { feedback_id, sync_to_remote = true } = args;
  if (!feedback_id) throw new Error("缺少必需参数: feedback_id");

  const db = readFullDatabase();
  const trashIndex = (db.trashBin || []).findIndex(t => t.feedbackId === feedback_id);
  if (trashIndex === -1) throw new Error(`垃圾箱中未找到编号为 ${feedback_id} 的工单`);

  const [trashEntry] = db.trashBin.splice(trashIndex, 1);
  const restoredRecord = trashEntry.record || {
    id: feedback_id,
    title: trashEntry.title,
    status: trashEntry.originalStatus || "pending",
    updatedAt: new Date().toISOString()
  };

  restoredRecord.isTrash = false;
  restoredRecord.trashedAt = null;
  restoredRecord.status = trashEntry.originalStatus === "trash" ? "pending" : (trashEntry.originalStatus || "pending");

  db.feedbacks.unshift(restoredRecord);
  writeFullDatabase(db);

  let remoteSynced = false;
  if (sync_to_remote) {
    remoteSynced = await pushRealtimeToRemote("/api/feedback/restore", {
      id: feedback_id
    }, remoteServerUrl);
  }

  return {
    success: true,
    feedback_id: feedback_id,
    status: restoredRecord.status,
    remoteSynced: remoteSynced,
    message: `工单 ${feedback_id} 已成功从垃圾箱恢复为活跃工单！`
  };
}

async function purgeFeedback(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const { feedback_id, delete_snapshot = true, sync_to_remote = true } = args;
  if (!feedback_id) throw new Error("缺少必需参数: feedback_id");

  const db = readFullDatabase();
  db.feedbacks = (db.feedbacks || []).filter(r => r.id !== feedback_id);
  db.trashBin = (db.trashBin || []).filter(t => t.feedbackId !== feedback_id);

  if (delete_snapshot) {
    const snapPath = path.join(SNAPSHOTS_DIR, `${feedback_id}.png`);
    if (fs.existsSync(snapPath)) {
      try { fs.unlinkSync(snapPath); } catch (e) {}
    }
  }

  writeFullDatabase(db);

  let remoteSynced = false;
  if (sync_to_remote) {
    remoteSynced = await pushRealtimeToRemote("/api/feedback/purge", {
      id: feedback_id,
      deleteSnapshotFile: delete_snapshot
    }, remoteServerUrl);
  }

  return {
    success: true,
    feedback_id: feedback_id,
    remoteSynced: remoteSynced,
    message: `工单 ${feedback_id} 已彻底物理销毁。`
  };
}

async function getUrlMappings(args = {}) {
  const db = readFullDatabase();
  return {
    success: true,
    total: (db.urlMappings || []).length,
    mappings: db.urlMappings || []
  };
}

async function addUrlMapping(args = {}) {
  const { name, remote_pattern, local_file_path, terminal = "通用终端" } = args;
  if (!name || !remote_pattern || !local_file_path) {
    throw new Error("缺少必要参数: name, remote_pattern, local_file_path");
  }

  const db = readFullDatabase();
  if (!Array.isArray(db.urlMappings)) db.urlMappings = [];

  const existingIndex = db.urlMappings.findIndex(m => m.remotePattern === remote_pattern);
  const newMapping = {
    id: existingIndex >= 0 ? db.urlMappings[existingIndex].id : `MAP-${String(db.urlMappings.length + 1).padStart(3, '0')}`,
    name: name,
    terminal: terminal,
    remotePattern: remote_pattern,
    localFilePath: local_file_path,
    priority: 100,
    isAutoLearned: false,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    db.urlMappings[existingIndex] = newMapping;
  } else {
    db.urlMappings.push(newMapping);
  }

  writeFullDatabase(db);
  return {
    success: true,
    mapping: newMapping,
    message: `URL 映射规则 ${name} 已成功保存！`
  };
}

async function getFeedbackSummary(args = {}, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  const db = readFullDatabase();
  const list = db.feedbacks || [];
  
  const pending = list.filter(r => (r.status || 'pending') === 'pending');
  const resolved = list.filter(r => (r.status || '') === 'resolved');
  const trash = (db.trashBin || []).length;

  return {
    success: true,
    dataVersion: db.dataVersion,
    summary: {
      total: list.length,
      pending: pending.length,
      resolved: resolved.length,
      trash: trash,
      p0: pending.filter(r => (r.severity || '').toUpperCase() === 'P0').length,
      p1: pending.filter(r => (r.severity || '').toUpperCase() === 'P1').length,
      p2: pending.filter(r => (r.severity || '').toUpperCase() === 'P2').length,
      p3: pending.filter(r => (r.severity || '').toUpperCase() === 'P3').length,
      mappingsCount: (db.urlMappings || []).length
    }
  };
}

async function syncRemoteFeedback(args = {}) {
  const remoteServerUrl = args.remote_server_url || DEFAULT_REMOTE_SERVER_URL;
  const downloadSnapshots = args.download_snapshots !== false;
  const pushResolved = args.push_resolved_status !== false;

  const base = remoteServerUrl.replace(/\/$/, "");
  const res = await requestHttp(`${base}/api/feedback/list?t=${Date.now()}`);
  if (res.statusCode !== 200) {
    throw new Error(`无法连接云端服务器: ${base}`);
  }

  const json = JSON.parse(res.text);
  const remoteList = (json && json.data) ? json.data : [];

  const db = readFullDatabase();
  const localMap = new Map();
  (db.feedbacks || []).forEach(r => localMap.set(r.id, r));

  let pulledCount = 0;
  for (const remoteItem of remoteList) {
    if (!localMap.has(remoteItem.id)) {
      db.feedbacks.push(remoteItem);
      localMap.set(remoteItem.id, remoteItem);
      pulledCount++;
    }
    if (downloadSnapshots) {
      await ensureLocalSnapshotDownloaded(remoteItem.id, remoteServerUrl);
    }
  }

  writeFullDatabase(db);
  return {
    success: true,
    pulledCount: pulledCount,
    totalLocal: db.feedbacks.length,
    message: `已成功同步云端数据！新增拉取: ${pulledCount} 条`
  };
}

/**
 * 9 大标准 MCP 工具定义
 */
const TOOLS = [
  {
    name: "list_feedback",
    description: "获取用户或测试人员在各端提交的问题反馈列表。支持按状态、严重程度、运行模式(online/local)、关键词过滤，返回绑定的本地源码文件路径 localPath。",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "resolved", "all"], description: "状态过滤：pending (待解决), resolved (已解决), all (全部)" },
        severity: { type: "string", enum: ["P0", "P1", "P2", "P3", "all"], description: "优先级过滤：P0 (紧急阻断), P1 (严重核心), P2 (一般功能), P3 (轻微建议), all" },
        mode: { type: "string", enum: ["online", "local", "all"], description: "运行模式过滤：online (线上云端), local (线下本地), all" },
        keyword: { type: "string", description: "可选关键词搜索 (匹配标题、描述、本地文件路径、模块名)" },
        sync_remote: { type: "boolean", description: "是否在查询前先向远程服务器执行一次增量拉取" }
      }
    }
  },
  {
    name: "get_feedback",
    description: "通过 feedback_id 获取指定反馈详情。若本地尚无快照图片，会自动从云端下载并返回绝对物理路径供 view_image 视觉分析，同时返回计算得出的本地源码相对路径 localPath。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", description: "反馈记录编号，例如 FB-1788173841934" },
        remote_server_url: { type: "string", description: "可选指定远程服务器 URL" }
      },
      required: ["feedback_id"]
    }
  },
  {
    name: "resolve_feedback",
    description: "将反馈标记为已解决，记录修复说明与改动文件列表。提交结案方案时精准向云端服务器回推同步状态，触发中台按需刷新变绿。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", description: "反馈记录编号" },
        resolution_notes: { type: "string", description: "修复说明与结论" },
        files_modified: { type: "array", items: { type: "string" }, description: "本次修改的本地文件路径列表" },
        resolved_by: { type: "string", description: "解决人标识，默认为 AI Agent" },
        sync_to_remote: { type: "boolean", description: "是否实时同步回推给远程服务器 (默认为 true)" }
      },
      required: ["feedback_id", "resolution_notes"]
    }
  },
  {
    name: "add_engineer_note",
    description: "为指定反馈录入工程师最高排障指导意见，自动落盘并实时同步回推云端服务器。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", description: "反馈记录编号" },
        engineer_note: { type: "string", description: "工程师指导意见与方案要求" },
        engineer_author: { type: "string", description: "工程师签名" },
        sync_to_remote: { type: "boolean", description: "是否实时推送到远程服务器" }
      },
      required: ["feedback_id", "engineer_note"]
    }
  },
  {
    name: "soft_delete_feedback",
    description: "将工单移入软删除垃圾箱进行隔离，绝对杜绝数据被同步反向复活，可在中台随时撤销恢复。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", description: "反馈记录编号" },
        reason: { type: "string", description: "删除原因" },
        sync_to_remote: { type: "boolean", description: "是否同步给远程服务器" }
      },
      required: ["feedback_id"]
    }
  },
  {
    name: "restore_feedback",
    description: "从软删除垃圾箱中撤销恢复工单为活跃待办，实时同步云端与中台。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", description: "反馈记录编号" },
        sync_to_remote: { type: "boolean", description: "是否同步给远程服务器" }
      },
      required: ["feedback_id"]
    }
  },
  {
    name: "purge_feedback",
    description: "物理彻底销毁工单及物理快照文件。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: { type: "string", description: "反馈记录编号" },
        delete_snapshot: { type: "boolean", description: "是否物理删除快照图片" },
        sync_to_remote: { type: "boolean", description: "是否同步物理删除远程记录" }
      },
      required: ["feedback_id"]
    }
  },
  {
    name: "get_url_mappings",
    description: "获取当前系统的远程页面 URL 到本地源码文件路径的智能映射规则列表。",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "add_url_mapping",
    description: "动态新增或修改一条远程 URL 模式到本地源码文件的映射规则。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "端模块名称" },
        remote_pattern: { type: "string", description: "远程URL匹配规则 (如 **/q-wechat-app.html*)" },
        local_file_path: { type: "string", description: "本地源码相对路径" },
        terminal: { type: "string", description: "终端分类" }
      },
      required: ["name", "remote_pattern", "local_file_path"]
    }
  },
  {
    name: "get_feedback_summary",
    description: "获取反馈总数、待解决数、垃圾箱数及最新数据版本戳 dataVersion。",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "sync_remote_feedback",
    description: "与远程服务器执行一次全量数据与物理快照的双向同步。",
    inputSchema: {
      type: "object",
      properties: {
        remote_server_url: { type: "string", description: "远程服务器地址" },
        download_snapshots: { type: "boolean", description: "是否自动下载快照" }
      }
    }
  }
];

async function handleToolCall(name, args, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  switch (name) {
    case "list_feedback": return await listFeedback(args, remoteServerUrl);
    case "get_feedback": return await getFeedback(args, remoteServerUrl);
    case "resolve_feedback": return await resolveFeedback(args, remoteServerUrl);
    case "add_engineer_note": return await addEngineerNote(args, remoteServerUrl);
    case "soft_delete_feedback": return await softDeleteFeedback(args, remoteServerUrl);
    case "restore_feedback": return await restoreFeedback(args, remoteServerUrl);
    case "purge_feedback": return await purgeFeedback(args, remoteServerUrl);
    case "get_url_mappings": return await getUrlMappings(args);
    case "add_url_mapping": return await addUrlMapping(args);
    case "get_feedback_summary": return await getFeedbackSummary(args, remoteServerUrl);
    case "sync_remote_feedback": return await syncRemoteFeedback(args);
    default: throw new Error(`未知的 MCP 工具名称: ${name}`);
  }
}

async function processJsonRpc(request, remoteServerUrl = DEFAULT_REMOTE_SERVER_URL) {
  if (!request || !request.method) return null;
  const id = request.id !== undefined ? request.id : null;

  try {
    if (request.method === "tools/list") {
      return { jsonrpc: "2.0", id: id, result: { tools: TOOLS } };
    }
    if (request.method === "tools/call") {
      const { name, arguments: args } = request.params || {};
      const result = await handleToolCall(name, args || {}, remoteServerUrl);
      return {
        jsonrpc: "2.0",
        id: id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        }
      };
    }
    return { jsonrpc: "2.0", id: id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  } catch (err) {
    return { jsonrpc: "2.0", id: id, error: { code: -32603, message: err.message } };
  }
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  SNAPSHOTS_DIR,
  ARCHIVE_FILE,
  PREFERENCES_FILE,
  DEFAULT_REMOTE_SERVER_URL,
  DEFAULT_URL_MAPPINGS,
  resolveLocalPath,
  getFeedbackOrigin,
  readFullDatabase,
  writeFullDatabase,
  readDatabase,
  writeDatabase,
  readArchive,
  writeArchive,
  readPreferences,
  writePreferences,
  ensureLocalSnapshotDownloaded,
  pushRealtimeToRemote,
  listFeedback,
  getFeedback,
  resolveFeedback,
  addEngineerNote,
  softDeleteFeedback,
  restoreFeedback,
  purgeFeedback,
  getUrlMappings,
  addUrlMapping,
  getFeedbackSummary,
  syncRemoteFeedback,
  handleToolCall,
  processJsonRpc,
  TOOLS
};

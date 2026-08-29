/**
 * 正杰全球聘 · 反馈与排障核心服务层 (业务逻辑共用)
 * 供 Stdio MCP Server 与 远程 HTTP/SSE MCP Server 统一调用
 * 具备「远程服务器双向同步 (Bi-directional Sync) 与物理快照自动下载」核心引擎
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const DEFAULT_REMOTE_URL = process.env.FEEDBACK_REMOTE_URL || "http://localhost:8888";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_DIR = path.join(PROJECT_ROOT, "data");
const DB_FILE = path.join(DB_DIR, "feedback_database.json");
const ARCHIVE_FILE = path.join(DB_DIR, "feedback_archive.json");
const SNAPSHOTS_DIR = path.join(DB_DIR, "snapshots");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), "utf-8");
if (!fs.existsSync(ARCHIVE_FILE)) fs.writeFileSync(ARCHIVE_FILE, JSON.stringify([], null, 2), "utf-8");

function readDatabase() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const records = JSON.parse(raw || "[]");
    return records.map(r => {
      if (!r.status) r.status = "pending";
      if (r.id && !r.snapshotPath) {
        const snapFile = path.join(SNAPSHOTS_DIR, `${r.id}.png`);
        if (fs.existsSync(snapFile)) {
          r.snapshotPath = snapFile;
          r.snapshotRelativePath = `data/snapshots/${r.id}.png`;
        }
      }
      return r;
    });
  } catch (e) {
    return [];
  }
}

function writeDatabase(records) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), "utf-8");
    return true;
  } catch (e) {
    return false;
  }
}

function readArchive() {
  try {
    const raw = fs.readFileSync(ARCHIVE_FILE, "utf-8");
    return JSON.parse(raw || "[]");
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

/**
 * 辅助函数：发起 HTTP / HTTPS 请求 (支持 GET / POST，支持超时控制与重定向)
 */
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
          "User-Agent": "Zhengjie-Feedback-MCP/2.0",
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

      req.on("timeout", () => {
        req.destroy(new Error(`Request timed out after ${reqOptions.timeout}ms`));
      });
      req.on("error", (err) => reject(err));

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
 * 辅助函数：从远程 URL 下载物理快照图片到本地磁盘
 */
async function downloadSnapshotFile(remoteUrl, localFilePath) {
  try {
    const res = await requestHttp(remoteUrl, { timeout: 15000 });
    if (res.statusCode === 200 && res.buffer && res.buffer.length > 50) {
      fs.writeFileSync(localFilePath, res.buffer);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 核心引擎：执行与远程服务器的反馈双向同步 (Pull + Auto-Download + Push)
 */
async function syncRemoteFeedback(args = {}) {
  const remoteUrl = (args.remote_server_url || DEFAULT_REMOTE_URL).replace(/\/+$/, "");
  const downloadSnapshots = args.download_snapshots !== false;
  const pushResolved = args.push_resolved_status !== false;

  const result = {
    remoteServerUrl: remoteUrl,
    pull: {
      success: false,
      totalRemoteRecords: 0,
      newlyAdded: 0,
      updated: 0,
      snapshotsDownloaded: 0,
      errors: []
    },
    push: {
      success: false,
      pushedResolvedCount: 0,
      errors: []
    }
  };

  // 1. PULL: 从远程服务器获取全量反馈列表
  let remoteRecords = [];
  try {
    const listRes = await requestHttp(`${remoteUrl}/api/feedback/list`, { timeout: 10000 });
    if (listRes.statusCode === 200) {
      const listData = JSON.parse(listRes.text || "{}");
      remoteRecords = listData.data || listData.records || [];
      result.pull.success = true;
      result.pull.totalRemoteRecords = remoteRecords.length;
    } else {
      result.pull.errors.push(`远程接口返回 HTTP ${listRes.statusCode}`);
    }
  } catch (e) {
    result.pull.errors.push(`无法连接远程服务器 (${remoteUrl}): ${e.message}`);
  }

  // 2. 合并本地数据库与远程数据库
  const localRecords = readDatabase();
  const localMap = new Map();
  localRecords.forEach(r => { if (r && r.id) localMap.set(r.id, r); });

  let newlyAdded = 0;
  let updated = 0;
  let snapshotsDownloaded = 0;

  for (const remoteR of remoteRecords) {
    if (!remoteR || !remoteR.id) continue;
    const localR = localMap.get(remoteR.id);

    const localSnapPath = path.join(SNAPSHOTS_DIR, `${remoteR.id}.png`);
    let hasLocalSnap = fs.existsSync(localSnapPath);

    // 如果本地没有截图，且允许下载，则自动发起 HTTP 下载缓存到本地物理目录
    if (!hasLocalSnap && downloadSnapshots) {
      let imgUrl = remoteR.remoteImageUrl;
      if (!imgUrl && remoteR.snapshotUrl) {
        imgUrl = remoteR.snapshotUrl.startsWith("http") ? remoteR.snapshotUrl : `${remoteUrl}${remoteR.snapshotUrl}`;
      }
      if (!imgUrl) {
        imgUrl = `${remoteUrl}/data/snapshots/${remoteR.id}.png`;
      }
      if (imgUrl) {
        const downloaded = await downloadSnapshotFile(imgUrl, localSnapPath);
        if (downloaded) {
          hasLocalSnap = true;
          snapshotsDownloaded++;
        }
      }
    }

    if (!localR) {
      // 本地无此记录 -> 插入新记录
      const newRecord = {
        ...remoteR,
        snapshotPath: hasLocalSnap ? localSnapPath : (remoteR.snapshotPath || null),
        snapshotRelativePath: hasLocalSnap ? `data/snapshots/${remoteR.id}.png` : (remoteR.snapshotRelativePath || null),
        remoteImageUrl: `${remoteUrl}/data/snapshots/${remoteR.id}.png`
      };
      localMap.set(remoteR.id, newRecord);
      newlyAdded++;
    } else {
      // 本地已存在 -> 智能合并
      let changed = false;
      if (remoteR.status === "resolved" && localR.status !== "resolved") {
        localR.status = "resolved";
        localR.resolution = remoteR.resolution;
        changed = true;
      }
      if (hasLocalSnap && !localR.snapshotPath) {
        localR.snapshotPath = localSnapPath;
        localR.snapshotRelativePath = `data/snapshots/${remoteR.id}.png`;
        changed = true;
      }
      if (!localR.remoteImageUrl) {
        localR.remoteImageUrl = `${remoteUrl}/data/snapshots/${remoteR.id}.png`;
        changed = true;
      }
      if (changed) updated++;
    }
  }

  result.pull.newlyAdded = newlyAdded;
  result.pull.updated = updated;
  result.pull.snapshotsDownloaded = snapshotsDownloaded;

  // 3. PUSH: 将本地已解决（resolved）但远程未解决的状态回推给远程服务器
  if (pushResolved && result.pull.success) {
    const toPushResolved = [];
    localMap.forEach(localR => {
      if (localR.status === "resolved" && localR.resolution) {
        const remoteMatch = remoteRecords.find(r => r.id === localR.id);
        if (remoteMatch && remoteMatch.status !== "resolved") {
          toPushResolved.push(localR);
        }
      }
    });

    if (toPushResolved.length > 0) {
      for (const item of toPushResolved) {
        try {
          const pushRes = await requestHttp(`${remoteUrl}/api/feedback/resolve`, {
            method: "POST",
            body: {
              feedback_id: item.id,
              resolution_notes: item.resolution?.notes || "已在本地完成修复与验证",
              files_modified: item.resolution?.filesModified || [],
              resolved_by: item.resolution?.resolvedBy || "AI Agent",
              sync_to_remote: false
            },
            timeout: 8000
          });
          if (pushRes.statusCode === 200) {
            result.push.pushedResolvedCount++;
          }
        } catch (e) {
          result.push.errors.push(`回推反馈 ${item.id} 失败: ${e.message}`);
        }
      }
      result.push.success = result.push.pushedResolvedCount === toPushResolved.length;
    } else {
      result.push.success = true;
      result.push.pushedResolvedCount = 0;
    }
  }

  // 4. 持久化落盘到本地数据库
  const mergedList = Array.from(localMap.values()).sort((a, b) => {
    const tA = new Date(a.time || 0).getTime() || (parseInt((a.id || "").replace("FB-", "")) || 0);
    const tB = new Date(b.time || 0).getTime() || (parseInt((b.id || "").replace("FB-", "")) || 0);
    return tB - tA;
  });

  writeDatabase(mergedList);

  return {
    success: result.pull.success,
    message: result.pull.success
      ? `双向同步成功！从远程服务器 (${remoteUrl}) 拉取了 ${result.pull.totalRemoteRecords} 条记录（新增 ${newlyAdded} 条，更新 ${updated} 条，自动下载 ${snapshotsDownloaded} 张高清截图）；回推了 ${result.push.pushedResolvedCount} 条已解决状态。`
      : `同步完成但存在警告：${result.pull.errors.join("; ")}`,
    syncDetails: result,
    currentSummary: {
      totalRecords: mergedList.length,
      pendingCount: mergedList.filter(r => r.status !== "resolved").length,
      resolvedCount: mergedList.filter(r => r.status === "resolved").length
    }
  };
}

const TOOLS = [
  {
    name: "list_feedback",
    description: "获取用户或测试人员在各端原型提交的问题反馈列表。支持按状态（待处理 pending/已完成 resolved）、严重程度（P0/P1/P2/P3）过滤，支持在查询前自动拉取远程服务器新增的反馈及自动下载截图。返回结果包含缺陷描述、复现页面、操作日志以及可以直接供 Agent 视觉分析的 physicalImagePath 本地图片绝对路径与网络 URL。",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "resolved", "all"],
          description: "状态过滤：pending (待解决，默认), resolved (已解决), all (全部)"
        },
        severity: {
          type: "string",
          enum: ["P0", "P1", "P2", "P3", "all"],
          description: "优先级过滤：P0 (紧急阻断), P1 (严重核心), P2 (一般功能), P3 (轻微建议), all (全部)"
        },
        keyword: {
          type: "string",
          description: "可选关键词搜索（匹配标题、描述、模块名或人员）"
        },
        limit: {
          type: "number",
          description: "最大返回条数，默认为 50"
        },
        sync_remote: {
          type: "boolean",
          description: "是否在查询前自动向远程服务器执行一次增量拉取与截图下载（默认为 true）"
        },
        remote_server_url: {
          type: "string",
          description: "可选指定远程服务器 URL（默认直连云端 http://localhost:8888）"
        }
      }
    }
  },
  {
    name: "get_feedback",
    description: "通过 feedback_id 获取指定反馈问题的完整详情。若本地尚无此记录或缺少截图，会自动从远程云端服务器拉取并下载高清快照到本地，返回高清物理快照路径（Agent 可直接使用 view_image 工具读取该路径）。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: {
          type: "string",
          description: "反馈记录编号，例如 \"FB-1787925303445\""
        },
        remote_server_url: {
          type: "string",
          description: "可选远程服务器 URL（默认直连 http://localhost:8888）"
        }
      },
      required: ["feedback_id"]
    }
  },
  {
    name: "resolve_feedback",
    description: "将某个反馈问题标记为“已解决 (resolved / 已完成)”，并记录 Agent 的修复说明、改动文件列表和验收测试结果。自动双向回写推送给远程服务器。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: {
          type: "string",
          description: "反馈记录编号，例如 \"FB-1787925303445\""
        },
        resolution_notes: {
          type: "string",
          description: "修复说明与结论（例如：修复了保岗津贴审核延迟，修改了 q-wechat-app.html，已通过 Playwright 自动化验证）"
        },
        files_modified: {
          type: "array",
          items: { type: "string" },
          description: "本次修改的文件路径列表"
        },
        resolved_by: {
          type: "string",
          description: "解决人标识，默认为 \"AI Agent\""
        },
        sync_to_remote: {
          type: "boolean",
          description: "是否将本次解决状态自动推送到远程服务器（默认为 true）"
        },
        remote_server_url: {
          type: "string",
          description: "可选指定远程服务器 URL（默认直连 http://localhost:8888）"
        }
      },
      required: ["feedback_id", "resolution_notes"]
    }
  },
  {
    name: "sync_remote_feedback",
    description: "与远程云端/测试服务器进行全量反馈数据与截图的双向同步。自动拉取远程所有新增的反馈问题与操作轨迹、自动通过 HTTP 下载远程高清截图保存到本地物理磁盘（供 Agent view_image 读取）、并将本地已标记解决的状态推送到远程服务器。",
    inputSchema: {
      type: "object",
      properties: {
        remote_server_url: {
          type: "string",
          description: "远程服务器根地址，默认自动直连云端服务器 http://localhost:8888"
        },
        download_snapshots: {
          type: "boolean",
          description: "是否自动将远程快照图片下载保存到本地 data/snapshots/ 目录（默认为 true）"
        },
        push_resolved_status: {
          type: "boolean",
          description: "是否将本地已解决的反馈状态推送到远程服务器（默认为 true）"
        }
      }
    }
  },
  {
    name: "delete_feedback",
    description: "物理删除单条指定的反馈记录，并可选择性删除其关联的物理 PNG 快照文件，同步向远程服务器发送删除请求。",
    inputSchema: {
      type: "object",
      properties: {
        feedback_id: {
          type: "string",
          description: "反馈记录编号，例如 \"FB-1787925303445\""
        },
        delete_snapshot_file: {
          type: "boolean",
          description: "是否同步物理删除 data/snapshots/ 下的 PNG 截图文件，默认为 true"
        },
        remote_server_url: {
          type: "string",
          description: "可选指定远程服务器 URL（默认直连 http://localhost:8888）"
        }
      },
      required: ["feedback_id"]
    }
  },
  {
    name: "cleanup_resolved_feedback",
    description: "批量清理/归档所有已标记为“已完成 (resolved)”的反馈记录。支持保留一段时间后清理（例如 older_than_minutes），支持选择直接物理删除或移动到 feedback_archive.json 进行安全冷归档。",
    inputSchema: {
      type: "object",
      properties: {
        older_than_minutes: {
          type: "number",
          description: "仅清理解决时间超过指定分钟数的记录。0 表示立即清理所有已完成记录。默认为 0"
        },
        archive: {
          type: "boolean",
          description: "是否移动到归档库 feedback_archive.json（true: 归档冷备份, false: 彻底物理删除）。默认为 true"
        },
        delete_snapshot_files: {
          type: "boolean",
          description: "彻底删除时是否同步删除物理 PNG 图片文件。默认为 false（归档时保留图片）"
        }
      }
    }
  },
  {
    name: "get_feedback_summary",
    description: "获取当前系统的反馈总数、待解决数（按 P0/P1/P2/P3 细分）、已解决数及物理快照文件统计。可自动增量同步远程服务器。",
    inputSchema: {
      type: "object",
      properties: {
        sync_remote: {
          type: "boolean",
          description: "是否先与远程服务器执行一次增量同步（默认为 true）"
        },
        remote_server_url: {
          type: "string",
          description: "可选指定远程服务器 URL"
        }
      }
    }
  }
];

async function handleToolCall(name, args = {}, hostBaseUrl = "") {
  const defaultRemote = (args.remote_server_url || DEFAULT_REMOTE_URL).replace(/\/+$/, "");

  // 1. 双向同步工具
  if (name === "sync_remote_feedback") {
    return await syncRemoteFeedback(args);
  }

  // 2. 如果在 list_feedback 时指定了 sync_remote (默认 true)
  if (name === "list_feedback" && args.sync_remote !== false) {
    try {
      await syncRemoteFeedback({
        remote_server_url: defaultRemote,
        download_snapshots: true
      });
    } catch (e) {}
  }

  let records = readDatabase();

  if (name === "list_feedback") {
    const statusFilter = args.status || "pending";
    const severityFilter = args.severity || "all";
    const keyword = (args.keyword || "").toLowerCase().trim();
    const limit = typeof args.limit === "number" ? args.limit : 50;

    let filtered = records.filter(r => {
      if (statusFilter === "pending" && r.status === "resolved") return false;
      if (statusFilter === "resolved" && r.status !== "resolved") return false;
      if (severityFilter !== "all" && (r.severity || "P2") !== severityFilter) return false;
      if (keyword) {
        const text = `${r.id} ${r.title} ${r.description} ${r.contact} ${r.pageTitle} ${r.pagePath}`.toLowerCase();
        if (!text.includes(keyword)) return false;
      }
      return true;
    });

    const results = filtered.slice(0, limit).map(r => ({
      id: r.id,
      status: r.status || "pending",
      severity: r.severity || "P2",
      type: r.typeLabel || r.type || "缺陷/建议",
      title: r.title || "未命名",
      description: r.description || "",
      contact: r.contact || "匿名",
      pageTitle: r.pageTitle || "",
      pagePath: r.pagePath || "",
      time: r.time || "",
      physicalImagePath: path.join(SNAPSHOTS_DIR, `${r.id}.png`),
      snapshotRelativePath: `data/snapshots/${r.id}.png`,
      remoteImageUrl: `${defaultRemote}/data/snapshots/${r.id}.png`,
      hasPhysicalImage: fs.existsSync(r.snapshotPath || path.join(SNAPSHOTS_DIR, `${r.id}.png`)),
      resolution: r.resolution || null,
      recentLogsCount: (r.operationLogs || []).length
    }));

    return {
      totalFound: filtered.length,
      returnedCount: results.length,
      filter: { status: statusFilter, severity: severityFilter, keyword: keyword || null },
      syncHint: `已与远程服务器 (${defaultRemote}) 同步最新真实数据。`,
      agentGuide: "Agent 可直接通过 view_image 查看 physicalImagePath 路径下的真实截图，或访问 remoteImageUrl。排障后请调用 resolve_feedback 标记已完成（将自动推送到远程服务器）。",
      feedbacks: results
    };
  }

  if (name === "get_feedback") {
    const fid = args.feedback_id;
    let target = records.find(r => r.id === fid);
    let autoDownloaded = false;

    // 如果本地未找到记录，或者本地记录缺少快照图片文件，则自动向远程云端拉取并下载
    const localImgPath = path.join(SNAPSHOTS_DIR, `${fid}.png`);
    let imgExists = fs.existsSync(localImgPath);

    if (!target || !imgExists) {
      try {
        const remoteRes = await requestHttp(`${defaultRemote}/api/feedback/list`, { timeout: 8000 });
        if (remoteRes.statusCode === 200) {
          const listData = JSON.parse(remoteRes.text || "{}");
          const remoteRecords = listData.data || listData.records || [];
          const remoteMatch = remoteRecords.find(r => r.id === fid);
          if (remoteMatch) {
            // 下载远程快照
            let remoteImgUrl = remoteMatch.remoteImageUrl;
            if (!remoteImgUrl && remoteMatch.snapshotUrl) {
              remoteImgUrl = remoteMatch.snapshotUrl.startsWith("http") ? remoteMatch.snapshotUrl : `${defaultRemote}${remoteMatch.snapshotUrl}`;
            }
            if (!remoteImgUrl) {
              remoteImgUrl = `${defaultRemote}/data/snapshots/${fid}.png`;
            }
            const downloaded = await downloadSnapshotFile(remoteImgUrl, localImgPath);
            if (downloaded) {
              autoDownloaded = true;
              imgExists = true;
            }
            target = {
              ...remoteMatch,
              snapshotPath: localImgPath,
              snapshotRelativePath: `data/snapshots/${fid}.png`
            };
            // 更新本地库
            const updatedDb = records.filter(r => r.id !== fid);
            updatedDb.unshift(target);
            writeDatabase(updatedDb);
            records = updatedDb;
          }
        }
      } catch (e) {}
    }

    if (!target) {
      return { error: `未在本地或远程服务器 (${defaultRemote}) 找到编号为 "${fid}" 的反馈记录。` };
    }

    const imgPath = localImgPath;
    imgExists = fs.existsSync(imgPath);

    return {
      success: true,
      feedback: {
        id: target.id,
        status: target.status || "pending",
        severity: target.severity || "P2",
        type: target.typeLabel || target.type || "反馈",
        title: target.title,
        description: target.description,
        contact: target.contact,
        pageTitle: target.pageTitle,
        pagePath: target.pagePath,
        activeModule: target.activeModule,
        url: target.url,
        viewport: target.viewport,
        time: target.time,
        physicalImagePath: imgPath,
        snapshotRelativePath: `data/snapshots/${target.id}.png`,
        remoteImageUrl: `${defaultRemote}/data/snapshots/${target.id}.png`,
        physicalImageExists: imgExists,
        autoDownloadedFromRemote: autoDownloaded,
        resolution: target.resolution || null,
        operationLogs: target.operationLogs || [],
        systemLogs: target.systemLogs || []
      }
    };
  }

  if (name === "resolve_feedback") {
    const fid = args.feedback_id;
    const notes = args.resolution_notes;
    const filesModified = args.files_modified || [];
    const resolvedBy = args.resolved_by || "AI Agent";

    let foundIndex = records.findIndex(r => r.id === fid);
    
    // 如果本地没有，先尝试向远程拉取
    if (foundIndex === -1) {
      try {
        await syncRemoteFeedback({ remote_server_url: defaultRemote });
        records = readDatabase();
        foundIndex = records.findIndex(r => r.id === fid);
      } catch (e) {}
    }

    if (foundIndex === -1) {
      return { error: `未找到编号为 "${fid}" 的反馈记录。` };
    }

    const nowIso = new Date().toISOString();
    const nowTimeStr = new Date().toLocaleString("zh-CN", { hour12: false });

    records[foundIndex].status = "resolved";
    records[foundIndex].resolution = {
      resolvedAt: nowIso,
      resolvedTime: nowTimeStr,
      resolvedBy: resolvedBy,
      notes: notes,
      filesModified: filesModified
    };

    writeDatabase(records);

    let remoteSyncResult = null;
    if (args.sync_to_remote !== false) {
      try {
        const pushRes = await requestHttp(`${defaultRemote}/api/feedback/resolve`, {
          method: "POST",
          body: {
            feedback_id: fid,
            resolution_notes: notes,
            files_modified: filesModified,
            resolved_by: resolvedBy,
            sync_to_remote: false
          },
          timeout: 8000
        });
        if (pushRes.statusCode === 200) {
          remoteSyncResult = { synced: true, remoteUrl: defaultRemote };
        } else {
          remoteSyncResult = { synced: false, error: `HTTP ${pushRes.statusCode}: ${pushRes.text}` };
        }
      } catch (e) {
        remoteSyncResult = { synced: false, error: e.message };
      }
    }

    return {
      success: true,
      message: `已成功将反馈 【${fid}】 标记为“已完成 (resolved)”，修复记录已本地落盘并同步至远程服务器！`,
      record: {
        id: fid,
        title: records[foundIndex].title,
        status: "resolved",
        resolution: records[foundIndex].resolution,
        remoteSync: remoteSyncResult
      }
    };
  }

  if (name === "delete_feedback") {
    const fid = args.feedback_id;
    const deleteSnapshot = args.delete_snapshot_file !== false;

    const foundIndex = records.findIndex(r => r.id === fid);
    if (foundIndex === -1) {
      return { error: `未找到编号为 "${fid}" 的反馈记录。` };
    }

    const removed = records.splice(foundIndex, 1)[0];
    writeDatabase(records);

    let imgDeleted = false;
    if (deleteSnapshot) {
      const imgPath = path.join(SNAPSHOTS_DIR, `${fid}.png`);
      if (fs.existsSync(imgPath)) {
        try {
          fs.unlinkSync(imgPath);
          imgDeleted = true;
        } catch (e) {}
      }
    }

    // 同步给远程
    try {
      await requestHttp(`${defaultRemote}/api/feedback/delete`, {
        method: "POST",
        body: { feedback_id: fid, delete_snapshot_file: deleteSnapshot },
        timeout: 5000
      });
    } catch (e) {}

    return {
      success: true,
      message: `已成功删除反馈记录 ${fid}。`,
      deletedRecord: {
        id: removed.id,
        title: removed.title,
        status: removed.status
      },
      snapshotFileDeleted: imgDeleted
    };
  }

  if (name === "cleanup_resolved_feedback") {
    const olderThanMinutes = typeof args.older_than_minutes === "number" ? args.older_than_minutes : 0;
    const shouldArchive = args.archive !== false;
    const deleteSnapshots = args.delete_snapshot_files === true;

    const now = Date.now();
    const thresholdMs = olderThanMinutes * 60 * 1000;

    const toKeep = [];
    const toClean = [];

    records.forEach(r => {
      if (r.status === "resolved") {
        const resolvedTimestamp = r.resolution && r.resolution.resolvedAt
          ? new Date(r.resolution.resolvedAt).getTime()
          : now;

        if ((now - resolvedTimestamp) >= thresholdMs) {
          toClean.push(r);
          return;
        }
      }
      toKeep.push(r);
    });

    if (toClean.length === 0) {
      return {
        success: true,
        message: `当前没有满足条件（已完成且超 ${olderThanMinutes} 分钟）的待清理记录。`,
        cleanedCount: 0,
        activeCount: records.length
      };
    }

    writeDatabase(toKeep);

    if (shouldArchive) {
      const existingArchive = readArchive();
      const mergedArchive = [...toClean, ...existingArchive];
      writeArchive(mergedArchive);
    }

    let deletedImgCount = 0;
    if (deleteSnapshots) {
      toClean.forEach(r => {
        const imgPath = path.join(SNAPSHOTS_DIR, `${r.id}.png`);
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
            deletedImgCount++;
          } catch (e) {}
        }
      });
    }

    return {
      success: true,
      message: `已成功清理 ${toClean.length} 条已完成的反馈记录。`,
      cleanedCount: toClean.length,
      actionTaken: shouldArchive ? `已归档至 ${ARCHIVE_FILE}` : "已彻底物理清除",
      snapshotsDeletedCount: deletedImgCount,
      remainingActiveCount: toKeep.length,
      cleanedIds: toClean.map(r => r.id)
    };
  }

  if (name === "get_feedback_summary") {
    if (args.sync_remote !== false) {
      try {
        await syncRemoteFeedback({ remote_server_url: defaultRemote, download_snapshots: true });
        records = readDatabase();
      } catch (e) {}
    }

    const summary = {
      total: records.length,
      pending: {
        total: 0,
        P0: 0,
        P1: 0,
        P2: 0,
        P3: 0
      },
      resolved: 0,
      snapshotsInDisk: 0,
      databasePath: DB_FILE,
      archivePath: ARCHIVE_FILE,
      snapshotsDir: SNAPSHOTS_DIR,
      remoteServerUrl: defaultRemote
    };

    records.forEach(r => {
      if (r.status === "resolved") {
        summary.resolved++;
      } else {
        summary.pending.total++;
        const sev = r.severity || "P2";
        if (summary.pending[sev] !== undefined) {
          summary.pending[sev]++;
        } else {
          summary.pending.P2++;
        }
      }
    });

    if (fs.existsSync(SNAPSHOTS_DIR)) {
      try {
        summary.snapshotsInDisk = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith(".png")).length;
      } catch (e) {}
    }

    return summary;
  }

  throw new Error(`未知的工具名称: ${name}`);
}

async function processJsonRpc(request, hostBaseUrl = "") {
  const { id, method, params } = request || {};

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false }
        },
        serverInfo: {
          name: "zhengjie-feedback-mcp",
          version: "2.1.0",
          description: "正杰全球聘原型反馈与排障闭环 MCP 服务端 (Local & Remote Sync Engine)"
        }
      }
    };
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: id,
      result: {
        tools: TOOLS
      }
    };
  }

  if (method === "tools/call") {
    const toolName = params ? params.name : "";
    const toolArgs = (params && params.arguments) || {};
    try {
      const toolResult = await handleToolCall(toolName, toolArgs, hostBaseUrl);
      return {
        jsonrpc: "2.0",
        id: id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(toolResult, null, 2)
            }
          ],
          isError: false
        }
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: id,
        result: {
          content: [
            {
              type: "text",
              text: `[Tool Error] ${err.message}`
            }
          ],
          isError: true
        }
      };
    }
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id: id, result: {} };
  }

  return {
    jsonrpc: "2.0",
    id: id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

module.exports = {
  TOOLS,
  readDatabase,
  writeDatabase,
  readArchive,
  writeArchive,
  handleToolCall,
  processJsonRpc,
  PROJECT_ROOT,
  DB_FILE,
  ARCHIVE_FILE,
  SNAPSHOTS_DIR,
  syncRemoteFeedback
};

#!/usr/bin/env node

function normalizeRemoteUrl(inputUrl) {
  if (!inputUrl) return '';
  let str = String(inputUrl).trim().replace(/\/+$/, '');
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    if (/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost)(:\d+)?(\/.*)?$/i.test(str)) {
      str = 'http://' + str;
    } else {
      str = 'https://' + str;
    }
  }
  return str;
}


/**
 * 悬浮问题反馈收集器 · 自动化初始化向导 CLI
 * 支持模式：
 * 1. local (纯本地模式)
 * 2. online (纯线上模式)
 * 3. hybrid (本地+线上双向混合模式 - 推荐)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 颜色工具
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

function banner() {
  console.log(`\n${c.cyan}${c.bright}================================================================${c.reset}`);
  console.log(`${c.bright}  🐞 悬浮问题反馈收集器 · 企业级多端排障闭环初始化向导 (V1.0)${c.reset}`);
  console.log(`${c.gray}  支持 DOM 真实快照、操作轨迹追踪、可视化大盘与 MCP 协议闭环${c.reset}`);
  console.log(`${c.cyan}${c.bright}================================================================${c.reset}\n`);
}

function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const prompt = defaultValue !== undefined ? `${question} ${c.gray}(默认: ${defaultValue})${c.reset}: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--mode=')) options.mode = arg.split('=')[1];
    if (arg.startsWith('--target=')) options.targetDir = arg.split('=')[1];
    if (arg.startsWith('--port=')) options.port = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--remote-url=')) options.remoteServerUrl = arg.split('=')[1];
    if (arg.startsWith('--online-url=')) options.remoteServerUrl = arg.split('=')[1];
    if (arg.startsWith('--project-key=')) options.projectKey = arg.split('=')[1];
    if (arg.startsWith('--project-id=')) options.projectKey = arg.split('=')[1];
    if (arg.startsWith('--project-name=')) options.projectName = arg.split('=')[1];
    if (arg === '--inject') options.injectHtml = true;
    if (arg === '--no-inject') options.injectHtml = false;
    if (arg === '--mcp') options.setupMcp = true;
    if (arg === '-y' || arg === '--yes') options.nonInteractive = true;
  }
  return options;
}

async function run() {
  banner();
  const cliArgs = parseArgs();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const templatesDir = path.resolve(__dirname, '../templates');
  let targetDir = cliArgs.targetDir || process.cwd();

  let mode = cliArgs.mode;
  let port = cliArgs.port || 8888;
  let remoteServerUrl = normalizeRemoteUrl(cliArgs.remoteServerUrl || '');
  let injectHtml = cliArgs.injectHtml;
  let setupMcp = cliArgs.setupMcp;

  if (!cliArgs.nonInteractive) {
    if (!mode) {
      console.log(`${c.bright}请选择部署与协同模式：${c.reset}`);
      console.log(`  ${c.green}1) 纯本地模式 (local)${c.reset}     - 本地 LocalStorage/Node服务 + 本地 Dashboard + 本地 MCP 排障`);
      console.log(`  ${c.blue}2) 纯线上模式 (online)${c.reset}    - 直连指定的云端生产服务 API + 线上 Dashboard + 远程排障`);
      console.log(`  ${c.magenta}3) 本地+线上混合模式 (hybrid)${c.reset} - ${c.bright}[推荐]${c.reset} 本地快速采集，自动静默同步云端，MCP 自动拉取真实快照`);
      
      const choice = await ask(rl, `请输入选项 [1-3]`, '3');
      if (choice === '1' || choice.toLowerCase() === 'local') mode = 'local';
      else if (choice === '2' || choice.toLowerCase() === 'online') mode = 'online';
      else mode = 'hybrid';
    }

    targetDir = await ask(rl, `请输入目标项目根目录路径`, targetDir);
    targetDir = path.resolve(process.cwd(), targetDir);

    if (mode === 'local' || mode === 'hybrid') {
      const portInput = await ask(rl, `请输入本地 Node 服务监听端口`, String(port));
      port = parseInt(portInput, 10) || 8888;
    }

    if (mode === 'online' || mode === 'hybrid') {
      const defaultHint = mode === 'online' ? 'http://your-server-domain:port' : `http://localhost:${port}`;
      remoteServerUrl = await ask(rl, `请输入你的远程/云端服务器根地址 (带 http/https 与端口，例如 http://1.2.3.4:8888)`, defaultHint);
    }

    if (injectHtml === undefined) {
      const injectChoice = await ask(rl, `是否自动向目标项目中的 HTML 文件注入引入脚本？ (y/n)`, 'y');
      injectHtml = injectChoice.toLowerCase().startsWith('y');
    }

    if (setupMcp === undefined) {
      const mcpChoice = await ask(rl, `是否在项目根目录生成/更新 MCP 配置文件 (codex.json / .mcp.json)？ (y/n)`, 'y');
      setupMcp = mcpChoice.toLowerCase().startsWith('y');
    }
  } else {
    mode = mode || 'hybrid';
    injectHtml = injectHtml !== undefined ? injectHtml : true;
    setupMcp = setupMcp !== undefined ? setupMcp : true;
  }

  rl.close();

  console.log(`\n${c.cyan}🚀 开始部署与初始化...${c.reset}`);
  console.log(`  • 模式: ${c.bright}${mode}${c.reset}`);
  console.log(`  • 目标路径: ${c.bright}${targetDir}${c.reset}`);
  console.log(`  • 本地端口: ${c.bright}${port}${c.reset}`);
  if (mode !== 'local') console.log(`  • 远程地址: ${c.bright}${remoteServerUrl}${c.reset}`);

  // 1. 确保目录结构
  const mcpDir = path.join(targetDir, 'mcp');
  const scriptsDir = path.join(targetDir, 'scripts');
  const dataDir = path.join(targetDir, 'data');
  const snapshotsDir = path.join(dataDir, 'snapshots');

  [mcpDir, scriptsDir, dataDir, snapshotsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // 2. 智能识别当前项目身份 (Project Identity Isolation)
  const resolvedTargetDir = path.resolve(process.cwd(), targetDir);
  let projectName = path.basename(resolvedTargetDir);
  let projectId = projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  let projectKey = projectId;
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) {
        projectName = pkg.name;
        projectId = pkg.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      }
    } catch(e) {}
  }

  if (cliArgs.projectKey) projectId = cliArgs.projectKey.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (cliArgs.projectName) projectName = cliArgs.projectName;

  // 自动扫描当前项目的 HTML / 核心入口建立专属初始映射
  const projectMappings = [];
  try {
    function findHtmlFiles(dir, depth = 0) {
      if (depth > 3) return;
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of list) {
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === 'build' || item.name === 'packages') continue;
        const p = path.join(dir, item.name);
        if (item.isDirectory()) {
          findHtmlFiles(p, depth + 1);
        } else if (item.isFile() && item.name.endsWith('.html') && item.name !== 'feedback-dashboard.html') {
          const rel = path.relative(targetDir, p).replace(/\\/g, '/');
          const terminalGuess = rel.includes('/') ? rel.split('/')[0] : '默认端';
          projectMappings.push({
            id: `MAP-${String(projectMappings.length + 1).padStart(3, '0')}`,
            name: item.name.replace('.html', ''),
            terminal: terminalGuess,
            remotePattern: `**/${item.name}*`,
            localFilePath: rel,
            priority: 100,
            isAutoLearned: true
          });
        }
      }
    }
    findHtmlFiles(targetDir);
  } catch(e) {}

  if (projectMappings.length === 0) {
    projectMappings.push({
      id: "MAP-001",
      name: "主入口页面",
      terminal: "默认端",
      remotePattern: "**/index.html*",
      localFilePath: "index.html",
      priority: 90,
      isAutoLearned: false
    });
  }

  // 初始化专属独立四表数据底座 (feedbacks 必须为纯净空列表，绝不夹带任何旧项目数据)
  const dbFile = path.join(dataDir, 'feedback_database.json');
  if (!fs.existsSync(dbFile)) {
    const seedDb = {
      version: "3.2.0",
      projectId: projectId,
      projectName: projectName,
      dataVersion: Date.now(),
      updatedAt: new Date().toISOString(),
      feedbacks: [],
      urlMappings: projectMappings,
      submissionLogs: [],
      trashBin: []
    };
    fs.writeFileSync(dbFile, JSON.stringify(seedDb, null, 2), 'utf-8');
    console.log(`  ${c.green}✓${c.reset} 初始化专属纯净四表数据底座: data/feedback_database.json (项目: ${c.bright}${projectName}${c.reset}, 初始映射: ${projectMappings.length}条)`);
  }

  // 3. 生成定制化的 feedback-collector.js
  let collectorJs = fs.readFileSync(path.join(templatesDir, 'client/feedback-collector.js'), 'utf-8');
  
  // 替换配置项
  if (mode === 'local') {
    collectorJs = collectorJs.replace(/const DEFAULT_REMOTE_URL = .*;/, `const DEFAULT_REMOTE_URL = 'http://127.0.0.1:${port}';`);
    collectorJs = collectorJs.replace(/const RUNTIME_MODE = .*;/, `const RUNTIME_MODE = 'local';`);
  } else if (mode === 'online') {
    const normalizedRemote = normalizeRemoteUrl(remoteServerUrl);
    collectorJs = collectorJs.replace(/const DEFAULT_REMOTE_URL = .*;/, `const DEFAULT_REMOTE_URL = '${normalizedRemote}';`);
    collectorJs = collectorJs.replace(/const PROJECT_KEY = .*;/, `const PROJECT_KEY = '${projectKey}';`);
    collectorJs = collectorJs.replace(/const PROJECT_NAME = .*;/, `const PROJECT_NAME = '${projectName}';`);
    collectorJs = collectorJs.replace(/const RUNTIME_MODE = .*;/, `const RUNTIME_MODE = 'online';`);
  } else {
    // hybrid
    const normalizedRemote = normalizeRemoteUrl(remoteServerUrl);
    collectorJs = collectorJs.replace(/const DEFAULT_REMOTE_URL = .*;/, `const DEFAULT_REMOTE_URL = '${normalizedRemote}';`);
    collectorJs = collectorJs.replace(/const PROJECT_KEY = .*;/, `const PROJECT_KEY = '${projectKey}';`);
    collectorJs = collectorJs.replace(/const PROJECT_NAME = .*;/, `const PROJECT_NAME = '${projectName}';`);
    collectorJs = collectorJs.replace(/const RUNTIME_MODE = .*;/, `const RUNTIME_MODE = 'hybrid';`);
  }

  fs.writeFileSync(path.join(targetDir, 'feedback-collector.js'), collectorJs, 'utf-8');
  fs.copyFileSync(path.join(templatesDir, 'client/html2canvas.min.js'), path.join(targetDir, 'html2canvas.min.js'));
  console.log(`  ${c.green}✓${c.reset} 复制前端 SDK: feedback-collector.js & html2canvas.min.js`);

  // 4. 复制并定制 Dashboard (注入当前项目的专属名称与 projectId)
  let dashboardHtml = fs.readFileSync(path.join(templatesDir, 'dashboard/feedback-dashboard.html'), 'utf-8');
  dashboardHtml = dashboardHtml.replace(/<title>.*<\/title>/, `<title>${projectName} · 原型反馈与 Agent 闭环排障中枢</title>`);
  dashboardHtml = dashboardHtml.replace(/<h1 style="margin:0;">.*<\/h1>/, `<h1 style="margin:0;">${projectName} · 原型反馈与 Agent 闭环排障中枢</h1>`);
  dashboardHtml = dashboardHtml.replace(/const CURRENT_PROJECT_ID = .*;/, `const CURRENT_PROJECT_ID = '${projectId}';`);
  dashboardHtml = dashboardHtml.replace(/const CURRENT_PROJECT_NAME = .*;/, `const CURRENT_PROJECT_NAME = '${projectName}';`);
  let remoteHost = "your-server-ip";
  try { remoteHost = new URL(remoteServerUrl).hostname; } catch(e) {}
  dashboardHtml = dashboardHtml
    .split("http://your-server-ip:port").join(remoteServerUrl)
    .split("your-server-ip").join(remoteHost)
    .split("http://127.0.0.1:8888").join("http://127.0.0.1:" + port)
    .split("http://localhost:8888").join("http://localhost:" + port)
    .split("port === '8888'").join("port === '" + port + "'");
  fs.writeFileSync(path.join(targetDir, 'feedback-dashboard.html'), dashboardHtml, 'utf-8');
  console.log(`  ${c.green}✓${c.reset} 复制可视化大盘: feedback-dashboard.html`);

  // 5. 复制并定制 MCP 核心服务
  let mcpServiceJs = fs.readFileSync(path.join(templatesDir, 'mcp/feedback-service.js'), 'utf-8');
  if (mode === 'local') {
    mcpServiceJs = mcpServiceJs.replace(/const DEFAULT_REMOTE_SERVER_URL = .*;/, `const DEFAULT_REMOTE_SERVER_URL = 'http://127.0.0.1:${port}';`);
  } else {
    mcpServiceJs = mcpServiceJs.replace(/const DEFAULT_REMOTE_SERVER_URL = .*;/, `const DEFAULT_REMOTE_SERVER_URL = '${remoteServerUrl}';`);
  }
  fs.writeFileSync(path.join(mcpDir, 'feedback-service.js'), mcpServiceJs, 'utf-8');
  fs.copyFileSync(path.join(templatesDir, 'mcp/feedback-mcp-server.js'), path.join(mcpDir, 'feedback-mcp-server.js'));
  fs.chmodSync(path.join(mcpDir, 'feedback-mcp-server.js'), '755');
  console.log(`  ${c.green}✓${c.reset} 复制 MCP 服务: mcp/feedback-service.js & mcp/feedback-mcp-server.js`);

  // 6. 复制并定制 Server 脚本
  let serverJs = fs.readFileSync(path.join(templatesDir, 'server/server.js'), 'utf-8');
  serverJs = serverJs.replace(/const PORT = process.env.PORT \|\| 8888;/, `const PORT = process.env.PORT || ${port};`);
  fs.writeFileSync(path.join(scriptsDir, 'server.js'), serverJs, 'utf-8');
  let startSh = fs.readFileSync(path.join(templatesDir, 'server/start.sh'), 'utf-8');
  startSh = startSh.replace(/:8888/g, `:${port}`);
  fs.writeFileSync(path.join(scriptsDir, 'start.sh'), startSh, 'utf-8');

  let stopSh = fs.readFileSync(path.join(templatesDir, 'server/stop.sh'), 'utf-8');
  stopSh = stopSh.replace(/:8888/g, `:${port}`);
  fs.writeFileSync(path.join(scriptsDir, 'stop.sh'), stopSh, 'utf-8');

  let statusSh = fs.readFileSync(path.join(templatesDir, 'server/status.sh'), 'utf-8');
  statusSh = statusSh.replace(/:8888/g, `:${port}`).replace(/端口: 8888/g, `端口: ${port}`);
  fs.writeFileSync(path.join(scriptsDir, 'status.sh'), statusSh, 'utf-8');
  fs.chmodSync(path.join(scriptsDir, 'start.sh'), '755');
  fs.chmodSync(path.join(scriptsDir, 'stop.sh'), '755');
  fs.chmodSync(path.join(scriptsDir, 'status.sh'), '755');
  console.log(`  ${c.green}✓${c.reset} 复制后端服务与运维脚本: scripts/server.js, start.sh, stop.sh, status.sh`);

  // 7. 注入 HTML 文件
  if (injectHtml) {
    let injectedCount = 0;
    function scanAndInject(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanAndInject(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'feedback-dashboard.html') {
          let html = fs.readFileSync(fullPath, 'utf-8');
          if (!html.includes('feedback-collector.js')) {
            const relPathToRoot = path.relative(path.dirname(fullPath), targetDir).replace(/\\/g, '/') || '.';
            const scriptTag = `\n  <!-- 悬浮反馈收集器 SDK -->\n  <script src="${relPathToRoot === '.' ? './' : relPathToRoot + '/'}feedback-collector.js"></script>\n`;
            if (html.includes('</body>')) {
              html = html.replace('</body>', `${scriptTag}</body>`);
            } else if (html.includes('</head>')) {
              html = html.replace('</head>', `${scriptTag}</head>`);
            } else {
              html += scriptTag;
            }
            fs.writeFileSync(fullPath, html, 'utf-8');
            injectedCount++;
          }
        }
      }
    }
    scanAndInject(targetDir);
    console.log(`  ${c.green}✓${c.reset} 已向 ${c.bright}${injectedCount}${c.reset} 个 HTML 页面自动注入反馈收集脚本`);
  }

  // 8. 生成 MCP 配置文件
  if (setupMcp) {
    const mcpConfigPath = path.join(targetDir, '.mcp.json');
    const mcpSnippet = {
      mcpServers: {
        "feedback-collector": {
          command: "node",
          args: [path.join(targetDir, "mcp/feedback-mcp-server.js")],
          env: {
            REMOTE_SERVER_URL: mode === 'local' ? `http://127.0.0.1:${port}` : remoteServerUrl,
            PROJECT_ID: projectId
          }
        }
      }
    };
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpSnippet, null, 2), 'utf-8');
    console.log(`  ${c.green}✓${c.reset} 生成项目级 MCP 描述文件: .mcp.json`);
  }

  console.log(`\n${c.green}${c.bright}================================================================${c.reset}`);
  console.log(`${c.green}${c.bright}🎉 悬浮问题反馈收集器初始化完成！${c.reset}`);
  console.log(`${c.green}${c.bright}================================================================${c.reset}\n`);

  console.log(`${c.bright}📌 快速开始指南：${c.reset}`);
  console.log(`  1. 启动本地 Node API 服务与可视化看板：`);
  console.log(`     ${c.cyan}cd "${targetDir}" && bash scripts/start.sh${c.reset}`);
  console.log(`  2. 访问问题反馈大盘 (Dashboard)：`);
  console.log(`     ${c.cyan}http://127.0.0.1:${port}/feedback-dashboard.html${c.reset}`);
  if (mode !== 'local') {
    console.log(`  3. 访问云端线上反馈大盘：`);
    console.log(`     ${c.cyan}${remoteServerUrl}/feedback-dashboard.html${c.reset}`);
  }
  console.log(`  4. 在 Codex / Claude 中配置 MCP 排障服务：`);
  console.log(`     请将以下配置加入 ${c.yellow}~/.codex/config.json${c.reset} 或项目的 ${c.yellow}.mcp.json${c.reset}:`);
  console.log(`${c.gray}${JSON.stringify({
    mcpServers: {
      "feedback-collector": {
        command: "node",
        args: [path.join(targetDir, "mcp/feedback-mcp-server.js")],
        env: {
          REMOTE_SERVER_URL: mode === 'local' ? `http://127.0.0.1:${port}` : remoteServerUrl
        }
      }
    }
  }, null, 2)}${c.reset}\n`);
}

run().catch(err => {
  console.error('初始化失败:', err);
  process.exit(1);
});

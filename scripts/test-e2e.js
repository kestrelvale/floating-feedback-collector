#!/usr/bin/env node

/**
 * 悬浮反馈收集器 Skill 自动化测试用例
 * 验证 local, online, hybrid 三种模式在独立目录下的初始化与产物完整性
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testBaseDir = path.resolve(__dirname, '../.tmp-test');
if (fs.existsSync(testBaseDir)) fs.rmSync(testBaseDir, { recursive: true, force: true });
fs.mkdirSync(testBaseDir, { recursive: true });

const modes = ['local', 'online', 'hybrid'];
let allPassed = true;

console.log('\n🔍 开始执行 悬浮反馈收集器 Skill 自动化测试...\n');

for (const mode of modes) {
  const targetDir = path.join(testBaseDir, `test-${mode}`);
  fs.mkdirSync(targetDir, { recursive: true });

  // 模拟一个待接入的 HTML 页面
  fs.writeFileSync(path.join(targetDir, 'index.html'), '<!DOCTYPE html><html><head><title>Demo</title></head><body><h1>Hello World</h1></body></html>', 'utf-8');

  console.log(`[测试模式: ${mode}] 正在运行初始化...`);
  try {
    const cmd = `node "${path.resolve(__dirname, '../cli/init.js')}" --mode=${mode} --target="${targetDir}" --port=9090 --remote-url="http://test-server.com:23333" --inject --mcp --yes`;
    execSync(cmd, { stdio: 'pipe' });

    // 校验核心文件
    const requiredFiles = [
      'feedback-collector.js',
      'html2canvas.min.js',
      'feedback-dashboard.html',
      'mcp/feedback-service.js',
      'mcp/feedback-mcp-server.js',
      'scripts/server.js',
      'scripts/start.sh',
      'scripts/stop.sh',
      'scripts/status.sh',
      'data/feedback_database.json',
      '.mcp.json'
    ];

    for (const relFile of requiredFiles) {
      const fullPath = path.join(targetDir, relFile);
      if (!fs.existsSync(fullPath)) {
        console.error(`  ❌ 缺失必要文件: ${relFile}`);
        allPassed = false;
      }
    }

    // 校验 HTML 注入
    const modifiedHtml = fs.readFileSync(path.join(targetDir, 'index.html'), 'utf-8');
    if (!modifiedHtml.includes('feedback-collector.js')) {
      console.error(`  ❌ index.html 未成功注入 feedback-collector.js`);
      allPassed = false;
    }

    // 校验 mode 替换
    const collectorCode = fs.readFileSync(path.join(targetDir, 'feedback-collector.js'), 'utf-8');
    if (!collectorCode.includes(`const RUNTIME_MODE = '${mode}';`)) {
      console.error(`  ❌ feedback-collector.js 中的 RUNTIME_MODE 未正确设置为 ${mode}`);
      allPassed = false;
    }

    console.log(`  ✅ 模式 ${mode} 初始化与产物自检通过！`);
  } catch (err) {
    console.error(`  ❌ 模式 ${mode} 测试失败:`, err.message);
    allPassed = false;
  }
}

// 清理测试目录
fs.rmSync(testBaseDir, { recursive: true, force: true });

if (allPassed) {
  console.log('\n🎉 全部 3 种模式自动化测试通过，Skill 产物质量合格！\n');
  process.exit(0);
} else {
  console.error('\n❌ 存在未通过的测试项，请检查！\n');
  process.exit(1);
}

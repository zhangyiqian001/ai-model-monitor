/**
 * 本地独立版启动脚本（跨平台，Windows/Linux/macOS 通用）
 *
 * 流程：编译 server（nest build）→ 编译 client（vite build）→ 启动 server（单进程 3000）
 * 相比 scripts/dev-local.js（依赖 lark-cli 与平台配置），本脚本不依赖任何平台环境。
 */
const { spawnSync } = require('child_process');
const net = require('net');

const env = { ...process.env, NODE_ENV: 'production' };

function run(cmd, args) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`\n[本地启动] 步骤失败：${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

(async () => {
  const port = Number(process.env.SERVER_PORT || 3000);
  if (await portBusy(port)) {
    console.error(`\n[本地启动] 端口 ${port} 已被占用——服务可能已在运行（http://127.0.0.1:${port}）。`);
    console.error('如需重启：先关闭旧进程（任务管理器结束 node，或重启电脑），再重新运行 npm run start:local。');
    process.exit(1);
  }

  // 1. 编译 server（TypeScript → dist/server）
  run('npx', ['nest', 'build']);
  // 2. 编译 client（vite build → dist/client）
  run('npx', ['vite', 'build', '--config', 'vite.config.ts']);
  // 3. 前台启动 server（单进程，监听 SERVER_PORT，默认 127.0.0.1:3000）
  console.log('\n>>> 启动服务（Ctrl+C 停止）...');
  run('node', ['dist/server/main.js']);
})();

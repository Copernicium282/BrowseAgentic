import { loadConfig } from './config.js';
import { orchestrator } from './orchestrator.js';
import { createServer, startServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  console.error('[boot] Config loaded');

  await orchestrator.init(config);
  console.error('[boot] Browser orchestrator initialized');

  await orchestrator.setupGuardrails();
  console.error('[boot] Security guardrails active');

  const server = createServer(orchestrator, config);
  await startServer(server);

  const shutdown = async () => {
    console.error('[shutdown] Cleaning up...');
    await orchestrator.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});

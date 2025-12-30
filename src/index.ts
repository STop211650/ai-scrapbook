import { env } from './config/env.js';
import app from './app.js';

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`AI Scrapbook API running on http://localhost:${PORT}`);
  console.log(`AI Provider: ${env.AI_PROVIDER}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

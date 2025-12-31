import express from 'express';
import { errorMiddleware } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import captureRoutes from './routes/capture.js';
import searchRoutes from './routes/search.js';
import askRoutes from './routes/ask.js';
import memoryRoutes from './routes/memory.js';
import itemsRoutes from './routes/items.js';
import exportRoutes from './routes/export.js';
import summarizeRoutes from './routes/summarize.js';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/capture', captureRoutes);
app.use('/search', searchRoutes);
app.use('/ask', askRoutes);
app.use('/memory', memoryRoutes);
app.use('/items', itemsRoutes);
app.use('/export', exportRoutes);
app.use('/summarize', summarizeRoutes);

// Error handling
app.use(errorMiddleware);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

export default app;


import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';

async function startServer() {
  const app = express();
  const port = 3000;

  // Yahoo Finance Proxy Endpoint
  app.get('/api/yahoo-finance', async (req, res) => {
    const { symbol, period1, period2, interval, events } = req.query;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}&events=${events}`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error(`Error fetching Yahoo data for ${symbol}:`, error.message);
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // Yahoo Finance Search Proxy
  app.get('/api/yahoo-search', async (req, res) => {
    const { q } = req.query;
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error(`Error searching Yahoo for ${q}:`, error.message);
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();

/**
 * Mock Booking Site Server
 * 
 * LEARNING CONCEPT: Practice Environment
 * ---------------------------------------
 * This creates a local server with a simulated booking site.
 * Practice your automation here before working with real sites!
 * 
 * Run: node mock-site/server.js
 * Open: http://localhost:3000
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// Read HTML file
const htmlPath = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  // Enable CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (req.url === '/api/seats') {
    // Simulated seat API
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(generateSeats()));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

function generateSeats() {
  const rows = 'ABCDEFGHIJKLMN'.split('');
  const seatsPerRow = 16;
  
  return rows.map(row => ({
    row,
    seats: Array.from({ length: seatsPerRow }, (_, i) => ({
      number: i + 1,
      available: Math.random() > 0.3, // 70% available
      category: row <= 'E' ? 'classic' : row <= 'K' ? 'prime' : 'recliner',
      price: row <= 'E' ? 150 : row <= 'K' ? 250 : 400,
    }))
  }));
}

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎬 Mock Movie Booking Site Running!                         ║
║                                                               ║
║   Open in browser: http://localhost:${PORT}                      ║
║                                                               ║
║   This is a safe practice environment for learning            ║
║   browser automation with Playwright.                         ║
║                                                               ║
║   Press Ctrl+C to stop the server                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

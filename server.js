// WebSocket Server for Live Camera Streaming
// Install dependencies: npm install ws express cors

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store connected clients
const broadcasters = new Set(); // Camera senders
const viewers = new Set();      // Poe Canvas receivers

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    broadcasters: broadcasters.size,
    viewers: viewers.size
  });
});

wss.on('connection', (ws, req) => {
  console.log('New connection established');

  // Handle messages from clients
  ws.on('message', (data) => {
    try {
      // Convert Buffer to string if needed
      const dataString = data.toString();
      const message = JSON.parse(dataString);

      if (message.type === 'register') {
        // Client registers as broadcaster or viewer
        if (message.role === 'broadcaster') {
          broadcasters.add(ws);
          ws.role = 'broadcaster';
          console.log('Broadcaster registered. Total broadcasters:', broadcasters.size);

          // Notify all viewers that broadcaster is online
          viewers.forEach(viewer => {
            if (viewer.readyState === 1) { // OPEN
              viewer.send(JSON.stringify({ type: 'broadcaster_status', online: true }));
            }
          });
        } else if (message.role === 'viewer') {
          viewers.add(ws);
          ws.role = 'viewer';
          console.log('Viewer registered. Total viewers:', viewers.size);

          // Notify viewer if broadcaster is online
          ws.send(JSON.stringify({
            type: 'broadcaster_status',
            online: broadcasters.size > 0
          }));
        }
      } else if (message.type === 'frame') {
        // Broadcaster sends a frame - forward to all viewers
        if (ws.role === 'broadcaster') {
          let sentCount = 0;
          viewers.forEach(viewer => {
            if (viewer.readyState === 1) { // OPEN
              viewer.send(dataString); // Forward the frame as string
              sentCount++;
            }
          });
          // Optionally send feedback to broadcaster
          // ws.send(JSON.stringify({ type: 'ack', viewers: sentCount }));
        }
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    if (ws.role === 'broadcaster') {
      broadcasters.delete(ws);
      console.log('Broadcaster disconnected. Remaining:', broadcasters.size);

      // Notify viewers that broadcaster went offline
      if (broadcasters.size === 0) {
        viewers.forEach(viewer => {
          if (viewer.readyState === 1) {
            viewer.send(JSON.stringify({ type: 'broadcaster_status', online: false }));
          }
        });
      }
    } else if (ws.role === 'viewer') {
      viewers.delete(ws);
      console.log('Viewer disconnected. Remaining:', viewers.size);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

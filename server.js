// WebSocket Server for Live Camera Streaming
// Install dependencies: npm install ws express cors

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store connected clients with IDs
const broadcasters = new Map(); // broadcasterId -> { ws, name }
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
          // Generate unique broadcaster ID
          const broadcasterId = crypto.randomUUID();
          ws.broadcasterId = broadcasterId;
          ws.role = 'broadcaster';
          ws.broadcasterName = message.name || 'Model ' + (broadcasters.size + 1);

          broadcasters.set(broadcasterId, {
            ws: ws,
            name: ws.broadcasterName
          });

          console.log('Broadcaster registered:', broadcasterId, '- Total:', broadcasters.size);

          // Notify all viewers that this broadcaster is online
          viewers.forEach(viewer => {
            if (viewer.readyState === 1) { // OPEN
              viewer.send(JSON.stringify({
                type: 'broadcaster_status',
                online: true,
                broadcasterId: broadcasterId,
                name: ws.broadcasterName
              }));
            }
          });
        } else if (message.role === 'viewer') {
          viewers.add(ws);
          ws.role = 'viewer';
          console.log('Viewer registered. Total viewers:', viewers.size);

          // Notify viewer about all current broadcasters
          broadcasters.forEach((broadcaster, broadcasterId) => {
            ws.send(JSON.stringify({
              type: 'broadcaster_status',
              online: true,
              broadcasterId: broadcasterId,
              name: broadcaster.name
            }));
          });
        }
      } else if (message.type === 'frame') {
        // Broadcaster sends a frame - forward to all viewers with broadcaster ID
        if (ws.role === 'broadcaster') {
          const frameMessage = JSON.stringify({
            type: 'frame',
            data: message.data,
            broadcasterId: ws.broadcasterId,
            name: ws.broadcasterName,
            timestamp: message.timestamp
          });

          let sentCount = 0;
          viewers.forEach(viewer => {
            if (viewer.readyState === 1) { // OPEN
              viewer.send(frameMessage);
              sentCount++;
            }
          });
        }
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    if (ws.role === 'broadcaster') {
      const broadcasterId = ws.broadcasterId;
      broadcasters.delete(broadcasterId);
      console.log('Broadcaster disconnected:', broadcasterId, '- Remaining:', broadcasters.size);

      // Notify viewers that this specific broadcaster went offline
      viewers.forEach(viewer => {
        if (viewer.readyState === 1) {
          viewer.send(JSON.stringify({
            type: 'broadcaster_status',
            online: false,
            broadcasterId: broadcasterId
          }));
        }
      });
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

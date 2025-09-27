import express from 'express';
import { ChefChatService } from '../ChefChatService';

const router = express.Router();
const chefChatService = new ChefChatService();

// Helper function to get user ID from request
const getUserId = (req: any): string => {
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('User not authenticated');
  }
  return userId;
};

// ===== CHEF CHAT ROUTES =====

// Send message to Chef with streaming
router.post('/chat/stream', async (req, res) => {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');

  // Helper function to send SSE data
  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };

  try {
    const { message, sessionId } = req.body;
    const userId = getUserId(req);

    if (!message) {
      sendData(JSON.stringify({ error: 'Missing required field: message' }));
      return res.end();
    }

    // Process with streaming Chef
    const result = await chefChatService.sendMessageStream({
      userId,
      message: message.trim(),
      sessionId,
      onChunk: (chunk: string) => {
        sendData(JSON.stringify({ type: 'chunk', content: chunk }));
      },
      onComplete: (result: any) => {
        if (result.error) {
          sendData(JSON.stringify({ type: 'error', error: result.error }));
        } else {
          sendData(JSON.stringify({ type: 'complete', result }));
        }
        res.end();
      }
    });

  } catch (error) {
    console.error('[CHEF CHAT STREAM ERROR]', error);
    sendData(JSON.stringify({ type: 'error', error: error.message }));
    res.end();
  }
});

// Get user's chef chat sessions
router.get('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessions = await chefChatService.getUserSessions(userId);
    res.json(sessions);
  } catch (error) {
    console.error('[GET CHEF SESSIONS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new chef chat session
router.post('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { title } = req.body;
    const session = await chefChatService.createSession(userId, title);
    res.json(session);
  } catch (error) {
    console.error('[CREATE CHEF SESSION ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a specific session
router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { sessionId } = req.params;
    const messages = await chefChatService.getSessionHistory(userId, sessionId);
    res.json(messages);
  } catch (error) {
    console.error('[GET CHEF MESSAGES ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete chef chat session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { sessionId } = req.params;
    await chefChatService.deleteSession(userId, sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE CHEF SESSION ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== PROFILE SYNC ROUTES =====

// Sync user profile to chef memory
router.post('/profile/sync', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { profile } = req.body;

    let profilePayload = profile;
    if (!profilePayload) {
      // Fallback: load profile from DB and map it
      const existing = await chefChatService.getUserProfile(userId);
      profilePayload = existing?.profile;
    }

    const result = await chefChatService.syncUserProfile(userId, profilePayload);
    res.json(result);
  } catch (error) {
    console.error('[CHEF PROFILE SYNC ROUTE ERROR]', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      engine: 'chef-ultrathink'
    });
  }
});

// Get mapped user profile from DB (for debugging/clients)
router.get('/profile', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await chefChatService.getUserProfile(userId);
    if (!result) {
      return res.status(404).json({ message: 'No profile found' });
    }
    res.json(result);
  } catch (error) {
    console.error('[CHEF PROFILE GET ROUTE ERROR]', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      engine: 'chef-ultrathink'
    });
  }
});

export default router;
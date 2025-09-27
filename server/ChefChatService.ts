import { SimplifiedUltraThink } from './mem0/SimplifiedUltraThink';
import { ProfileSyncService } from './mem0/ProfileSyncService';
import { db } from "./db";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  chefChatSessions,
  chefChatMessages,
} from "@shared/schema";
import {
  mapProfilePayloadToUltraThink,
  buildProfileMemorySummary,
  computeProfileSignature,
  collectPreferenceCategories,
  type UltraThinkProfileData,
} from './mem0/profileUtils';

export class ChefChatService {
  private ultraThink: SimplifiedUltraThink;
  private profileSyncService: ProfileSyncService;

  constructor() {
    this.ultraThink = new SimplifiedUltraThink();
    this.profileSyncService = new ProfileSyncService();
  }

  async ensureSession(userId: string, sessionId?: string) {
    if (sessionId) return sessionId;
    const [s] = await db
      .insert(chefChatSessions)
      .values({ user_id: userId })
      .returning({ id: chefChatSessions.id });
    return s.id as string;
  }

  async sendMessageStream(params: {
    userId: string;
    sessionId?: string;
    message: string;
    onChunk: (chunk: string) => void;
    onComplete: (result: any) => void;
  }) {
    const { userId, message, onChunk, onComplete } = params;

    try {
      // Ensure session exists
      const sessionId = await this.ensureSession(userId, params.sessionId);

      console.log('[CHEF CHAT STREAM]', {
        model: 'Chef UltraThink',
        sessionId,
        messageLength: message.length
      });

      // Auto-sync user profile to ensure chef has access to goals and preferences
      try {
        const existing = await this.profileSyncService.getUserProfile(userId);
        if (existing?.profile) {
          await this.syncUserProfile(userId, existing.profile);
        }
      } catch (profileError) {
        console.warn('[CHEF CHAT] Profile sync failed, continuing without profile:', profileError);
      }

      // Store user message in PostgreSQL
      await db.insert(chefChatMessages).values({
        session_id: sessionId,
        user_id: userId,
        role: "user",
        content: message,
      });

      // Default system prompt for chef (you can customize this later)
      const systemPrompt = "You are a helpful AI chef assistant. Help users with cooking, recipes, meal planning, and nutrition advice. Use the user's profile information including their dietary goals, restrictions, and preferences to provide personalized recommendations.";

      // Process with streaming UltraThink (using community_id 0 as placeholder for personal chef)
      const result = await this.ultraThink.processConversationStream(
        userId,
        message,
        0, // Use 0 as placeholder community_id for personal chef chat
        onChunk,
        systemPrompt
      );

      // Store assistant response in PostgreSQL
      if (result?.fullResponse) {
        await db.insert(chefChatMessages).values({
          session_id: sessionId,
          user_id: null, // null for assistant
          role: "assistant",
          content: result.fullResponse,
          token_count: result.totalTokens || 0,
        });
      }

      onComplete(result);
    } catch (error) {
      console.error('[CHEF CHAT ERROR]', error);
      onComplete({ error: error.message });
    }
  }

  async getSessionHistory(userId: string, sessionId: string) {
    const messages = await db
      .select()
      .from(chefChatMessages)
      .where(eq(chefChatMessages.session_id, sessionId))
      .orderBy(asc(chefChatMessages.created_at));

    return messages;
  }

  async getUserSessions(userId: string) {
    const sessions = await db
      .select()
      .from(chefChatSessions)
      .where(eq(chefChatSessions.user_id, userId))
      .orderBy(desc(chefChatSessions.last_message_at));

    return sessions;
  }

  async createSession(userId: string, title?: string) {
    const [session] = await db
      .insert(chefChatSessions)
      .values({ user_id: userId, title })
      .returning();

    return session;
  }

  async deleteSession(userId: string, sessionId: string) {
    await db
      .delete(chefChatSessions)
      .where(and(
        eq(chefChatSessions.id, sessionId),
        eq(chefChatSessions.user_id, userId)
      ));
  }

  async syncUserProfile(userId: string, profilePayload: any) {
    try {
      // Sync profile to UltraThink memory
      await this.ultraThink.storeUserProfile(userId, profilePayload);

      // Also store in ProfileSyncService for persistence
      await this.profileSyncService.syncProfile(userId, profilePayload);

      return { success: true, message: 'Profile synced to chef memory' };
    } catch (error) {
      console.error('[CHEF PROFILE SYNC ERROR]', error);
      throw error;
    }
  }

  async getUserProfile(userId: string) {
    return await this.profileSyncService.getUserProfile(userId);
  }
}
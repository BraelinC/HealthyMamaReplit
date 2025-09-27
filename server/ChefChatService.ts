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

      // Smart system prompt with intent detection
      const systemPrompt = `You are an intelligent AI chef assistant with smart routing capabilities. Analyze user requests and respond based on their intent:

**INTENT DETECTION:**
- **Single Meal Request**: If user asks for ONE specific dish/recipe (e.g., "make chicken dinner", "help with pasta", "cook salmon"), respond with: {"type": "single_meal", "query": "[extracted dish name]", "ingredients": ["ingredient1", "ingredient2"]}
- **Multiple Meals Request**: If user asks for meal planning (e.g., "plan my week", "meal plan for 5 days", "what should I eat this week"), respond with: {"type": "meal_plan", "days": [number], "preferences": "[extracted preferences]"}
- **General Chat**: For general cooking questions, tips, or conversation, respond normally with helpful text.

**USER PROFILE ACCESS**: Use the user's profile information including their dietary goals, restrictions, and preferences to provide personalized recommendations.

**RESPONSE FORMAT**:
- For single meals: Return ONLY the JSON object with type "single_meal"
- For meal plans: Return ONLY the JSON object with type "meal_plan"
- For general chat: Respond with helpful cooking advice in plain text

Always prioritize the user's dietary goals and restrictions from their profile when making recommendations.`;

      // Process with streaming UltraThink (using community_id 0 as placeholder for personal chef)
      const result = await this.ultraThink.processConversationStream(
        userId,
        message,
        0, // Use 0 as placeholder community_id for personal chef chat
        onChunk,
        systemPrompt
      );

      let finalResponse = result?.response || result?.fullResponse;
      let structuredData = null;

      // Check if response is JSON (intent detection)
      try {
        const parsed = JSON.parse(finalResponse);
        if (parsed.type === 'single_meal') {
          // Route to recipe search API
          structuredData = await this.handleSingleMealRequest(parsed, userId);
          finalResponse = `I found some great recipes for ${parsed.query}! Check out the detailed recipes below.`;
        } else if (parsed.type === 'meal_plan') {
          // Route to meal plan generation API
          structuredData = await this.handleMealPlanRequest(parsed, userId);
          finalResponse = `I've created a meal plan for you! Here are your personalized meals.`;
        }
      } catch (parseError) {
        // Not JSON, treat as regular chat response
        console.log('[CHEF CHAT] Regular chat response (not JSON intent)');
      }

      // Store assistant response in PostgreSQL
      await db.insert(chefChatMessages).values({
        session_id: sessionId,
        user_id: null, // null for assistant
        role: "assistant",
        content: finalResponse,
        token_count: result?.totalTokens || 0,
        metadata: structuredData ? { structuredData } : {},
      });

      // Return enhanced result with structured data
      const enhancedResult = {
        ...result,
        response: finalResponse,
        fullResponse: finalResponse,
        structuredData,
        sessionId
      };

      onComplete(enhancedResult);
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

  async handleSingleMealRequest(intentData: any, userId: string) {
    try {
      console.log('[CHEF SINGLE MEAL]', { query: intentData.query, userId });

      // Call the intelligent search API (same logic as in routes.ts)
      const searchQuery = intentData.query;

      const requestBody = {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a recipe search expert. Find detailed recipes with ingredients, instructions, and cooking times. Always include precise ingredient measurements and step-by-step cooking instructions.'
          },
          {
            role: 'user',
            content: `Find 3 detailed recipes for: ${searchQuery}. For each recipe include: exact ingredients with measurements, step-by-step instructions, cooking time, prep time, difficulty level (1-5), and serving size.`
          }
        ],
        max_tokens: 1500,
        temperature: 0.3,
        top_p: 0.9,
        return_citations: true,
        search_domain_filter: ["allrecipes.com", "foodnetwork.com", "epicurious.com", "bonappetit.com", "seriouseats.com"]
      };

      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        throw new Error('Perplexity API key not configured');
      }

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      const recipes = data.choices?.[0]?.message?.content || 'No recipes found';

      return {
        type: 'recipe_search',
        query: searchQuery,
        recipes: recipes,
        citations: data.citations || [],
        rawResponse: data
      };

    } catch (error) {
      console.error('[CHEF SINGLE MEAL ERROR]', error);
      return {
        type: 'recipe_search',
        query: intentData.query,
        error: error.message,
        recipes: `Sorry, I couldn't find recipes for "${intentData.query}" right now. Please try again or be more specific with your request.`
      };
    }
  }

  async handleMealPlanRequest(intentData: any, userId: string) {
    try {
      console.log('[CHEF MEAL PLAN]', { days: intentData.days, userId });

      // TODO: Implement meal plan generation using enhancedMealPlanGenerator
      // This will be implemented in the next step

      return {
        type: 'meal_plan',
        days: intentData.days,
        message: 'Meal plan generation coming soon! For now, try asking for individual recipes.'
      };

    } catch (error) {
      console.error('[CHEF MEAL PLAN ERROR]', error);
      return {
        type: 'meal_plan',
        error: error.message,
        message: 'Sorry, meal plan generation is not available right now.'
      };
    }
  }
}
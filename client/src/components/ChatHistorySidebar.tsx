import { useState } from "react";
import { MessageSquare, Plus, Search, Calendar } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  preview: string;
}

export function ChatHistorySidebar() {
  const [searchQuery, setSearchQuery] = useState("");

  // Mock chat sessions - in real app this would come from API/state
  const chatSessions: ChatSession[] = [
    {
      id: "1",
      title: "Meal Planning Help",
      timestamp: new Date("2025-09-23T10:30:00"),
      preview: "Hello! How can I assist you today! Are you looking for keto recipes or tips?"
    },
    {
      id: "2",
      title: "Keto Recipe Ideas",
      timestamp: new Date("2025-09-23T09:15:00"),
      preview: "I'd like some low-carb dinner options that are family-friendly..."
    },
    {
      id: "3",
      title: "Weekly Meal Prep",
      timestamp: new Date("2025-09-22T14:20:00"),
      preview: "Can you help me plan meals for the week that I can prep on Sunday?"
    },
    {
      id: "4",
      title: "Vegetarian Options",
      timestamp: new Date("2025-09-22T11:45:00"),
      preview: "Looking for protein-rich vegetarian meals for muscle building..."
    },
    {
      id: "5",
      title: "Quick Breakfast Ideas",
      timestamp: new Date("2025-09-21T08:30:00"),
      preview: "What are some healthy breakfast options I can make in under 10 minutes?"
    }
  ];

  const filteredSessions = chatSessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInDays === 1) {
      return "Yesterday";
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleNewChat = () => {
    // In real app, this would create a new chat session
    console.log("Starting new chat...");
  };

  return (
    <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center justify-between p-2">
          <h2 className="text-lg font-semibold text-sidebar-foreground">Chat History</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/50" />
            <SidebarInput
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Recent Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredSessions.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-sidebar-foreground/60">
                  {searchQuery ? "No conversations found" : "No chat history yet"}
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      className="flex flex-col items-start h-auto py-3 px-3 hover:bg-sidebar-accent"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <MessageSquare className="h-4 w-4 text-sidebar-foreground/70 flex-shrink-0" />
                        <span className="font-medium text-sm truncate flex-1">
                          {session.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 w-full mt-1">
                        <Calendar className="h-3 w-3 text-sidebar-foreground/50 flex-shrink-0" />
                        <span className="text-xs text-sidebar-foreground/50">
                          {formatTimestamp(session.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-sidebar-foreground/60 line-clamp-2 mt-1 text-left">
                        {session.preview}
                      </p>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="p-2">
          <Button
            onClick={handleNewChat}
            className="w-full justify-start gap-2"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
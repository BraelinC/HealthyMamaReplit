import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Chat from "./Chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Mem0Chat from "@/components/community/Mem0Chat";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Users, Calendar, MessageSquare, Heart, ChefHat, ArrowLeft, Settings,
  Pin, ThumbsUp, MessageCircle, Share2, Camera, Plus, Search,
  Clock, TrendingUp, User, MoreHorizontal, Send, Menu, X,
  ChevronDown, CheckCircle, Play, BookOpen, Share, Eye, ChevronLeft, ChevronRight,
  Trash2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/ImageUploader";
import { 
  getCommunityPostsCache, 
  addToPostsCache, 
  updatePostInCache,
  isPostsCacheFresh,
  getPostsCacheKey 
} from "@/lib/postsCache";
import { MealPlanEditor } from "@/components/community/MealPlanEditor";
import { CreateRecipe } from "@/components/CreateRecipe";
import { LessonEditor } from "@/components/community/LessonEditor";
import EnhancedLessonEditor from "@/components/community/EnhancedLessonEditor";
import InlineLessonEditor from "@/components/community/InlineLessonEditor";
import RecipeDisplay from "@/components/RecipeDisplay";
import CourseManagement from "@/components/CourseManagement";
import AdvancedCommentOverlay from "@/components/AdvancedCommentOverlay";
import ImageLightbox from "@/components/ImageLightbox";
import { useRef } from "react";

interface Community {
  id: number;
  name: string;
  description: string;
  creator_id: string;
  member_count: number;
  category: string;
  is_public: boolean;
  created_at: string;
  cover_image?: string;
  isMember?: boolean;
  isCreator?: boolean;
}

interface CommunityPost {
  id: number;
  user_id: string;
  author_id: string; // Add author_id for checking post ownership
  username: string;
  user_avatar?: string;
  content: string;
  post_type: 'meal_share' | 'discussion' | 'question' | 'announcement';
  meal_plan_id?: number;
  meal_title?: string;
  meal_image?: string;
  meal_plan?: any; // Full meal plan data for meal_share posts
  images?: string[];
  likes_count: number;
  comments_count: number;
  is_pinned: boolean;
  is_liked: boolean;
  created_at: string;
}

interface MealPlan {
  id: number;
  title: string;
  description: string;
  image_url?: string;
  video_url?: string;
  youtube_video_id?: string;
  ingredients: string[];
  instructions: string[];
  prep_time?: number;
  cook_time?: number;
  servings?: number;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  creator_name: string;
  created_at: string;
  likes_count: number;
  is_liked: boolean;
}

// Meal Plans Classroom Component (Skool-style)
function MealPlansClassroom({ 
  communityId, 
  isCreator, 
  isStudentViewMode, 
  setIsStudentViewMode 
}: { 
  communityId?: string; 
  isCreator: boolean;
  isStudentViewMode: boolean;
  setIsStudentViewMode: (value: boolean) => void;
}) {
  const [showCreateCourseForm, setShowCreateCourseForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [selectedLesson, setSelectedLesson] = useState<any>(null);
  const [showLessonView, setShowLessonView] = useState(false);
  const [showMealPlanEditor, setShowMealPlanEditor] = useState(false);
  const [expandedCourses, setExpandedCourses] = useState<number[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Detect mobile for overlay preview behavior
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch courses from API
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: [`/api/communities/${communityId}/courses`, isStudentViewMode],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/communities/${communityId}/courses`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch courses');
      const data = await response.json();
      
      // Filter courses based on user role and view mode
      if (isCreator && !isStudentViewMode) {
        // Creators in normal mode see all courses (published and drafts)
        return data;
      } else {
        // Regular users and creators in student view only see published courses
        return data.filter((course: any) => course.is_published);
      }
    },
    enabled: !!communityId,
  });

  // Toggle course expansion
  const toggleCourseExpansion = (courseId: number) => {
    setExpandedCourses(prev => {
      const isExpanded = prev.includes(courseId);
      const next = isExpanded ? prev.filter(id => id !== courseId) : [...prev, courseId];

      // When expanding, kick off background preload of lesson preview data
      if (!isExpanded) {
        const course = (courses as any[]).find((c: any) => c.id === courseId);
        if (course) {
          preloadCourseLessons(course);
        }
      }
      return next;
    });
  };

  // Background preloading of lesson preview data for faster mobile overlay
  const preloadCourseLessons = async (course: any) => {
    try {
      const gatherLessons = () => {
        const moduleLessons = (course.modules || []).flatMap((m: any) => m.lessons || []);
        const topLessons = (course.lessons || []).filter((l: any) => !l.module_id);
        return [...moduleLessons, ...topLessons];
      };

      const lessons = gatherLessons();
      if (!lessons || lessons.length === 0) return;

      // Stagger requests slightly to avoid burst
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        // If already in sessionStorage, skip
        if (sessionStorage.getItem(`lesson-preview-${lesson.id}`)) continue;

        // Small delay between fetches
        // eslint-disable-next-line no-await-in-loop
        await new Promise(res => setTimeout(res, 75));

        // Build a lightweight preview payload from already-loaded course data
        const previewData = {
          title: lesson.title,
          description: lesson.description,
          emoji: lesson.emoji,
          image_url: lesson.image_url,
          youtube_video_id: lesson.youtube_video_id,
          recipe_name: lesson.recipe_name,
          meal_type: lesson.meal_type,
          cuisine: lesson.cuisine,
          difficulty_level: lesson.difficulty_level,
          prep_time: lesson.prep_time,
          cook_time: lesson.cook_time,
          servings: lesson.servings,
          ingredients: lesson.ingredients || [],
          instructions: lesson.instructions || [],
          sections: lesson.sections || [],
          sectionStates: {
            basicInfo: true,
            mediaVideo: true,
            recipeDetails: true,
            lessonSections: true,
          },
          id: lesson.id,
          course_id: course.id,
          community_id: communityId,
        } as any;

        sessionStorage.setItem(`lesson-preview-${lesson.id}`, JSON.stringify(previewData));
      }
    } catch (err) {
      console.warn('Preload lessons failed:', err);
    }
  };

  // Loading state
  if (coursesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading courses...</p>
        </div>
      </div>
    );
  }

  if (showLessonView && selectedLesson) {
    if (isMobile) {
      const previewUrl = `/community/${communityId}/lesson/${selectedLesson.id || 'new'}/preview`;
      return (
        <div className="fixed inset-0 z-[100000] bg-black/90 backdrop-blur-sm">
          <button
            className="absolute top-3 left-3 z-[100001] text-white bg-gray-800/90 hover:bg-gray-700 rounded px-3 py-1"
            onClick={() => setShowLessonView(false)}
            aria-label="Back"
          >
            ← Back
          </button>
          <iframe
            src={previewUrl}
            className="absolute inset-0 w-full h-full border-0"
            title="Lesson Preview"
          />
        </div>
      );
    }
    // Desktop: show the lesson editor as an overlay above the page
    return (
      <div className="fixed inset-0 z-[100010] bg-black/70 backdrop-blur-sm overflow-auto p-2 sm:p-4">
        <div className="max-w-5xl mx-auto">
          <InlineLessonEditor
            lesson={selectedLesson}
            communityId={communityId || ''}
            courseId={selectedCourse?.id || 0}
            isCreator={isCreator}
            onClose={() => setShowLessonView(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Creator Course Management */}
      {isCreator && (
        <div className="flex justify-center -mt-2">
          <Button
            onClick={() => {
              toast({
                title: "Course Creation Coming Soon",
                description: "Use the floating + button to create meals instead!",
              });
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Courses
          </Button>
        </div>
      )}

      {/* User View Indicator */}
      {isCreator && isStudentViewMode && (
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3 -mt-1">
          <p className="text-sm text-blue-400 flex items-center gap-2">
            <Eye className="w-4 h-4" />
            User View Mode - Showing only published courses visible to users
          </p>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            {isCreator && !isStudentViewMode ? "No Courses Created Yet" : "No Published Courses Available"}
          </h3>
          <p className="text-gray-400 mb-6">
            {isCreator && !isStudentViewMode
              ? "Create your first course to get started with meal planning!" 
              : isCreator && isStudentViewMode
              ? "No published courses visible to users yet. Exit User View to see drafts."
              : "The creator hasn't published any courses yet. Check back soon!"
            }
          </p>
          {isCreator && !isStudentViewMode && (
            <Button
              onClick={() => {
                toast({
                  title: "Course Creation Coming Soon",
                  description: "Use the floating + button to create meals instead!",
                });
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Course
            </Button>
          )}
        </div>
      ) : (
        // Course Cards Grid - 3 Column Layout
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course: any) => (
            <Card
              key={course.id}
              className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-all duration-200 cursor-pointer group overflow-hidden flex flex-col"
              onClick={() => toggleCourseExpansion(course.id)}
            >
              {/* Course Cover Image - Square Layout for Grid */}
              <div className="relative h-40 bg-gradient-to-br from-purple-600 via-blue-600 to-emerald-600 overflow-hidden">
                {course.cover_image ? (
                  <img 
                    src={course.cover_image} 
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl opacity-80">{course.emoji || '📚'}</span>
                  </div>
                )}
                
                {/* Status Badge - Only show for creators not in student view */}
                {!isStudentViewMode && (
                  <div className="absolute top-3 right-3">
                    {course.is_published ? (
                      <Badge className="bg-green-600/90 text-white text-xs backdrop-blur-sm">
                        Published
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-600/90 text-white text-xs backdrop-blur-sm">
                        Draft
                      </Badge>
                    )}
                  </div>
                )}

                {/* Progress Bar - Bottom of Image */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                  <div 
                    className="h-full bg-white/80 transition-all duration-300"
                    style={{ width: '0%' }} // TODO: Calculate actual progress
                  />
                </div>
              </div>

              {/* Course Content */}
              <CardContent className="p-4 flex-1">
                <div className="space-y-3">
                  {/* Title and Stats */}
                  <div>
                    <h3 className="font-semibold text-white text-lg lg:text-xl leading-tight group-hover:text-purple-300 transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-gray-400 text-sm lg:text-base mt-1 line-clamp-2">
                      {course.description || "Comprehensive meal planning course with practical lessons"}
                    </p>
                  </div>

                  {/* Course Stats */}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {course.lesson_count} lessons
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        0 enrolled
                      </span>
                    </div>
                    <span className="font-medium">0%</span>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2">
                    <Button 
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCourseExpansion(course.id);
                      }}
                    >
                      {expandedCourses.includes(course.id) ? (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Hide Lessons
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 mr-1" />
                          View Lessons
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>

              {/* Expanded Lessons - Mobile Friendly */}
              {expandedCourses.includes(course.id) && (
                <div className="border-t border-gray-700 bg-gray-800/50">
                  <div className="p-4 space-y-3">
                    {/* Modules */}
                    {course.modules?.map((module: any) => (
                      <div key={module.id} className="space-y-2">
                        <div className="flex items-center gap-2 py-2 px-3 bg-purple-600/20 rounded-lg">
                          <BookOpen className="h-4 w-4 text-purple-400 flex-shrink-0" />
                          <span className="text-purple-300 font-medium text-sm">{module.title}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {module.lessons?.length || 0} lessons
                          </span>
                        </div>
                        
                        {/* Module Lessons */}
                        <div className="space-y-1 ml-4">
                          {module.lessons?.map((lesson: any) => (
                            <div
                              key={lesson.id}
                              className="flex items-center gap-3 py-2 px-3 hover:bg-gray-700/50 rounded cursor-pointer transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCourse(course);
                                setSelectedLesson(lesson);
                                setShowLessonView(true);
                              }}
                            >
                              <span className="text-sm">🍽️</span>
                              <span className="text-white text-sm font-medium flex-1">{lesson.title}</span>
                              {lesson.prep_time && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {lesson.prep_time + (lesson.cook_time || 0)}min
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    {/* Standalone Lessons */}
                    {course.lessons?.filter((lesson: any) => !lesson.module_id).map((lesson: any) => (
                      <div
                        key={lesson.id}
                        className="flex items-center gap-3 py-2 px-3 hover:bg-gray-700/50 rounded cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCourse(course);
                          setSelectedLesson(lesson);
                          setShowLessonView(true);
                        }}
                      >
                        <span className="text-sm">🍽️</span>
                        <span className="text-white text-sm font-medium flex-1">{lesson.title}</span>
                        {lesson.prep_time && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {lesson.prep_time + (lesson.cook_time || 0)}min
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}



      {/* Meal Plan Editor Modal for Creators - TEMPORARILY DISABLED due to infinite render loop */}
      {/* {showMealPlanEditor && isCreator && (
        <MealPlanEditor 
          communityId={communityId || ''} 
          onClose={() => {
            setShowMealPlanEditor(false);
            // Refresh the courses list
            queryClient.invalidateQueries({ queryKey: [`/api/communities/${communityId}/courses`] });
          }}
        />
      )} */}
    </div>
  );
}

export default function CommunityDetailNew() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newPostContent, setNewPostContent] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [postOverlayOpen, setPostOverlayOpen] = useState(false);
  const [postLightboxOpen, setPostLightboxOpen] = useState(false);
  const [postLightboxSrc, setPostLightboxSrc] = useState<string | null>(null);
  const [showMealPlanEditorMain, setShowMealPlanEditorMain] = useState(false);
  const [showCourseManagement, setShowCourseManagement] = useState(false);
  const sidebarFileRef = useRef<HTMLInputElement>(null);
  const uploadSidebarImage = async (file: File): Promise<string> => {
    const response = await fetch('/api/objects/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: file.name, contentType: file.type }),
    });
    if (!response.ok) throw new Error('Failed to get upload URL');
    const { url } = await response.json();
    const uploadResponse = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!uploadResponse.ok) throw new Error('Failed to upload image');
    const downloadResponse = await fetch('/api/objects/download-url', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: file.name }),
    });
    if (!downloadResponse.ok) return `/objects/uploads/${file.name}`;
    const { downloadUrl } = await downloadResponse.json();
    return downloadUrl;
  };

  const ChangeCommunityImageButton = ({ communityId, hasImage, onChanged }: { communityId: string; hasImage: boolean; onChanged: () => void }) => {
    const handlePick = () => sidebarFileRef.current?.click();
    const onFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type.startsWith('image/')) return;
      try {
        const url = await uploadSidebarImage(file);
        await fetch(`/api/communities/${communityId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cover_image: url }),
        });
        onChanged();
      } catch (e) {
        console.error('Failed to update cover image', e);
      }
    };
    return (
      <>
        <Button variant="outline" size="sm" className="w-full border-gray-600 text-gray-200" onClick={handlePick}>
          {hasImage ? 'Change Image' : 'Add Image'}
        </Button>
        <input ref={sidebarFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </>
    );
  };
  
  // Tab state
  const [activeTab, setActiveTab] = useState("community");
  
  // Meal Plans state
  const [isStudentViewMode, setIsStudentViewMode] = useState(false);
  
  // Extractor state variables
  const [extractorUrl, setExtractorUrl] = useState("");
  const [extractedRecipe, setExtractedRecipe] = useState<any>(null);
  const [allExtractedRecipes, setAllExtractedRecipes] = useState<any[]>([]);
  const [selectedExtractedRecipeIndex, setSelectedExtractedRecipeIndex] = useState(0);
  const [extractionInProgress, setExtractionInProgress] = useState(false);
  
  // My Recipes Carousel state
  const recipeFilters = ["Recent", "Breakfast", "Lunch", "Dinner", "Baking", "Sweets"];
  const [selectedUserRecipeIndex, setSelectedUserRecipeIndex] = useState(0);
  const [recipeFilter, setRecipeFilter] = useState("Recent");
  
  // Delete post state
  const [postToDelete, setPostToDelete] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const navigateToPost = (postId: number) => {
    setLocation(`/community/${id}/post/${postId}`);
  };

  // Persist last visited community for quick return from Communities
  useEffect(() => {
    try {
      const uid = (user as any)?.id || (user as any)?.user?.id;
      if (uid && id) {
        localStorage.setItem(`lastCommunityId:${uid}`, String(id));
      }
    } catch {}
  }, [id, user]);

  
  // Fetch community details
  const { data: community, isLoading } = useQuery({
    queryKey: ["/api/communities", id],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest(`/api/communities/${id}`, {
        method: "GET",
      });
    },
    enabled: !!id && isAuthenticated,
  });

  // Fetch user's communities for the header switcher
  const { data: myCommunities = [] } = useQuery({
    queryKey: ['/api/communities/my-communities'],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest('/api/communities/my-communities', { method: 'GET' });
    },
    enabled: !!isAuthenticated,
  });

  // Fetch user's recipes
  const { data: fetchedRecipes = [] } = useQuery({
    queryKey: ["/api/recipes/user"],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest("/api/recipes/user", {
        method: "GET",
      });
    },
    enabled: !!user && isAuthenticated,
  });

  // Use useMemo to compute filtered recipes to prevent infinite renders
  const filteredRecipes = useMemo(() => {
    const recipes = fetchedRecipes || [];
    
    if (recipeFilter === "Recent") {
      // Sort by most recent
      return [...recipes].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (recipeFilter === "All" || !recipeFilter) {
      // Show all recipes
      return recipes;
    } else {
      // Filter by meal type
      return recipes.filter(recipe => 
        recipe.meal_type === recipeFilter || 
        recipe.category === recipeFilter ||
        recipe.cuisine?.toLowerCase().includes(recipeFilter.toLowerCase())
      );
    }
  }, [fetchedRecipes, recipeFilter]);

  // Smart posts loading with 50-post cache for instant loading
  const [cachedPosts, setCachedPosts] = useState<CommunityPost[]>([]);
  const [showCachedData, setShowCachedData] = useState(false);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedUserRecipeIndex(0);
  }, [recipeFilter]);

  // Check cache immediately when component loads
  useEffect(() => {
    if (id) {
      const cached = getCommunityPostsCache(id);
      if (cached.length > 0) {
        setCachedPosts(cached as CommunityPost[]);
        setShowCachedData(true);
        // console.log('⚡ Using cached posts for instant loading:', cached.length, 'posts');
      }
    }
  }, [id]);

  // Fetch fresh posts from API
  const { data: freshPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: [`/api/communities/${id}/posts`, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeFilter !== "all") {
        params.append("type", activeFilter === "meal-shares" ? "meal_share" : activeFilter);
      }
      // Load more posts for better cache coverage
      params.append("limit", "50");
      const queryString = params.toString();
      const url = `/api/communities/${id}/posts${queryString ? `?${queryString}` : ""}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch posts');
      const posts = await response.json();
      
      // Update cache with fresh data
      if (id && posts.length > 0) {
        addToPostsCache(id, posts);
        setCachedPosts(posts);
      }
      
      return posts;
    },
    enabled: !!id && !!community,
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  // Use cached posts for instant display, fresh posts when available
  const posts = freshPosts.length > 0 ? freshPosts : cachedPosts;

  // Check if user is already a member based on memberInfo existence
  const isMember = community?.memberInfo || community?.isMember;
  
  const isCreator = community?.memberInfo?.role === 'creator' || community?.creator_id === (user as any)?.user?.id || community?.creator_id === (user as any)?.id;

  // Mock posts data (replace with real API call later)
  const mockPosts: CommunityPost[] = [
    {
      id: 1,
      user_id: "user_123",
      author_id: "user_123",
      username: "Sarah Chen",
      content: "Just shared my latest 7-day meal prep plan focused on high-protein, budget-friendly meals! Perfect for busy families.",
      post_type: "meal_share",
      meal_plan_id: 123,
      meal_title: "High-Protein Family Meal Prep",
      meal_image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=200&fit=crop",
      likes_count: 15,
      comments_count: 8,
      is_pinned: true,
      is_liked: false,
      created_at: "2 hours ago"
    },
    {
      id: 2,
      user_id: "user_456",
      author_id: "user_456",
      username: "Mike Johnson",
      content: "Welcome to our community! This is the place to share your meal planning wins, ask questions, and discover new recipes. Let's support each other on our healthy eating journey! 🥗",
      post_type: "announcement",
      likes_count: 24,
      comments_count: 12,
      is_pinned: false,
      is_liked: true,
      created_at: "1 day ago"
    },
    {
      id: 3,
      user_id: "user_789",
      author_id: "user_789",
      username: "Emily Rodriguez",
      content: "Quick question - has anyone tried meal prepping with a toddler around? Looking for tips on how to make it work with little ones 'helping' in the kitchen! 😅",
      post_type: "question",
      likes_count: 7,
      comments_count: 15,
      is_pinned: false,
      is_liked: false,
      created_at: "3 days ago"
    }
  ];

  // Create new post mutation
  const createPostMutation = useMutation({
    mutationFn: async ({ content, images }: { content: string; images: string[] }) => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest(`/api/communities/${id}/posts`, {
        method: "POST",
        body: JSON.stringify({ 
          content, 
          post_type: "discussion",
          images: images || [],
        }),
      });
    },
    onSuccess: (newPost) => {
      setNewPostContent("");
      setSelectedImages([]);
      
      // Add new post to cache immediately for instant UI update
      if (id && newPost) {
        const currentCache = getCommunityPostsCache(id);
        const updatedCache = [newPost, ...currentCache].slice(0, 50);
        queryClient.setQueryData(getPostsCacheKey(id), updatedCache);
        setCachedPosts(updatedCache as CommunityPost[]);
      }
      
      // Invalidate queries to refresh from API in background
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`, activeFilter] });
      
      toast({
        title: "Post shared!",
        description: "Your post has been shared with the community.",
      });
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async (postId: number) => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest(`/api/communities/${id}/posts/${postId}/like`, {
        method: "POST",
      });
    },
    onSuccess: (result, postId) => {
      // Update cache immediately for instant UI feedback
      if (id) {
        const currentCache = getCommunityPostsCache(id);
        const post = currentCache.find(p => p.id === postId);
        if (post) {
          const wasLiked = post.is_liked;
          updatePostInCache(id, postId, {
            is_liked: !wasLiked,
            likes_count: wasLiked ? post.likes_count - 1 : post.likes_count + 1
          });
          
          // Update local state immediately
          const updatedCache = currentCache.map(p => 
            p.id === postId 
              ? { ...p, is_liked: !wasLiked, likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1 }
              : p
          );
          setCachedPosts(updatedCache as CommunityPost[]);
        }
      }
      
      // Refresh from API in background
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`, activeFilter] });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to toggle like. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Join community mutation
  const joinCommunityMutation = useMutation({
    mutationFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest(`/api/communities/${id}/join`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", id] });
      toast({
        title: "Welcome!",
        description: "You've joined the community successfully.",
      });
    },
  });

  // Recipe extraction mutation
  const extractRecipeMutation = useMutation({
    mutationFn: async () => {
      // console.log("🚀 [EXTRACTOR DEBUG] Starting extraction for URL:", extractorUrl);
      const { apiRequest } = await import("@/lib/queryClient");
      setExtractionInProgress(true);
      
      // console.log("📤 [EXTRACTOR DEBUG] Making API request to /api/extract-meal-plan");
      const result = await apiRequest("/api/extract-meal-plan", {
        method: "POST",
        body: JSON.stringify({ url: extractorUrl }),
      });
      
      // console.log("📥 [EXTRACTOR DEBUG] API response received:", result);
      return result;
    },
    onSuccess: (result) => {
      // console.log("✅ [EXTRACTOR DEBUG] Extraction successful:", result);
      setExtractedRecipe(result.recipe);
      setAllExtractedRecipes(result.allRecipes || [result.recipe]);
      setSelectedExtractedRecipeIndex(0);
      setExtractionInProgress(false);
      const totalCount = result.allRecipes?.length || 1;
      toast({
        title: "Recipe Extracted!",
        description: totalCount > 1 
          ? `Successfully extracted ${totalCount} recipes! Showing the best one.`
          : `Successfully extracted "${result.recipe.title}"`,
      });
    },
    onError: (error: any) => {
      console.error("❌ [EXTRACTOR DEBUG] Extraction failed with error:", error);
      console.error("❌ [EXTRACTOR DEBUG] Error details:", {
        message: error.message,
        status: error.status,
        stack: error.stack,
        fullError: error
      });
      
      setExtractionInProgress(false);
      
      // Check if it's a rate limit error
      const isRateLimit = error.message?.includes('Rate limit') || error.message?.includes('429');
      
      toast({
        title: isRateLimit ? "API Rate Limit Reached" : "Extraction Failed",
        description: isRateLimit 
          ? "The AI service has reached its daily limit. Please try again later or with a single recipe URL."
          : error.message || "Failed to extract recipe. Please try again.",
        variant: "destructive",
      });
    },
  });

  // PDF extraction mutation
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const extractPdfMutation = useMutation({
    mutationFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      setPdfExtracting(true);
      return await apiRequest("/api/extract-recipe-from-pdf", {
        method: "POST",
        body: JSON.stringify({ pdfUrl })
      });
    },
    onSuccess: (result) => {
      setExtractedRecipe(result.recipe);
      setAllExtractedRecipes([result.recipe]);
      setSelectedExtractedRecipeIndex(0);
      setPdfExtracting(false);
      toast({ title: "PDF Extracted!", description: `Parsed ${result.textLength} chars.` });
    },
    onError: (error: any) => {
      setPdfExtracting(false);
      toast({ title: "PDF Extraction Failed", description: error.message || "Unable to parse PDF", variant: "destructive" });
    }
  });

  const handleUploadPdfExtract = async () => {
    if (!pdfFile) return;
    try {
      setPdfExtracting(true);
      const base64 = await new Promise<string>((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const idx = result.indexOf(',');
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfFile);
        } catch (e) {
          reject(e as any);
        }
      });
      const { apiRequest } = await import("@/lib/queryClient");
      const result = await apiRequest("/api/extract-recipe-from-pdf", {
        method: "POST",
        body: JSON.stringify({ pdfBase64: base64 })
      });
      setExtractedRecipe(result.recipe);
      setAllExtractedRecipes([result.recipe]);
      setSelectedExtractedRecipeIndex(0);
      toast({ title: "PDF Extracted!", description: `Parsed ${result.textLength} chars.` });
    } catch (error: any) {
      toast({ title: "PDF Extraction Failed", description: error?.message || "Unable to parse PDF", variant: "destructive" });
    } finally {
      setPdfExtracting(false);
    }
  };

  // Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      const { apiRequest } = await import("@/lib/queryClient");
      return await apiRequest(`/api/communities/${id}/posts/${postId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (result, postId) => {
      // Remove post from cache immediately for instant UI update
      if (id) {
        const currentCache = getCommunityPostsCache(id);
        const updatedCache = currentCache.filter(p => p.id !== postId);
        queryClient.setQueryData(getPostsCacheKey(id), updatedCache);
        setCachedPosts(updatedCache as CommunityPost[]);
      }
      
      // Refresh from API in background
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`, activeFilter] });
      
      // Close the dialog and reset state
      setShowDeleteDialog(false);
      setPostToDelete(null);
      
      toast({
        title: "Post Deleted",
        description: "The post has been removed from the community.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to delete post. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle delete post confirmation
  const handleDeletePost = (postId: number) => {
    setPostToDelete(postId);
    setShowDeleteDialog(true);
  };

  const confirmDeletePost = () => {
    if (postToDelete) {
      deletePostMutation.mutate(postToDelete);
    }
  };

  // Select a different recipe from the extracted list
  const selectRecipe = (index: number) => {
    // Ensure index is within valid range
    const validIndex = Math.max(0, Math.min(index, allExtractedRecipes.length - 1));
    setSelectedExtractedRecipeIndex(validIndex);
    
    // Ensure we have a valid recipe at this index
    if (allExtractedRecipes[validIndex]) {
      setExtractedRecipe(allExtractedRecipes[validIndex]);
    }
  };

  // Clear all extracted recipes
  const clearExtractedRecipes = () => {
    setExtractedRecipe(null);
    setAllExtractedRecipes([]);
    setSelectedExtractedRecipeIndex(0);
    setExtractorUrl("");
  };

  // Recipe carousel navigation functions
  const selectUserRecipe = (index: number) => {
    setSelectedUserRecipeIndex(index);
  };

  const nextUserRecipe = () => {
    if (selectedUserRecipeIndex < filteredRecipes.length - 1) {
      setSelectedUserRecipeIndex(selectedUserRecipeIndex + 1);
    }
  };

  const prevUserRecipe = () => {
    if (selectedUserRecipeIndex > 0) {
      setSelectedUserRecipeIndex(selectedUserRecipeIndex - 1);
    }
  };

  // MyRecipesCarousel Component
  const MyRecipesCarousel = () => {
    const currentRecipe = filteredRecipes[selectedUserRecipeIndex];

    if (filteredRecipes.length === 0) {
      return (
        <div className="mb-8">
          {/* Filter Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {recipeFilters.map((filter) => (
              <Button
                key={filter}
                onClick={() => setRecipeFilter(filter)}
                variant={recipeFilter === filter ? "default" : "outline"}
                size="sm"
                className={
                  recipeFilter === filter
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                    : "border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
                }
              >
                {filter}
              </Button>
            ))}
          </div>

          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-8 text-center">
              <ChefHat className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-white mb-2">No Recipes Yet</h3>
              <p className="text-gray-400 mb-4">Create your first recipe to get started!</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Recipe
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Badge className="bg-emerald-600 text-white">
            {filteredRecipes.length} Recipes
          </Badge>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {recipeFilters.map((filter) => (
            <Button
              key={filter}
              onClick={() => setRecipeFilter(filter)}
              variant={recipeFilter === filter ? "default" : "outline"}
              size="sm"
              className={
                recipeFilter === filter
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  : "border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
              }
            >
              {filter}
            </Button>
          ))}
        </div>

        {/* Carousel */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            {/* Navigation Controls */}
            {filteredRecipes.length > 1 && (
              <div className="flex items-center justify-center gap-4 mb-4">
                {/* Previous Button */}
                {selectedUserRecipeIndex > 0 && (
                  <Button
                    onClick={prevUserRecipe}
                    variant="outline"
                    size="sm"
                    className="hidden sm:flex border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden md:inline ml-1">Previous</span>
                  </Button>
                )}
                
                {/* Dot Navigation */}
                <div className="flex items-center gap-2 flex-1 justify-center">
                  {filteredRecipes.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => selectUserRecipe(index)}
                      className={`w-3 h-3 rounded-full transition-colors shrink-0 ${
                        index === selectedUserRecipeIndex 
                          ? 'bg-emerald-500' 
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    />
                  ))}
                </div>
                
                {/* Next Button */}
                {selectedUserRecipeIndex < filteredRecipes.length - 1 && (
                  <Button
                    onClick={nextUserRecipe}
                    variant="outline"
                    size="sm"
                    className="hidden sm:flex border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
                  >
                    <span className="hidden md:inline mr-1">Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}

            {/* Mobile Navigation Info */}
            {filteredRecipes.length > 1 && (
              <div className="text-center mb-4 text-sm text-gray-400">
                Recipe {selectedUserRecipeIndex + 1} of {filteredRecipes.length}
              </div>
            )}

            {/* Current Recipe Display */}
            {currentRecipe && (
              <div className="bg-gray-700 rounded-lg">
                <Tabs defaultValue="ingredients" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-600">
                    <TabsTrigger value="ingredients" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Ingredients</TabsTrigger>
                    <TabsTrigger value="instructions" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Instructions</TabsTrigger>
                    <TabsTrigger value="nutrition" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Nutrition</TabsTrigger>
                  </TabsList>
                  
                  <div className="p-4">
                    {/* Recipe Header */}
                    <div className="flex items-start gap-4 mb-4">
                      {/* Recipe Image */}
                      <div className="w-20 h-20 bg-gray-600 rounded-lg flex items-center justify-center shrink-0">
                        {currentRecipe.image_url ? (
                          <img 
                            src={currentRecipe.image_url} 
                            alt={currentRecipe.title}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <ChefHat className="w-8 h-8 text-gray-400" />
                        )}
                      </div>

                      {/* Recipe Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white mb-1 truncate">
                          {currentRecipe.title}
                        </h3>
                        <p className="text-gray-400 text-sm mb-2 line-clamp-2">
                          {currentRecipe.description}
                        </p>
                        
                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {currentRecipe.prep_time || currentRecipe.time_minutes || 30}min prep
                          </span>
                          <span className="flex items-center gap-1">
                            <ChefHat className="w-3 h-3" />
                            {currentRecipe.servings || 4} servings
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <TabsContent value="ingredients" className="mt-0">
                      <div className="space-y-2">
                        {currentRecipe.ingredients?.length > 0 ? (
                          currentRecipe.ingredients.map((ingredient: any, index: number) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-gray-600 rounded">
                              <Checkbox id={`ingredient-${index}`} className="border-gray-400" />
                              <label 
                                htmlFor={`ingredient-${index}`} 
                                className="text-sm text-gray-200 cursor-pointer flex-1"
                              >
                                {ingredient.display_text || ingredient.name || ingredient}
                              </label>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-400 text-sm">No ingredients available</p>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="instructions" className="mt-0">
                      <div className="space-y-3">
                        {currentRecipe.instructions?.length > 0 ? (
                          currentRecipe.instructions.map((instruction: string, index: number) => (
                            <div key={index} className="flex gap-3">
                              <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                                {index + 1}
                              </div>
                              <p className="text-gray-200 text-sm leading-relaxed">{instruction}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-400 text-sm">No instructions available</p>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="nutrition" className="mt-0">
                      <div className="text-center py-8">
                        <p className="text-gray-400 text-sm">Nutrition information coming soon...</p>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // Share extracted recipe to community
  const shareExtractedRecipe = async () => {
    if (!extractedRecipe) return;
    
    try {
      const { apiRequest } = await import("@/lib/queryClient");
      await apiRequest(`/api/communities/${id}/posts`, {
        method: "POST",
        body: JSON.stringify({
          content: `Check out this recipe I extracted: ${extractedRecipe.title}`,
          post_type: "meal_share",
          recipe_data: extractedRecipe,
        }),
      });
      
      // Clear extracted recipe and reset form
      setExtractedRecipe(null);
      setAllExtractedRecipes([]);
      setSelectedExtractedRecipeIndex(0);
      setExtractorUrl("");
      
      // Refresh posts
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${id}/posts`] });
      
      toast({
        title: "Recipe Shared!",
        description: "Your extracted recipe has been shared with the community.",
      });
    } catch (error: any) {
      toast({
        title: "Share Failed",
        description: error.message || "Failed to share recipe. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold mb-2">Community not found</h2>
          <Link href="/communities">
            <Button variant="outline">Back to Communities</Button>
          </Link>
        </div>
      </div>
    );
  }

  const getPostTypeIcon = (type: string) => {
    switch (type) {
      case 'meal_share': return <ChefHat className="w-4 h-4" />;
      case 'announcement': return <Pin className="w-4 h-4" />;
      case 'question': return <MessageCircle className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getPostTypeBadge = (type: string) => {
    switch (type) {
      case 'meal_share': return <Badge className="bg-green-600 text-white">Meal Share</Badge>;
      case 'announcement': return <Badge className="bg-blue-600 text-white">Announcement</Badge>;
      case 'question': return <Badge className="bg-orange-600 text-white">Question</Badge>;
      default: return <Badge className="bg-gray-600 text-white">Discussion</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 text-white overflow-y-auto z-[9999]" style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 9999
    }}>
      {/* Mobile Header - Sticky position */}
      <header className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-white p-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-sm bg-gradient-to-br from-purple-500 to-emerald-500 text-white font-semibold">
                  {community.name[0]}
                </AvatarFallback>
              </Avatar>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-white px-2 py-1 flex items-center gap-1">
                    <span className="font-semibold text-lg truncate max-w-[50vw]">{community.name}</span>
                    <ChevronDown className="w-4 h-4 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-gray-800 border-gray-700 text-white w-64 max-h-80 overflow-auto z-[2147483647]" align="start">
                  <div className="px-3 py-2 text-xs uppercase tracking-wide text-gray-400">Your Communities</div>
                  {Array.isArray(myCommunities) && myCommunities.length > 0 ? (
                    myCommunities.map((c: any) => (
                      <DropdownMenuItem
                        key={c.id}
                        className="hover:bg-gray-700 focus:bg-gray-700 cursor-pointer"
                        onClick={() => setLocation(`/community/${c.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-semibold">
                            {String(c.name || '').charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm">{c.name}</span>
                            {c.member_count != null && (
                              <span className="text-[10px] text-gray-400">{c.member_count} members</span>
                            )}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-400">No communities yet</div>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => {
                      console.log('🟣 [Header Dropdown] Discover Communities clicked');
                      setLocation('/communities?list=1');
                    }}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Discover Communities
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => {
                      console.log('🟣 [Header Dropdown] Create Community clicked');
                      setLocation('/communities?create=1&list=1');
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Community
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Creator Dashboard Access */}
            {isCreator && (
              <div className="flex items-center gap-2 mr-2">
                <Badge className="bg-emerald-600 text-white text-xs">
                  Creator
                </Badge>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab Navigation - Sticky position */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full bg-gray-900">
        <TabsList className="sticky top-0 z-40 w-full bg-gray-800 border-b border-gray-700 rounded-none h-12">
          <TabsTrigger value="community" className="flex-1 bg-gray-800 text-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white hover:bg-gray-700 hover:text-white">
            Community
          </TabsTrigger>
          <TabsTrigger value="meals" className="flex-1 bg-gray-800 text-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white hover:bg-gray-700 hover:text-white">
            Meal Plans
          </TabsTrigger>
          <TabsTrigger value="members" className="flex-1 bg-gray-800 text-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white hover:bg-gray-700 hover:text-white">
            AI Chat
          </TabsTrigger>
          <TabsTrigger value="extractor" className="flex-1 bg-gray-800 text-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white hover:bg-gray-700 hover:text-white">
            Extractor
          </TabsTrigger>
        </TabsList>

        {/* Community Tab Content */}
        <TabsContent value="community" className="p-4 bg-gray-900 min-h-screen">
          <div className="relative max-w-7xl mx-auto md:block">
            <div className="max-w-2xl md:max-w-none md:pr-[360px] mx-auto space-y-4">
          {/* Community Stats Banner - Only show for non-members */}
          {!isMember && (
            <Card className="bg-gradient-to-r from-purple-600 to-blue-600 border-none">
              <CardContent className="p-4 text-white">
                <h3 className="font-semibold mb-2">Join {community.name}</h3>
                <p className="text-sm mb-3 opacity-90">{community.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{community.member_count} members</span>
                  <Button 
                    onClick={() => joinCommunityMutation.mutate()}
                    disabled={joinCommunityMutation.isPending}
                    className="bg-white text-purple-600 hover:bg-gray-100"
                  >
                    {joinCommunityMutation.isPending ? "Joining..." : "Join Community"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Post Creation - Only show for members (simplified) */}
          {isMember && (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="px-3 py-4">
                <div className="flex gap-3 items-start">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-sm bg-gradient-to-br from-purple-500 to-emerald-500 text-white font-semibold">
                      {(() => {
                        const u: any = user;
                        const name = u?.full_name || u?.user?.full_name || u?.email || 'U';
                        const parts = String(name).trim().split(' ').filter(Boolean);
                        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
                        return (parts[0]?.[0] || name[0] || 'U').toUpperCase();
                      })()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Write something..."
                      value={newPostContent}
                      onFocus={() => setPostOverlayOpen(true)}
                      onChange={(e) => setNewPostContent(e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {["all", "updates", "discussions", "questions", "meal-shares"].map((filter) => (
              <Button
                key={filter}
                variant={activeFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(filter)}
                className={`flex-shrink-0 capitalize ${
                  activeFilter === filter 
                    ? "bg-purple-600 text-white" 
                    : "bg-gray-800 text-gray-300 border-gray-600"
                }`}
              >
                {filter.replace("-", " ")}
              </Button>
            ))}
          </div>

            {/* Posts Feed */}
            <div className="space-y-4">
            {posts.length === 0 && !postsLoading && (
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-6 text-center">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No posts yet</h3>
                  <p className="text-gray-400">Be the first to share something with the community!</p>
                </CardContent>
              </Card>
            )}
            {posts.map((post: any) => (
              <Card 
                key={post.id} 
                className="bg-gray-800 border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors"
                onClick={() => navigateToPost(post.id)}
              >
                <CardContent className="px-3 py-4">
                  {/* Post Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-emerald-500 text-white font-semibold">
                          {(post.author?.full_name || post.username || 'U')[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-white">{post.author?.full_name || post.username}</h4>
                          {getPostTypeBadge(post.post_type)}
                        </div>
                        <p className="text-sm text-gray-400">{post.created_at}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {post.is_pinned && <Pin className="w-4 h-4 text-purple-400" />}
                      {/* Creator Controls */}
                      {isCreator && (
                        <div className="flex items-center gap-1 ml-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-green-400 hover:text-green-300 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast({ title: "Post pinned", description: "This post is now pinned to the top." });
                            }}
                          >
                            <Pin className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-orange-400 hover:text-orange-300 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast({ title: "Post hidden", description: "This post has been hidden from the community." });
                            }}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                      {/* Creator-only dropdown menu */}
                      {isCreator ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-gray-400 hover:text-white p-1"
                              >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-gray-800 border-gray-700" align="end">
                            <DropdownMenuItem
                              className="text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePost(post.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Post
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            // console.log("🔴 THREE DOTS BUTTON CLICKED! Post ID:", post.id);
                            // console.log("🔴 BUTTON CLICK EVENT:", e);
                            // console.log("🔴 POST DATA:", post);
                            toast({ title: "Button clicked", description: "Three dots menu button was clicked!" });
                          }}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="mb-4">
                    {/* New layout: Title + body with thumbnail on the right */}
                    {(() => {
                      if (post.post_type === 'meal_share') return null;
                      const raw = (post.content || '').toString();
                      const parts = raw.split('\n');
                      const title = parts.shift() || '';
                      const body = parts.join('\n');
                      const thumb = post.images && post.images.length > 0 ? post.images[0] : null;
                      return (
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            {title && (
                              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">{title}</h3>
                            )}
                            {body && (
                              <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{body}</p>
                            )}
                          </div>
                          {thumb && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPostLightboxSrc(thumb); setPostLightboxOpen(true); }}
                              className="block"
                            >
                              <img
                                src={thumb}
                                alt="Post thumbnail"
                                className="w-28 h-24 sm:w-32 sm:h-24 object-cover rounded-lg bg-gray-700 shrink-0 cursor-zoom-in"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {/* Only show content for non-meal_share posts */}
                    {post.post_type !== 'meal_share' && false && (
                      <p className="text-gray-200 mb-3">{post.content}</p>
                    )}
                    
                    {/* Post Images */}
                    {post.post_type === 'meal_share' && post.images && post.images.length > 0 && (
                      <div className={`grid gap-2 mb-3 ${
                        post.images.length === 1 ? 'grid-cols-1' :
                        post.images.length === 2 ? 'grid-cols-2' :
                        'grid-cols-2'
                      }`}>
                        {post.images.slice(0, 4).map((imageUrl: string, index: number) => (
                          <div key={index} className="relative group">
                            <button
                              type="button"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                // Debug: Image click to open lightbox
                                try { 
                                  // eslint-disable-next-line no-console
                                  console.log('🖼️ [Post Image Click] Opening lightbox for:', imageUrl);
                                } catch {}
                                setPostLightboxSrc(imageUrl); 
                                setPostLightboxOpen(true); 
                              }}
                              className="block w-full"
                            >
                              <img
                                src={imageUrl}
                                alt={`Post image ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg bg-gray-700 cursor-zoom-in"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </button>
                            {post.images!.length > 4 && index === 3 && (
                              <div className="absolute inset-0 bg-black bg-opacity-60 rounded-lg flex items-center justify-center">
                                <span className="text-white font-medium">+{post.images!.length - 4}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Meal Share with Tabs - Always show for meal_share posts */}
                    {post.post_type === 'meal_share' ? (
                      <div className="bg-gray-700 rounded-lg mb-3" onClick={(e) => e.stopPropagation()}>
                        <Tabs defaultValue="message" className="w-full">
                          <TabsList className="grid w-full grid-cols-2 bg-gray-600">
                            <TabsTrigger value="message" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Message</TabsTrigger>
                            <TabsTrigger value="meal" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Meal</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="message" className="p-4">
                            <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
                              {post.content}
                            </p>
                          </TabsContent>
                          
                          <TabsContent value="meal" className="p-4">
                            {post.meal_plan ? (
                              <div>
                                <RecipeDisplay
                                  recipe={(() => {
                                  // Extract the first recipe from the meal plan
                                  const mealPlan = post.meal_plan?.meal_plan;
                                  
                                  // Debug: Log the entire meal plan structure
                                  // console.log('=== DEBUG: Full meal plan data ===', {
                                  //   meal_plan: post.meal_plan,
                                  //   mealPlan: mealPlan
                                  // });
                                  
                                  const firstDay = mealPlan?.day_1 || mealPlan?.days?.day1;
                                  const firstMeal = firstDay?.breakfast || firstDay?.lunch || firstDay?.dinner;
                                  
                                  // Debug: Log the extracted meal
                                  // console.log('=== DEBUG: Extracted meal ===', {
                                  //   firstDay,
                                  //   firstMeal,
                                  //   ingredients: firstMeal?.ingredients,
                                  //   ingredientsType: Array.isArray(firstMeal?.ingredients) ? 'array' : typeof firstMeal?.ingredients,
                                  //   hasVideoId: !!firstMeal?.video_id,
                                  //   video_id: firstMeal?.video_id,
                                  //   video_title: firstMeal?.video_title,
                                  //   video_channel: firstMeal?.video_channel
                                  // });
                                  
                                  if (!firstMeal) {
                                    // console.log('=== DEBUG: No meal found, returning default ===');
                                    return {
                                      id: post.meal_plan?.id,
                                      title: post.meal_plan?.name || 'Shared Recipe',
                                      description: post.meal_plan?.description || '',
                                      image_url: '/api/placeholder/400/300',
                                      ingredients: [],
                                      instructions: [],
                                      time_minutes: 30,
                                      cuisine: '',
                                      diet: ''
                                    };
                                  }
                                  
                                  // Process ingredients to ensure correct format
                                  let processedIngredients = [];
                                  if (Array.isArray(firstMeal.ingredients)) {
                                    processedIngredients = firstMeal.ingredients.map((ing: any, index: number) => {
                                      // Debug each ingredient
                                      // console.log(`=== DEBUG: Ingredient ${index} ===`, ing);
                                      
                                      // Handle different ingredient formats
                                      if (typeof ing === 'string') {
                                        // Simple string format
                                        return {
                                          name: ing,
                                          display_text: ing,
                                          measurements: []
                                        };
                                      } else if (ing && typeof ing === 'object') {
                                        // Object format - try to extract proper fields
                                        return {
                                          name: ing.name || ing.ingredient || ing.item || '',
                                          display_text: ing.display_text || ing.text || ing.description || `${ing.quantity || ''} ${ing.unit || ''} ${ing.name || ing.ingredient || ''}`.trim(),
                                          measurements: ing.measurements || (ing.quantity ? [{
                                            quantity: parseFloat(ing.quantity) || 0,
                                            unit: ing.unit || ''
                                          }] : [])
                                        };
                                      }
                                      return null;
                                    }).filter(Boolean);
                                  }
                                  
                                  // console.log('=== DEBUG: Processed ingredients ===', processedIngredients);
                                  
                                  const recipeData = {
                                    id: post.meal_plan?.id,
                                    title: firstMeal.name || firstMeal.title || post.meal_plan?.name || 'Shared Recipe',
                                    description: firstMeal.description || post.meal_plan?.description || '',
                                    image_url: firstMeal.image_url || '/api/placeholder/400/300',
                                    ingredients: processedIngredients,
                                    instructions: Array.isArray(firstMeal.instructions) ? firstMeal.instructions : [],
                                    nutrition_info: firstMeal.nutrition || null,
                                    time_minutes: firstMeal.prep_time || firstMeal.time_minutes || firstMeal.cook_time_minutes || 30,
                                    cuisine: firstMeal.cuisine || '',
                                    diet: firstMeal.diet || '',
                                    video_id: firstMeal.video_id || null,
                                    video_title: firstMeal.video_title || null,
                                    video_channel: firstMeal.video_channel || null
                                  };
                                  
                                  // console.log('=== DEBUG: Final recipe data ===', recipeData);
                                  
                                  return recipeData;
                                  })()}
                                  onRegenerateClick={() => {}}
                                />
                              </div>
                            ) : (
                              <div className="text-center py-8">
                                <p className="text-gray-400">Meal details coming soon...</p>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    ) : null}
                  </div>

                  {/* Post Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                    <div className="flex items-center gap-4">
                      {/* Only show like button for other users' posts */}
                      {(user as any)?.user?.id !== post.author_id && (user as any)?.id !== post.author_id ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`p-1 transition-colors ${
                            post.is_liked 
                              ? "text-purple-400 hover:text-purple-300" 
                              : "text-gray-400 hover:text-white"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeMutation.mutate(post.id);
                          }}
                          disabled={toggleLikeMutation.isPending}
                        >
                          <ThumbsUp className={`w-4 h-4 mr-1 ${post.is_liked ? "fill-purple-400" : ""}`} />
                          {post.likes_count}
                        </Button>
                      ) : (
                        // Show likes count only for own posts (if > 0)
                        post.likes_count > 0 && (
                          <div className="text-gray-400 text-sm flex items-center p-1">
                            <ThumbsUp className="w-4 h-4 mr-1" />
                            {post.likes_count}
                          </div>
                        )
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-gray-400 hover:text-white p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToPost(post.id);
                        }}
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        {post.comments_count}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white p-1">
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>


                </CardContent>
              </Card>
            ))}
            </div>

            {/* Right Sidebar: Community Profile */}
            <aside className="hidden md:block w-[320px] absolute right-0 top-0">
              <div className="space-y-4">
                <Card className="bg-gray-800 border-gray-700 overflow-hidden">
                  {community.cover_image ? (
                    <img 
                      src={community.cover_image} 
                      alt={`${community.name} cover`} 
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="h-32 w-full bg-gradient-to-br from-purple-600 via-blue-600 to-emerald-600 flex items-center justify-center">
                      <span className="text-white/80 text-sm">No image</span>
                    </div>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="text-white font-semibold text-base">{community.name}</h3>
                      {community.category && (
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{community.category}</p>
                      )}
                    </div>
                    {community.description && (
                      <p className="text-sm text-gray-300 line-clamp-4">{community.description}</p>
                    )}
                    <div className="flex items-center justify-between text-sm text-gray-300">
                      <span className="flex items-center gap-2">
                        <Users className="w-4 h-4" /> {community.member_count} members
                      </span>
                      {community.is_public ? (
                        <Badge className="bg-emerald-600 text-white">Public</Badge>
                      ) : (
                        <Badge className="bg-gray-600 text-white">Private</Badge>
                      )}
                    </div>
                    {isCreator && (
                      <div className="pt-1">
                        <ChangeCommunityImageButton 
                          communityId={id || ''} 
                          hasImage={!!community.cover_image} 
                          onChanged={() => queryClient.invalidateQueries({ queryKey: ["/api/communities", id] })}
                        />
                      </div>
                    )}
                    {!isMember ? (
                      <Button 
                        className="w-full bg-white text-purple-600 hover:bg-gray-100"
                        onClick={() => joinCommunityMutation.mutate()}
                        disabled={joinCommunityMutation.isPending}
                      >
                        {joinCommunityMutation.isPending ? 'Joining...' : 'Join Community'}
                      </Button>
                    ) : (
                      isCreator ? (
                        <Button 
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => setShowCourseManagement(true)}
                        >
                          Manage Community
                        </Button>
                      ) : (
                        <Button className="w-full bg-gray-700 text-white" variant="secondary" disabled>
                          Member
                        </Button>
                      )
                    )}
                  </CardContent>
                </Card>
              </div>
            </aside>
            
          </div>
            </div>
        </TabsContent>

        {/* Meal Plans Tab - Classroom Style */}
        <TabsContent value="meals" className="p-4 space-y-4 mt-2 pt-2 bg-gray-900">
          {/* Header with User View Toggle */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">My Meal Plans</h2>
            {isCreator && (
              <Button
                onClick={() => setIsStudentViewMode(!isStudentViewMode)}
                variant={isStudentViewMode ? "secondary" : "outline"}
                className={isStudentViewMode ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : "border-gray-600 text-gray-300 hover:bg-gray-700"}
                size="sm"
              >
                <Eye className="w-4 h-4 mr-2" />
                {isStudentViewMode ? "Exit User View" : "User View"}
              </Button>
            )}
          </div>
          
          <MyRecipesCarousel />
          <MealPlansClassroom 
            communityId={id} 
            isCreator={isCreator}
            isStudentViewMode={isStudentViewMode}
            setIsStudentViewMode={setIsStudentViewMode}
          />
        </TabsContent>


        {/* AI Chat Tab */}
        <TabsContent value="members" className="p-0 m-0 bg-gray-900">
          <div className="h-[calc(100vh-7rem)] bg-gray-900">
            {isMember ? (
              // Community-scoped chat with creator preview toggle
              <Mem0Chat communityId={parseInt(id || "0", 10)} />
            ) : (
              <Card className="bg-gray-800 border-gray-700 text-center py-12">
                <CardContent>
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-300">Join this community to use AI Chat.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Extractor Tab */}
        <TabsContent value="extractor" className="p-4 space-y-4 mt-2 pt-2 bg-gray-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Recipe Extractor</h3>
              <Badge variant="secondary" className="bg-emerald-600 text-white">
                AI-Powered
              </Badge>
            </div>
            
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="recipe-url" className="text-gray-300 mb-2 block">Recipe URL</Label>
                    <Input
                      id="recipe-url"
                      placeholder="https://example.com/recipe"
                      value={extractorUrl}
                      onChange={(e) => setExtractorUrl(e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                      disabled={extractionInProgress}
                    />
                    <p className="text-sm text-gray-400 mt-1">
                      Paste a URL to any recipe webpage and our AI will extract all the details
                    </p>
                  </div>
                  
                  <Button 
                    onClick={() => extractRecipeMutation.mutate()}
                    disabled={!extractorUrl.trim() || extractionInProgress}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {extractionInProgress ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Extracting Recipe...
                      </>
                    ) : (
                      <>
                        <ChefHat className="w-4 h-4 mr-2" />
                        Extract Recipe
                      </>
                    )}
                  </Button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pdf-url" className="text-gray-300">Cookbook PDF URL (optional)</Label>
                      <Input
                        id="pdf-url"
                        placeholder="https://example.com/cookbook.pdf"
                        value={pdfUrl}
                        onChange={(e) => setPdfUrl(e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        disabled={pdfExtracting}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={() => extractPdfMutation.mutate()}
                        disabled={!pdfUrl.trim() || pdfExtracting}
                        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                      >
                        {pdfExtracting ? 'Extracting PDF...' : 'Extract from PDF'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pdf-upload" className="text-gray-300">Upload PDF from your files</Label>
                      <Input
                        id="pdf-upload"
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setPdfFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        disabled={pdfExtracting}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleUploadPdfExtract}
                        disabled={!pdfFile || pdfExtracting}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {pdfExtracting ? 'Extracting PDF...' : 'Extract Uploaded PDF'}
                      </Button>
                    </div>
                  </div>
                  
                  {extractionInProgress && (
                    <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3">
                      <div className="text-sm text-blue-400 space-y-1">
                        <p>🕷️ Scanning webpage content...</p>
                        <p>👁️ Analyzing images with Gemini Vision...</p>
                        <p>🧠 Extracting structured data with AI...</p>
                      </div>
                    </div>
                  )}
                  
                  {extractedRecipe && (
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h4 className="text-white font-medium">Extracted Recipe Preview</h4>
                          {allExtractedRecipes.length > 1 && (
                            <Badge variant="secondary" className="bg-blue-600 text-white">
                              {selectedExtractedRecipeIndex + 1} of {allExtractedRecipes.length}
                            </Badge>
                          )}
                        </div>
                        <Badge className="bg-green-600 text-white">
                          Ready to Share
                        </Badge>
                      </div>

                      {/* Recipe Carousel Navigation */}
                      {allExtractedRecipes.length > 1 && (
                        <div className="bg-gray-800 rounded-lg p-3">
                          {/* Mobile-first: Dots with optional arrow buttons */}
                          <div className="flex items-center justify-center gap-4">
                            {/* Previous Button - Hidden on small screens or when disabled */}
                            {selectedExtractedRecipeIndex > 0 && (
                              <Button
                                onClick={() => selectRecipe(selectedExtractedRecipeIndex - 1)}
                                variant="outline"
                                size="sm"
                                className="hidden sm:flex border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
                              >
                                <ChevronLeft className="w-4 h-4" />
                                <span className="hidden md:inline ml-1">Previous</span>
                              </Button>
                            )}
                            
                            {/* Dot Navigation - Always visible and centered */}
                            <div className="flex items-center gap-2 flex-1 justify-center">
                              {allExtractedRecipes.map((_, index) => (
                                <button
                                  key={index}
                                  onClick={() => selectRecipe(index)}
                                  className={`w-3 h-3 rounded-full transition-colors shrink-0 ${
                                    index === selectedExtractedRecipeIndex 
                                      ? 'bg-emerald-500' 
                                      : 'bg-gray-600 hover:bg-gray-500'
                                  }`}
                                />
                              ))}
                            </div>
                            
                            {/* Next Button - Hidden on small screens or when disabled */}
                            {selectedExtractedRecipeIndex < allExtractedRecipes.length - 1 && (
                              <Button
                                onClick={() => selectRecipe(selectedExtractedRecipeIndex + 1)}
                                variant="outline"
                                size="sm"
                                className="hidden sm:flex border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
                              >
                                <span className="hidden md:inline mr-1">Next</span>
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          
                          {/* Mobile Navigation Info */}
                          <div className="text-center mt-2 text-sm text-gray-400">
                            Recipe {selectedExtractedRecipeIndex + 1} of {allExtractedRecipes.length}
                          </div>
                        </div>
                      )}
                      
                      <div className="bg-gray-700 rounded-lg p-4">
                        <RecipeDisplay
                          key={`recipe-${selectedExtractedRecipeIndex}-${extractedRecipe?.id || 'default'}`}
                          recipe={extractedRecipe}
                          onRegenerateClick={() => {}}
                        />
                      </div>
                      
                      <div className="flex gap-3">
                        <Button 
                          onClick={() => shareExtractedRecipe()}
                          className="flex-1 bg-purple-600 hover:bg-purple-700"
                        >
                          <Share className="w-4 h-4 mr-2" />
                          Share to Community
                        </Button>
                        <Button 
                          onClick={clearExtractedRecipes}
                          variant="outline"
                          className="border-gray-600 text-gray-300 hover:bg-gray-700"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {!extractedRecipe && !extractionInProgress && (
                    <Card className="bg-gray-750 border-gray-600">
                      <CardContent className="p-4">
                        <div className="text-center space-y-2">
                          <div className="text-2xl">🤖</div>
                          <h4 className="text-white font-medium">How it works</h4>
                          <div className="text-sm text-gray-400 space-y-1">
                            <p>1. Paste any recipe URL above</p>
                            <p>2. Our AI scans the page and extracts recipe data</p>
                            <p>3. Preview and share the structured recipe</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Recipe Modal for Creators */}
      <CreateRecipe
        isOpen={showMealPlanEditorMain && isCreator}
        onClose={() => {
          setShowMealPlanEditorMain(false);
          // Refresh the recipes list for carousel
          queryClient.invalidateQueries({ queryKey: [`/api/recipes/saved`] });
        }}
        saveAsMealPlan={false}
      />

      {/* Delete Post Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Post</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePost}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deletePostMutation.isPending}
            >
              {deletePostMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Post
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Course Management Modal */}
      <CourseManagement
        isOpen={showCourseManagement}
        onClose={() => setShowCourseManagement(false)}
        communityId={id || ''}
      />

      {/* Floating Action Button - Creator Only (Hide on AI Chat) */}
      {isCreator && activeTab !== "members" && (
        <div className="fixed bottom-6 right-6 z-[99999]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:scale-105"
                size="icon"
              >
                <Plus className="w-6 h-6 transition-transform duration-200" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mb-2 z-[99999]">
              {/* Show meal plan page specific options when on meals tab */}
              {activeTab === "meals" ? (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setShowMealPlanEditorMain(true);
                    }}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-emerald-50"
                  >
                    <ChefHat className="w-5 h-5 text-emerald-600" />
                    <div>
                      <div className="font-medium">Add Meal</div>
                      <div className="text-sm text-gray-500">Create a new meal</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setShowCourseManagement(true);
                    }}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-50"
                  >
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-medium">Edit Course</div>
                      <div className="text-sm text-gray-500">Manage your courses</div>
                    </div>
                  </DropdownMenuItem>
                </>
              ) : (
                /* Default options for other tabs */
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setShowMealPlanEditorMain(true);
                    }}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-emerald-50"
                  >
                    <ChefHat className="w-5 h-5 text-emerald-600" />
                    <div>
                      <div className="font-medium">Add Meal</div>
                      <div className="text-sm text-gray-500">Create a new meal</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setShowCourseManagement(true);
                    }}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-50"
                  >
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-medium">Edit Course</div>
                      <div className="text-sm text-gray-500">Manage your courses</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      // Future: Add content creation functionality
                      toast({
                        title: "Coming Soon", 
                        description: "Content creation will be available soon!"
                      });
                    }}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-purple-50"
                  >
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                    <div>
                      <div className="font-medium">Add Content</div>
                      <div className="text-sm text-gray-500">Create new content</div>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Post Image Lightbox */}
      <ImageLightbox
        src={postLightboxSrc || ''}
        alt={postLightboxSrc || undefined}
        open={postLightboxOpen}
        onClose={() => setPostLightboxOpen(false)}
      />

      {/* Advanced Post Composer Overlay */}
      <AdvancedCommentOverlay
        isOpen={postOverlayOpen}
        title="Create Post"
        initialTitle=""
        initialContent={newPostContent}
        initialImages={selectedImages}
        onSubmit={({ title, content, images }) => {
          const combined = title && title.trim().length > 0 ? `${title.trim()}\n${content}` : content;
          setNewPostContent(combined);
          setSelectedImages(images);
          setPostOverlayOpen(false);
          createPostMutation.mutate({ content: combined, images });
        }}
        onClose={() => setPostOverlayOpen(false)}
      />
    </div>
  );
}

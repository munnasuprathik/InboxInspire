import { useState, useEffect, useCallback, useMemo } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SignedIn, SignedOut, SignIn, SignUp, useUser, useClerk, UserProfile } from "@clerk/clerk-react";
import { CheckCircle, Mail, Sparkles, Clock, User, LogOut, Send, Edit, Shield, BarChart3, Users, History, TrendingUp, Globe, RefreshCw, Flame, Star, Loader2, AlertTriangle, Download, Eye, Filter, Database, Search, Calendar, Play, Megaphone, Trophy, Award, Target, Zap, BookOpen, Book, X, Satellite, Goal, Calendar as CalendarIcon, MessageSquare, Wifi, Activity, Settings, CircleDot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MessageHistory } from "@/components/MessageHistory";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { GoalsManager } from "@/components/GoalsManager";
import { StreakCalendar } from "@/components/StreakCalendar";
import { StreakMilestones } from "@/components/StreakMilestones";
import { WeeklyMonthlyReports } from "@/components/WeeklyMonthlyReports";
import { RealTimeAnalytics } from "@/components/RealTimeAnalytics";
import { AdminUserDetails } from "@/components/AdminUserDetails";
import { AchievementCelebration } from "@/components/AchievementCelebration";
import ErrorBoundary from "@/components/ErrorBoundary";
import { NetworkStatus } from "@/components/NetworkStatus";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { exportMessageHistory, exportAchievements, exportAnalytics } from "@/utils/exportData";
import { TIMEZONES } from "@/utils/timezones";
import {
  formatScheduleTime,
  formatDateTimeForTimezone,
  getDisplayTimezone,
} from "@/utils/timezoneFormatting";
import { safeSelectValue, safePersonalityValue } from "@/utils/safeRender";
import { sanitizeUser, sanitizeMessages, sanitizeFilter } from "@/utils/dataSanitizer";

// IST timezone constant for admin dashboard
const ADMIN_TIMEZONE = "Asia/Kolkata";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FAMOUS_PERSONALITIES = [
  "Elon Musk", "Steve Jobs", "A.P.J. Abdul Kalam", "Oprah Winfrey",
  "Nelson Mandela", "Maya Angelou", "Tony Robbins", "Brené Brown",
  "Simon Sinek", "Michelle Obama", "Warren Buffett", "Richard Branson"
];

const TONE_OPTIONS = [
  "Funny & Uplifting", "Friendly & Warm", "Roasting (Tough Love)",
  "Serious & Direct", "Philosophical & Deep", "Energetic & Enthusiastic",
  "Calm & Meditative", "Poetic & Artistic"
];

function AuthScreen() {
  const pathname = window.location.pathname;
  const isSignUp = pathname.startsWith("/sign-up");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Mail className="h-8 w-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">
              {isSignUp ? "Join InboxInspire" : "InboxInspire"}
            </CardTitle>
            <CardDescription>
              {isSignUp
                ? "Create your account to get daily personalized motivation"
                : "Sign in to get personalized motivation in your inbox"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {isSignUp ? (
            <SignUp
              routing="path"
              path="/sign-up"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-none bg-transparent",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlockButton: "border border-slate-200",
                  formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white",
                },
                variables: {
                  colorPrimary: "#4f46e5",
                },
              }}
              afterSignUpUrl="/"
            />
          ) : (
            <SignIn
              routing="path"
              path="/sign-in"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-none bg-transparent",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlockButton: "border border-slate-200",
                  formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white",
                },
                variables: {
                  colorPrimary: "#4f46e5",
                },
              }}
              afterSignInUrl="/"
              afterSignUpUrl="/"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OnboardingScreen({ email, onComplete }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    goals: "",
    personalities: [],
    currentPersonality: {
      type: "famous",
      value: "",
      customValue: ""
    },
    rotationMode: "sequential",
    frequency: "daily",
    time: "09:00",
    timezone: (() => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof tz === 'string' ? tz : "UTC";
      } catch {
        return "UTC";
      }
    })()
  });
  const [loading, setLoading] = useState(false);

  const handleSubmitName = (e) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error("Please enter your name");
      return;
    }
    setStep(2);
  };

  const handleSubmitGoals = (e) => {
    e.preventDefault();
    if (!formData.goals) {
      toast.error("Please tell us about your goals");
      return;
    }
    setStep(3);
  };

  const handleSubmitPersonality = (e) => {
    e.preventDefault();
    
    // Add current personality if not already added
    const { type, value, customValue } = formData.currentPersonality;
    if (value || customValue) {
      const newPersonality = {
        type,
        value: type === "custom" ? customValue : value,
        active: true
      };
      
      if (formData.personalities.length === 0 || 
          !formData.personalities.some(p => p.value === newPersonality.value)) {
        setFormData({
          ...formData,
          personalities: [...formData.personalities, newPersonality]
        });
      }
    }
    
    if (formData.personalities.length === 0 && !value && !customValue) {
      toast.error("Please add at least one personality");
      return;
    }
    
    setStep(4);
  };

  const handleAddPersonality = () => {
    const { type, value, customValue } = formData.currentPersonality;
    if (!value && !customValue) {
      toast.error("Please select or enter a personality");
      return;
    }

    const newPersonality = {
      type,
      value: type === "custom" ? customValue : value,
      active: true
    };

    setFormData({
      ...formData,
      personalities: [...formData.personalities, newPersonality],
      currentPersonality: { type: "famous", value: "", customValue: "" }
    });
    toast.success("✨ Personality Added!", {
      description: "Great choice! This personality will inspire your daily motivation!",
      duration: 3000,
    });
    
    setTimeout(() => {
      toast.success("🎯 Keep Going!", {
        description: "Add more personalities or continue to complete your setup!",
        duration: 2500,
      });
    }, 500);
  };

  const handleFinalSubmit = async () => {
    if (formData.personalities.length === 0) {
      toast.error("Please add at least one personality");
      return;
    }

    setLoading(true);
    try {
      const schedule = {
        frequency: formData.frequency,
        times: [formData.time],
        timezone: formData.timezone,
        paused: false,
        skip_next: false
      };

      const response = await axios.post(`${API}/onboarding`, {
        email,
        name: formData.name,
        goals: formData.goals,
        personalities: formData.personalities,
        rotation_mode: "sequential",
        schedule
      });

      toast.success("🎉 Welcome to InboxInspire!", {
        description: "You're all set! Get ready for daily motivation!",
        duration: 4000,
      });
      
      // Multiple celebratory toasts
      setTimeout(() => {
        toast.success("🚀 Let's Begin!", {
          description: "Your journey to success starts now!",
          duration: 3000,
        });
      }, 600);
      
      setTimeout(() => {
        toast.success("💪 You've Got This!", {
          description: "We're here to support you every step of the way!",
          duration: 3000,
        });
      }, 1200);
      
      setTimeout(() => {
        toast.success("📧 Check Your Inbox!", {
          description: "Your first motivational email is coming soon!",
          duration: 3000,
        });
      }, 1800);
      onComplete(response.data.user);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to complete setup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8 mt-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-2">Welcome!</h1>
          <p className="text-muted-foreground">Let's personalize your inspiration journey</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                step >= s ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>{s}</div>
              {s < 4 && <div className={`h-1 w-8 mx-1 transition-all ${step > s ? 'bg-indigo-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>What's your name?</CardTitle>
              <CardDescription>We'll use this to personalize your messages</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitName} className="space-y-4">
                <Input
                  placeholder="Your name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  data-testid="name-input"
                  required
                />
                <Button type="submit" className="w-full" data-testid="name-next-btn">Continue</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>Tell us about your goals</CardTitle>
              <CardDescription>What are you working towards?</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitGoals} className="space-y-4">
                <Textarea
                  placeholder="I'm working on building my startup, learning to code, getting fit..."
                  value={formData.goals}
                  onChange={(e) => setFormData({...formData, goals: e.target.value})}
                  className="min-h-32"
                  data-testid="goals-input"
                  required
                />
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                  <Button type="submit" className="flex-1" data-testid="goals-next-btn">Continue</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>Choose Your Inspiration Style</CardTitle>
              <CardDescription>Add one or more personalities to rotate through</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Added Personalities */}
                {formData.personalities.length > 0 && (
                  <div className="space-y-2">
                    <Label>Your Personalities ({formData.personalities.length})</Label>
                    {formData.personalities.map((p, i) => {
                      const displayValue = safePersonalityValue(p);
                      return (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg gap-2">
                        <span className="font-medium truncate flex-1 min-w-0">{displayValue}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormData({
                            ...formData,
                            personalities: formData.personalities.filter((_, idx) => idx !== i)
                          })}
                          className="flex-shrink-0"
                        >
                          Remove
                        </Button>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Add New Personality */}
                <div className="space-y-4 p-4 border-2 border-dashed rounded-lg">
                  <Label>Add Personality</Label>
                  <RadioGroup 
                    value={formData.currentPersonality.type} 
                    onValueChange={(value) => setFormData({
                      ...formData, 
                      currentPersonality: { type: value, value: "", customValue: "" }
                    })}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="famous" id="famous" />
                      <Label htmlFor="famous" className="font-normal cursor-pointer">Famous</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="tone" id="tone" />
                      <Label htmlFor="tone" className="font-normal cursor-pointer">Tone</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="custom" id="custom" />
                      <Label htmlFor="custom" className="font-normal cursor-pointer">Custom</Label>
                    </div>
                  </RadioGroup>

                  {formData.currentPersonality.type === "famous" && (
                    <Select 
                      value={safeSelectValue(formData.currentPersonality.value, '')} 
                      onValueChange={(value) => setFormData({
                        ...formData, 
                        currentPersonality: {...formData.currentPersonality, value}
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {FAMOUS_PERSONALITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}

                  {formData.currentPersonality.type === "tone" && (
                    <Select 
                      value={safeSelectValue(formData.currentPersonality.value, '')} 
                      onValueChange={(value) => setFormData({
                        ...formData,
                        currentPersonality: {...formData.currentPersonality, value}
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}

                  {formData.currentPersonality.type === "custom" && (
                    <Textarea
                      placeholder="Describe style..."
                      value={formData.currentPersonality.customValue}
                      onChange={(e) => setFormData({
                        ...formData,
                        currentPersonality: {...formData.currentPersonality, customValue: e.target.value}
                      })}
                      rows={3}
                    />
                  )}

                  <Button type="button" variant="outline" onClick={handleAddPersonality} className="w-full">
                    Add This Personality
                  </Button>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
                  <Button onClick={handleSubmitPersonality} className="flex-1">Continue</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>Schedule Your Inspiration</CardTitle>
              <CardDescription>When should we send your messages?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Frequency</Label>
                <Select value={safeSelectValue(formData.frequency, 'daily')} onValueChange={(value) => setFormData({...formData, frequency: value})}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Preferred Time</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({...formData, time: e.target.value})}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Your Timezone
                </Label>
                <Select 
                  value={safeSelectValue(formData.timezone, (() => {
                    try {
                      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                      return typeof tz === 'string' ? tz : "UTC";
                    } catch {
                      return "UTC";
                    }
                  })())} 
                  onValueChange={(value) => setFormData({...formData, timezone: value})}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1">Back</Button>
                <Button onClick={handleFinalSubmit} disabled={loading} className="flex-1" data-testid="onboarding-finish-btn">
                  {loading ? "Setting Up..." : "Complete Setup"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DashboardScreen({ user, onLogout, onUserUpdate }) {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [editMode, setEditMode] = useState(false);
  const [editAccountMode, setEditAccountMode] = useState(false);
  const [formData, setFormData] = useState({
    name: typeof user.name === 'string' ? user.name : '',
    goals: typeof user.goals === 'string' ? user.goals : '', // Kept for backward compatibility, not editable in UI
    frequency: typeof user.schedule?.frequency === 'string' ? user.schedule.frequency : 'daily',
    time: user.schedule?.times?.[0] || (typeof user.schedule?.time === 'string' ? user.schedule.time : "09:00"),
    active: typeof user.active === 'boolean' ? user.active : false
  });
  const [previewMessage, setPreviewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [achievements, setAchievements] = useState({ unlocked: [], locked: [], total_unlocked: 0, total_available: 0 });
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [messageHistory, setMessageHistory] = useState([]);
  const [newAchievements, setNewAchievements] = useState([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [goals, setGoals] = useState([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsRefreshKey, setGoalsRefreshKey] = useState(0);

  const userTimezone = user.schedule?.timezone;
  const userScheduleTimeLabel = formatScheduleTime(
    user.schedule?.times?.[0] || user.schedule?.time || "",
    userTimezone,
  );
  const userTimezoneDisplay = getDisplayTimezone(userTimezone);
  const schedulePaused = user.schedule?.paused;
  const statusLabel = schedulePaused ? "Paused" : user.active ? "Active" : "Inactive";
  const statusColor = schedulePaused ? "bg-yellow-400" : user.active ? "bg-green-500" : "bg-gray-400";

  const handleUserStateUpdate = useCallback((updatedUser) => {
    // Sanitize user data before updating state
    const sanitizedUser = sanitizeUser(updatedUser);
    if (sanitizedUser) {
      onUserUpdate(sanitizedUser);
      setRefreshKey((prev) => prev + 1);
    } else {
      console.error('Failed to sanitize user data');
      toast.error('Invalid user data received');
    }
  }, [onUserUpdate]);

  const refreshUserData = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/users/${user.email}`);
      // Sanitize response data before updating
      const sanitizedUser = sanitizeUser(response.data);
      if (sanitizedUser) {
        handleUserStateUpdate(sanitizedUser);
      }
    } catch (error) {
      console.error("Failed to refresh user data:", error);
    }
  }, [user.email, handleUserStateUpdate]);

  // Fetch message history for calendar
  const fetchMessageHistory = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/users/${user.email}/message-history?limit=500`);
      const sorted = [...(response.data.messages || [])].sort(
        (a, b) => new Date(b.sent_at || b.created_at) - new Date(a.sent_at || a.created_at),
      );
      setMessageHistory(sorted);
    } catch (error) {
      console.error("Failed to load message history for calendar:", error);
      setMessageHistory([]);
    }
  }, [user.email]);

  // Fetch message history on mount and when refreshKey changes
  useEffect(() => {
    fetchMessageHistory();
  }, [fetchMessageHistory, refreshKey]);

  // Fetch goals for overview
  const fetchGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const response = await axios.get(`${API}/users/${user.email}/goals`);
      setGoals(response.data.goals || []);
    } catch (error) {
      console.error("Failed to fetch goals:", error);
      setGoals([]);
    } finally {
      setGoalsLoading(false);
    }
  }, [user.email]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals, refreshKey, goalsRefreshKey]);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const updates = {
        name: formData.name,
        active: formData.active
      };

      const response = await axios.put(`${API}/users/${user.email}`, updates);
      // Sanitize response data before updating
      const sanitizedUser = sanitizeUser(response.data);
      if (sanitizedUser) {
        handleUserStateUpdate(sanitizedUser);
      }
      setEditMode(false);
      toast.success("✅ Settings Updated!", {
        description: "Your preferences have been saved successfully!",
        duration: 3000,
      });
      
      // Additional celebratory toast
      setTimeout(() => {
        toast.success("🎯 All Set!", {
          description: "Your motivational emails will reflect these changes!",
          duration: 2500,
        });
      }, 500);
    } catch (error) {
      toast.error("Failed to update settings");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePreview = async () => {
    setLoading(true);
    try {
      // Get current personality from user
      const personalities = user.personalities || [];
      if (personalities.length === 0) {
        toast.error("No personalities configured");
        setLoading(false);
        return;
      }
      
      const currentIndex = user.current_personality_index || 0;
      const currentPersonality = personalities[currentIndex];
      
      const response = await axios.post(`${API}/generate-message`, {
        goals: formData.goals,
        personality: {
          type: currentPersonality.type,
          value: currentPersonality.value
        },
        user_name: formData.name
      });
      setPreviewMessage(response.data.message);
      if (response.data.used_fallback) {
        toast.warning("Preview generated using a backup message while the AI is busy.");
      } else {
        toast.success("✨ Preview Generated!", {
          description: "Here's a sneak peek of your personalized motivation!",
          duration: 3000,
        });
        
        setTimeout(() => {
          toast.success("📝 Ready to Send!", {
            description: "This is how your email will look. Want to send it now?",
            duration: 3000,
          });
        }, 500);
      }
    } catch (error) {
      toast.error("Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  const handleSendNow = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/send-now/${user.email}`);
      toast.success("📧 Email Sent!", {
        description: "Check your inbox for your personalized motivation!",
        duration: 3000,
      });
      
      // Additional celebratory toasts
      setTimeout(() => {
        toast.success("💪 You've Got This!", {
          description: "Your motivation is on its way. Keep pushing forward!",
          duration: 3000,
        });
      }, 600);
      
      setTimeout(() => {
        toast.success("🔥 Stay Strong!", {
          description: "Every step counts. You're doing amazing!",
          duration: 2500,
        });
      }, 1200);
      await refreshUserData();
    } catch (error) {
      toast.error("Failed to send email");
    } finally {
      setLoading(false);
    }
  };

  const fetchAchievements = useCallback(async () => {
    setAchievementsLoading(true);
    try {
      const response = await axios.get(`${API}/users/${user.email}/achievements`);
      setAchievements(response.data);
    } catch (error) {
      console.error("Failed to fetch achievements:", error);
      toast.error("Failed to load achievements");
    } finally {
      setAchievementsLoading(false);
    }
  }, [user.email]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements, refreshKey]);

  // Auto-refresh user data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshUserData();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [refreshUserData]);

  // Auto-refresh goals to update next email countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setGoalsRefreshKey(prev => prev + 1);
    }, 30000); // Refresh every 30 seconds to update countdown

    return () => clearInterval(interval);
  }, []);

  // Handle new achievements from analytics
  const handleNewAchievements = useCallback((achievementIds, analyticsData) => {
    if (!achievementIds || achievementIds.length === 0) return;
    
    // Use detailed achievements from analytics if available
    let newAchievementDetails = analyticsData.new_achievements_details || [];
    
    // If no details, try to get from achievements list
    if (newAchievementDetails.length === 0 && analyticsData.achievements) {
      newAchievementDetails = analyticsData.achievements.filter(ach => 
        achievementIds.includes(ach.id) && ach.unlocked
      );
    }
    
    // If still no details, fetch from API
    if (newAchievementDetails.length === 0) {
      axios.get(`${API}/users/${user.email}/achievements`)
        .then(response => {
          const allAchievements = [...(response.data.unlocked || []), ...(response.data.locked || [])];
          const details = allAchievements.filter(ach => 
            achievementIds.includes(ach.id) && ach.unlocked
          );
          if (details.length > 0) {
            setNewAchievements(details);
            setShowCelebration(true);
            fetchAchievements();
          }
        })
        .catch(error => {
          console.error("Failed to fetch achievement details:", error);
          // Fallback: use IDs only
          if (achievementIds.length > 0) {
            setNewAchievements(achievementIds.map(id => ({ 
              id, 
              name: "Achievement Unlocked!", 
              description: "Congratulations!",
              icon_name: "Trophy"
            })));
            setShowCelebration(true);
          }
        });
    } else {
      // We have details, use them directly
      setNewAchievements(newAchievementDetails);
      setShowCelebration(true);
      fetchAchievements();
    }
  }, [user.email, fetchAchievements]);

  const handleViewAchievements = useCallback(() => {
    setShowCelebration(false);
    // Switch to achievements tab
    setTimeout(() => {
      const achievementsTab = document.querySelector('[data-testid="achievements-tab"]');
      if (achievementsTab) {
        achievementsTab.click();
      }
    }, 100);
  }, []);

  const getAchievementIcon = (iconName) => {
    const iconMap = {
      "Sprout": CheckCircle,
      "Flame": Flame,
      "Zap": Zap,
      "Trophy": Trophy,
      "Mail": Mail,
      "BookOpen": BookOpen,
      "Book": Book,
      "Star": Star,
      "Target": Target,
      "Award": Award,
    };
    const IconComponent = iconMap[iconName] || Trophy;
    return <IconComponent className="h-6 w-6" />;
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8">
      {/* Achievement Celebration Modal */}
      <AchievementCelebration
        achievements={newAchievements}
        open={showCelebration}
        onClose={() => setShowCelebration(false)}
        onViewAchievements={handleViewAchievements}
      />
      
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold flex flex-wrap items-center gap-1 sm:gap-2">
                <span className="break-words">Welcome back, {user.name}!</span>
                <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-500 flex-shrink-0" />
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm sm:text-base">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={onLogout} data-testid="logout-btn" className="w-full sm:w-auto">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
            <TabsList className="inline-flex w-full sm:grid sm:grid-cols-5 min-w-max sm:min-w-0 [&>*]:bg-transparent [&>*[data-state=active]]:bg-white [&>*[data-state=active]]:shadow-sm [&>*]:min-h-[44px] sm:[&>*]:min-h-0 [&>*]:touch-manipulation">
              <TabsTrigger value="overview" className="flex-shrink-0">
                <BarChart3 className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" data-testid="analytics-tab" className="flex-shrink-0">
                <TrendingUp className="h-4 w-4 mr-1 sm:mr-2" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="achievements" data-testid="achievements-tab" className="flex-shrink-0">
                <Trophy className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Achievements</span>
                <span className="sm:hidden">Awards</span>
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="history-tab" className="flex-shrink-0">
                <History className="h-4 w-4 mr-1 sm:mr-2" />
                History
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-shrink-0">
                <Settings className="h-4 w-4 mr-1 sm:mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4 sm:space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Email Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${statusColor}`} />
                    <span className="text-2xl font-bold">{statusLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {user.active ? "Receiving emails" : "Emails disabled"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Next Email
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {goalsLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (() => {
                    // Combine all goals and find the next upcoming email
                    const allGoals = [...(goals || [])];
                    if (user.goals && typeof user.goals === 'string' && user.goals.trim()) {
                      allGoals.unshift({
                        id: 'main_goal',
                        title: user.goals.split('\n')[0].substring(0, 50) || 'My Main Goal',
                        active: !user.schedule?.paused,
                        next_sends: user.schedule && !user.schedule.paused ? [(() => {
                          // Calculate next send time for main goal
                          const schedule = user.schedule;
                          const timezone = schedule.timezone || 'UTC';
                          const time = schedule.times?.[0] || schedule.time || '09:00';
                          const [hours, minutes] = time.split(':').map(Number);
                          
                          const now = new Date();
                          const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
                          const today = new Date(tzNow);
                          today.setHours(hours, minutes, 0, 0);
                          
                          if (today <= tzNow) {
                            today.setDate(today.getDate() + 1);
                          }
                          
                          return today.toISOString();
                        })()] : [],
                        schedules: user.schedule ? [{
                          timezone: user.schedule.timezone || 'UTC',
                          active: !user.schedule.paused
                        }] : []
                      });
                    }
                    
                    // Find the earliest next send across all active goals
                    let nextEmail = null;
                    let nextGoal = null;
                    
                    for (const goal of allGoals) {
                      if (!goal.active) continue;
                      
                      if (goal.next_sends && goal.next_sends.length > 0) {
                        for (const sendTime of goal.next_sends) {
                          const sendDate = new Date(sendTime);
                          if (!nextEmail || sendDate < nextEmail) {
                            nextEmail = sendDate;
                            nextGoal = goal;
                          }
                        }
                      }
                    }
                    
                    if (nextEmail && nextGoal) {
                      const now = new Date();
                      const hoursUntil = Math.max(0, Math.round((nextEmail - now) / (1000 * 60 * 60) * 10) / 10);
                      const minutesUntil = Math.max(0, Math.round((nextEmail - now) / (1000 * 60)));
                      
                      // Format display
                      let timeDisplay;
                      if (hoursUntil >= 24) {
                        const days = Math.floor(hoursUntil / 24);
                        const hours = Math.floor(hoursUntil % 24);
                        timeDisplay = days === 1 ? `${days} day` : `${days} days`;
                        if (hours > 0) {
                          timeDisplay += ` ${hours}h`;
                        }
                      } else if (hoursUntil >= 1) {
                        timeDisplay = hoursUntil === 1 ? '1 hour' : `${Math.floor(hoursUntil)}h`;
                        const mins = minutesUntil % 60;
                        if (mins > 0 && hoursUntil < 2) {
                          timeDisplay += ` ${mins}m`;
                        }
                      } else {
                        timeDisplay = minutesUntil === 1 ? '1 minute' : `${minutesUntil}m`;
                      }
                      
                      return (
                        <div>
                          <p className="text-2xl font-bold">{timeDisplay}</p>
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {nextGoal.title}
                          </p>
                        </div>
                      );
                    }
                    
                    // No upcoming emails
                    const activeGoals = allGoals.filter(g => g.active).length;
                    return (
                      <div>
                        <p className="text-sm text-muted-foreground">No upcoming emails</p>
                        {activeGoals > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {activeGoals} active {activeGoals === 1 ? 'goal' : 'goals'}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Highest Achievement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {achievementsLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : achievements.unlocked && achievements.unlocked.length > 0 ? (
                    (() => {
                      // Get the highest achievement (top 1)
                      const highestAchievement = achievements.unlocked
                        .sort((a, b) => {
                          // Sort by priority (higher first), then by unlocked_at (most recent first)
                          const priorityDiff = (b.priority || 0) - (a.priority || 0);
                          if (priorityDiff !== 0) return priorityDiff;
                          const aDate = a.unlocked_at ? new Date(a.unlocked_at).getTime() : 0;
                          const bDate = b.unlocked_at ? new Date(b.unlocked_at).getTime() : 0;
                          return bDate - aDate;
                        })[0];
                      
                      return (
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                            {getAchievementIcon(highestAchievement.icon_name || "Trophy")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{highestAchievement.name}</p>
                            {highestAchievement.category && (
                              <p className="text-xs text-muted-foreground capitalize mt-0.5">{highestAchievement.category}</p>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <p className="text-sm text-muted-foreground">No achievements yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Goals Manager */}
            <GoalsManager user={user} onUpdate={handleUserStateUpdate} />

            {/* Preview & Send */}
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                  <span className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                    <span className="text-base sm:text-lg">Preview Your Next Message</span>
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button size="sm" variant="outline" onClick={handleGeneratePreview} disabled={loading} className="w-full sm:w-auto">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Preview
                    </Button>
                    <Button size="sm" onClick={handleSendNow} disabled={loading} data-testid="send-now-btn" className="w-full sm:w-auto">
                      <Send className="h-4 w-4 mr-2" />
                      Send Now
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {previewMessage ? (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{previewMessage}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Click "Generate Preview" to see a sample message</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {/* Your Motivation Streak - First */}
            <AnalyticsDashboard 
              email={user.email} 
              refreshKey={refreshKey}
              onNewAchievements={handleNewAchievements}
            />
            
            {/* Streak Milestones - Second */}
            <StreakMilestones 
              streakCount={user.streak_count || 0}
              lastEmailSent={user.last_email_sent}
            />
            
            {/* Streak Calendar */}
            <StreakCalendar 
              streakCount={user.streak_count || 0}
              totalMessages={user.total_messages_received || 0}
              lastEmailSent={user.last_email_sent}
              messageHistory={messageHistory}
              timezone={userTimezone}
            />
            
            {/* Weekly/Monthly Reports */}
            <WeeklyMonthlyReports email={user.email} user={user} refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="achievements" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <Trophy className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                      Your Achievements
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-1">
                      {achievements.total_unlocked} of {achievements.total_available} unlocked
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => exportAchievements(achievements)}
                      disabled={achievementsLoading}
                      className="flex-1 sm:flex-initial"
                    >
                      <Download className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchAchievements}
                      disabled={achievementsLoading}
                      className="flex-1 sm:flex-initial"
                    >
                      <RefreshCw className={`h-4 w-4 sm:mr-2 ${achievementsLoading ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {achievementsLoading ? (
                  <div className="flex items-center justify-center py-8 sm:py-12">
                    <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-indigo-600" />
                  </div>
                ) : (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Progress Info */}
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0 text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium text-base sm:text-sm">
                        {achievements.total_available > 0 
                          ? Math.round((achievements.total_unlocked / achievements.total_available) * 100) 
                          : 0}% ({achievements.total_unlocked} of {achievements.total_available})
                      </span>
                    </div>

                    {/* Unlocked Achievements */}
                    {achievements.unlocked.length > 0 && (
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                          Unlocked ({achievements.unlocked.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {achievements.unlocked.map((achievement) => (
                            <Card 
                              key={achievement.id} 
                              className="border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50"
                            >
                              <CardContent className="p-3 sm:p-4">
                                <div className="flex items-start gap-2 sm:gap-3">
                                  <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg text-green-600 flex-shrink-0">
                                    {getAchievementIcon(achievement.icon_name)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                      <h4 className="font-semibold text-sm sm:text-base truncate">{achievement.name}</h4>
                                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-xs w-fit">
                                        Unlocked
                                      </Badge>
                                    </div>
                                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{achievement.description}</p>
                                    {achievement.category && (
                                      <Badge variant="secondary" className="mt-2 text-xs">
                                        {achievement.category}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Locked Achievements */}
                    {achievements.locked.length > 0 && (
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                          <Award className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0" />
                          Locked ({achievements.locked.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {achievements.locked.map((achievement) => (
                            <Card 
                              key={achievement.id} 
                              className="border-2 border-gray-200 bg-gray-50 opacity-75"
                            >
                              <CardContent className="p-3 sm:p-4">
                                <div className="flex items-start gap-2 sm:gap-3">
                                  <div className="p-1.5 sm:p-2 bg-gray-200 rounded-lg text-gray-400 flex-shrink-0">
                                    {getAchievementIcon(achievement.icon_name)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                      <h4 className="font-semibold text-sm sm:text-base text-gray-600 truncate">{achievement.name}</h4>
                                      <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-300 text-xs w-fit">
                                        Locked
                                      </Badge>
                                    </div>
                                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{achievement.description}</p>
                                    {achievement.category && (
                                      <Badge variant="secondary" className="mt-2 text-xs bg-gray-200">
                                        {achievement.category}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {achievements.unlocked.length === 0 && achievements.locked.length === 0 && (
                      <div className="text-center py-12">
                        <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                        <p className="text-muted-foreground">No achievements available yet</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <MessageHistory
              email={user.email}
              timezone={userTimezone}
              refreshKey={refreshKey}
              onFeedbackSubmitted={refreshUserData}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-lg sm:text-xl">Basic Information</CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-1">Update your name and email preferences</CardDescription>
                  </div>
                  {!editMode && (
                    <Button onClick={() => setEditMode(true)} data-testid="edit-settings-btn" className="w-full sm:w-auto">
                      <Edit className="h-4 w-4 sm:mr-2" />
                      <span className="sm:inline">Edit</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
                <div>
                  <Label className="text-sm sm:text-base">Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    disabled={!editMode}
                    className="mt-2"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 pt-4 border-t">
                  <div className="flex-1">
                    <Label className="text-sm sm:text-base">Email Notifications</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Receive motivational emails</p>
                  </div>
                  <Switch
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                    disabled={!editMode}
                    className="flex-shrink-0"
                  />
                </div>

                {editMode && (
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button variant="outline" onClick={() => setEditMode(false)} className="flex-1 sm:flex-initial">
                      Cancel
                    </Button>
                    <Button onClick={handleUpdate} disabled={loading} className="flex-1 sm:flex-initial" data-testid="save-settings-btn">
                      {loading ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-lg sm:text-xl">Account Management</CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-1">Manage your account settings, email, password, and security</CardDescription>
                  </div>
                  {!editAccountMode && (
                    <Button onClick={() => setEditAccountMode(true)} variant="outline" size="sm" className="w-full sm:w-auto">
                      <Edit className="h-4 w-4 sm:mr-2" />
                      <span className="sm:inline">Edit</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
                {!editAccountMode ? (
                  <>
                    {!clerkLoaded ? (
                      <div className="flex items-center justify-center py-6 sm:py-8">
                        <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 sm:gap-4">
                        {clerkUser?.imageUrl ? (
                          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
                            <img 
                              src={clerkUser.imageUrl} 
                              alt={clerkUser.firstName || "User"} 
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-muted flex items-center justify-center border-2 border-border flex-shrink-0">
                            <User className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base sm:text-lg truncate">
                            {clerkUser?.firstName && clerkUser?.lastName 
                              ? `${clerkUser.firstName} ${clerkUser.lastName}`
                              : clerkUser?.firstName || clerkUser?.username || user.name || "User"}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                            {clerkUser?.primaryEmailAddress?.emailAddress || user.email}
                          </p>
                          {clerkUser?.externalAccounts && clerkUser.externalAccounts.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {clerkUser.externalAccounts.map((account, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {account.provider === "google" && "Google"}
                                  {account.provider === "github" && "GitHub"}
                                  {account.provider === "facebook" && "Facebook"}
                                  {!["google", "github", "facebook"].includes(account.provider) && account.provider}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border p-2 sm:p-6 min-h-[400px] sm:min-h-[500px] w-full overflow-hidden">
                      <SignedIn>
                        <div className="w-full h-full">
                          <UserProfile 
                            appearance={{
                              elements: {
                                rootBox: "w-full h-full",
                                card: "shadow-none border-0 w-full h-full",
                                navbar: "border-r border-border pr-2 sm:pr-4 min-w-[160px] sm:min-w-[200px]",
                                page: "pl-2 sm:pl-6 flex-1",
                                pageScrollBox: "p-0",
                                navbarButton: "text-foreground hover:bg-muted text-xs sm:text-sm min-h-[44px] sm:min-h-0 px-2 sm:px-4",
                                navbarButtonActive: "bg-muted text-foreground font-semibold",
                                formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] sm:min-h-0",
                              },
                              variables: {
                                colorPrimary: "hsl(var(--primary))",
                              }
                            }}
                            routing="hash"
                          />
                        </div>
                      </SignedIn>
                      <SignedOut>
                        <div className="flex items-center justify-center py-8 sm:py-12">
                          <p className="text-sm sm:text-base text-muted-foreground text-center px-4">Please sign in to manage your account</p>
                        </div>
                      </SignedOut>
                    </div>
                    <div className="flex gap-3 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        onClick={() => setEditAccountMode(false)} 
                        className="flex-1 sm:flex-initial sm:min-w-[120px]"
                      >
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AchievementFormCard({ achievement, onSave, onCancel, getAchievementIcon }) {
  const [formData, setFormData] = useState({
    id: achievement?.id || "",
    name: achievement?.name || "",
    description: achievement?.description || "",
    icon_name: achievement?.icon_name || "Trophy",
    category: achievement?.category || "engagement",
    requirement: achievement?.requirement || { type: "messages", value: 1 },
    priority: achievement?.priority || 1,
    show_on_home: achievement?.show_on_home || false,
    active: achievement?.active !== undefined ? achievement.active : true,
  });

  const iconOptions = ["Trophy", "Award", "Star", "Flame", "Zap", "Target", "Mail", "BookOpen", "Book", "CheckCircle", "Clock", "Sparkles"];
  const categoryOptions = ["streak", "messages", "engagement", "goals", "consistency", "loyalty"];
  const requirementTypes = ["streak", "messages", "feedback_count", "has_goal", "goal_completed", "consecutive_days", "personality_count", "five_star_ratings", "account_age_days"];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.id || !formData.name || !formData.description) {
      toast.error("Please fill in all required fields");
      return;
    }
    onSave(formData);
  };

  return (
    <Card className="border-2 border-indigo-200">
      <CardHeader>
        <CardTitle>
          {achievement ? "Edit Achievement" : "Create New Achievement"}
        </CardTitle>
        <CardDescription>
          {achievement ? "Update achievement details" : "Add a new achievement to the system"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Achievement ID *</Label>
              <Input
                value={formData.id}
                onChange={(e) => setFormData({...formData, id: e.target.value})}
                placeholder="e.g., new_achievement"
                disabled={!!achievement}
                className="mt-2"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Unique identifier (cannot be changed)</p>
            </div>

            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Super Achiever"
                className="mt-2"
                required
              />
            </div>
          </div>

          <div>
            <Label>Description *</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="e.g., Complete 10 goals"
              className="mt-2"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Icon</Label>
              <Select 
                value={formData.icon_name} 
                onValueChange={(value) => setFormData({...formData, icon_name: value})}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      <div className="flex items-center gap-2">
                        {getAchievementIcon(icon)}
                        {icon}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({...formData, category: value})}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Requirement</Label>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <Label className="text-xs">Type</Label>
                <Select 
                  value={formData.requirement.type} 
                  onValueChange={(value) => setFormData({
                    ...formData, 
                    requirement: {...formData.requirement, type: value}
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requirementTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input
                  type="number"
                  value={formData.requirement.value}
                  onChange={(e) => setFormData({
                    ...formData,
                    requirement: {...formData.requirement, value: formData.requirement.type === "has_goal" ? true : Number(e.target.value)}
                  })}
                  disabled={formData.requirement.type === "has_goal"}
                  placeholder="e.g., 10"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Priority</Label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: Number(e.target.value)})}
                className="mt-2"
                min="1"
              />
            </div>

            <div className="flex items-center space-x-2 pt-8">
              <Switch
                id="show-on-home"
                checked={formData.show_on_home}
                onCheckedChange={(checked) => setFormData({...formData, show_on_home: checked})}
              />
              <Label htmlFor="show-on-home">Show on Home</Label>
            </div>

            <div className="flex items-center space-x-2 pt-8">
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {achievement ? "Update Achievement" : "Create Achievement"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [systemEvents, setSystemEvents] = useState([]);
  const [errors, setErrors] = useState(null);
  const [schedulerJobs, setSchedulerJobs] = useState([]);
  const [dbHealth, setDbHealth] = useState(null);
  const [trends, setTrends] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [allMessageHistory, setAllMessageHistory] = useState([]);
  const [emailStats, setEmailStats] = useState(null);
  const [messageHistoryFilter, setMessageHistoryFilter] = useState(() => {
    // Initialize with sanitized filter
    return sanitizeFilter({
      email: "",
      personality: "",
      startDate: "",
      endDate: ""
    });
  });
  const [adminToken, setAdminToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState("all"); // all, active, inactive
  const [logFilterStatus, setLogFilterStatus] = useState("all"); // all, success, failed
  const [logFilterEmail, setLogFilterEmail] = useState("");
  const [achievements, setAchievements] = useState([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState(null);
  const [showAchievementForm, setShowAchievementForm] = useState(false);
  const [selectedUserForAchievement, setSelectedUserForAchievement] = useState(null);
  const [selectedAchievementForBulk, setSelectedAchievementForBulk] = useState(null);

  const userTimezoneMap = useMemo(() => {
    const map = new Map();
    users.forEach((item) => {
      if (item?.email) {
        map.set(item.email, item.schedule?.timezone || null);
      }
    });
    return map;
  }, [users]);

  const fetchAdminData = async (token) => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, usersRes, logsRes, feedbackRes, eventsRes, errorsRes, jobsRes, healthRes, emailStatsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/users`, { headers }),
        axios.get(`${API}/admin/email-logs?limit=200`, { headers }),
        axios.get(`${API}/admin/feedback?limit=100`, { headers }),
        axios.get(`${API}/analytics/system-events?limit=100`, { headers }),
        axios.get(`${API}/admin/errors?limit=100`, { headers }),
        axios.get(`${API}/admin/scheduler/jobs`, { headers }),
        axios.get(`${API}/admin/database/health`, { headers }),
        axios.get(`${API}/admin/email-statistics?days=30`, { headers }).catch(() => ({ data: null }))
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data.users);
      setLogs(logsRes.data.logs);
      setFeedbacks(feedbackRes.data.feedbacks);
      setSystemEvents(eventsRes.data.events || []);
      setErrors(errorsRes.data);
      setSchedulerJobs(jobsRes.data.jobs || []);
      setDbHealth(healthRes.data);
      setEmailStats(emailStatsRes.data);
      setAuthenticated(true);
      
      // Store token in sessionStorage
      sessionStorage.setItem('adminToken', token);
    } catch (error) {
      toast.error("Authentication failed");
      setAuthenticated(false);
      sessionStorage.removeItem('adminToken');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    fetchAdminData(adminToken);
  };

  const handleLogout = () => {
    setAuthenticated(false);
    sessionStorage.removeItem('adminToken');
    setAdminToken("");
  };

  const handleRefresh = () => {
    const token = sessionStorage.getItem('adminToken');
    if (token) {
      fetchAdminData(token);
    }
  };

  const fetchAchievements = useCallback(async () => {
    setAchievementsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.get(`${API}/admin/achievements?include_inactive=true`, { headers });
      console.log("Achievements response:", response.data);
      if (response.data && response.data.achievements) {
        setAchievements(response.data.achievements || []);
      } else if (Array.isArray(response.data)) {
        // Handle case where API returns array directly
        setAchievements(response.data);
      } else {
        console.error("Unexpected response format:", response.data);
        toast.error("Unexpected response format from server");
        setAchievements([]);
      }
    } catch (error) {
      console.error("Failed to fetch achievements:", error);
      console.error("Error details:", error.response?.data || error.message);
      toast.error(error.response?.data?.detail || error.message || "Failed to load achievements");
      setAchievements([]);
    } finally {
      setAchievementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchAchievements();
    }
  }, [authenticated, fetchAchievements]);

  const handleCreateAchievement = async (achievementData) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.post(`${API}/admin/achievements`, achievementData, { headers });
      toast.success("🏆 Achievement Created!", {
        description: "New achievement added! Users can now unlock this milestone!",
        duration: 4000,
      });
      
      setTimeout(() => {
        toast.success("✨ Exciting!", {
          description: "This achievement will motivate users to reach new heights!",
          duration: 3000,
        });
      }, 600);
      
      setTimeout(() => {
        toast.success("🎯 Users Will Love This!", {
          description: "They'll be excited to unlock this achievement!",
          duration: 2500,
        });
      }, 1200);
      setShowAchievementForm(false);
      setEditingAchievement(null);
      fetchAchievements();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create achievement");
    }
  };

  const handleUpdateAchievement = async (achievementId, achievementData) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.put(`${API}/admin/achievements/${achievementId}`, achievementData, { headers });
      toast.success("✅ Achievement Updated!", {
        description: "The achievement has been updated successfully!",
        duration: 3000,
      });
      
      setTimeout(() => {
        toast.success("🎯 Changes Saved!", {
          description: "Users will see the updated achievement details!",
          duration: 2500,
        });
      }, 500);
      setShowAchievementForm(false);
      setEditingAchievement(null);
      fetchAchievements();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update achievement");
    }
  };

  const handleDeleteAchievement = async (achievementId, hardDelete = false) => {
    if (!confirm(`Are you sure you want to ${hardDelete ? 'permanently delete' : 'deactivate'} this achievement?`)) {
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.delete(`${API}/admin/achievements/${achievementId}?hard_delete=${hardDelete}`, { headers });
      if (hardDelete) {
        toast.success("🗑️ Achievement Deleted", {
          description: "The achievement has been permanently removed from the system.",
          duration: 3000,
        });
      } else {
        toast.success("⏸️ Achievement Deactivated", {
          description: "The achievement has been deactivated. Users won't see it anymore.",
          duration: 3000,
        });
        
        setTimeout(() => {
          toast.info("💡 Tip", {
            description: "You can reactivate it anytime if needed!",
            duration: 2500,
          });
        }, 500);
      }
      fetchAchievements();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete achievement");
    }
  };

  const handleAssignAchievement = async (email, achievementId) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.post(`${API}/admin/users/${email}/achievements/${achievementId}`, {}, { headers });
      if (response.data.status === "already_assigned") {
        toast.info("ℹ️ Already Assigned", {
          description: "This user already has this achievement!",
          duration: 3000,
        });
      } else {
        toast.success("🎉 Achievement Assigned!", {
          description: "The user has been awarded this achievement!",
          duration: 3000,
        });
        
        setTimeout(() => {
          toast.success("✨ They'll Love It!", {
            description: "This will make their day!",
            duration: 2500,
          });
        }, 500);
      }
      setSelectedUserForAchievement(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to assign achievement");
    }
  };

  const handleRemoveAchievement = async (email, achievementId) => {
    if (!confirm("Are you sure you want to remove this achievement from the user?")) {
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.delete(`${API}/admin/users/${email}/achievements/${achievementId}`, { headers });
      toast.success("Achievement removed successfully");
      setSelectedUserForAchievement(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove achievement");
    }
  };

  const handleBulkAssignAchievement = async (achievementId) => {
    if (!confirm(`Are you sure you want to assign this achievement to ALL active users?`)) {
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.post(`${API}/admin/achievements/${achievementId}/assign-all`, {}, { headers });
      toast.success(
        `Achievement assigned to ${response.data.stats.newly_assigned} users. ${response.data.stats.already_had} users already had it.`
      );
      setSelectedAchievementForBulk(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to assign achievement to all users");
    }
  };

  const handleBulkRemoveAchievement = async (achievementId) => {
    if (!confirm(`Are you sure you want to remove this achievement from ALL users? This action cannot be undone.`)) {
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.post(`${API}/admin/achievements/${achievementId}/remove-all`, {}, { headers });
      toast.success(`Achievement removed from ${response.data.users_affected} users`);
      setSelectedAchievementForBulk(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove achievement from all users");
    }
  };

  const handleRecalculateStreaks = async () => {
    if (!confirm("Are you sure you want to recalculate streaks for all users? This will update streak counts based on message history.")) {
      return;
    }
    try {
      setAchievementsLoading(true);
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.post(`${API}/admin/achievements/recalculate-streaks`, {}, { headers });
      
      const results = response.data.results || [];
      const summary = results.reduce((acc, r) => {
        if (r.old_streak !== r.new_streak) {
          acc.changed++;
        }
        return acc;
      }, { changed: 0, total: results.length });
      
      toast.success(
        `Streaks recalculated! ${summary.changed} user(s) had their streaks updated. Total: ${summary.total} users processed.`
      );
      
      // Refresh admin data to show updated streaks
      handleRefresh();
    } catch (error) {
      console.error("Failed to recalculate streaks:", error);
      toast.error(error.response?.data?.detail || "Failed to recalculate streaks");
    } finally {
      setAchievementsLoading(false);
    }
  };

  const getAchievementIcon = (iconName) => {
    const iconMap = {
      "Sprout": CheckCircle,
      "Flame": Flame,
      "Zap": Zap,
      "Trophy": Trophy,
      "Mail": Mail,
      "BookOpen": BookOpen,
      "Book": Book,
      "Star": Star,
      "Target": Target,
      "Award": Award,
      "Clock": Clock,
      "Sparkles": Sparkles,
    };
    const IconComponent = iconMap[iconName] || Trophy;
    return <IconComponent className="h-5 w-5" />;
  };

  const handleSendTestEmail = async (email) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.post(`${API}/send-now/${email}`, {}, { headers });
      toast.success(`Test email sent to ${email}`);
      handleRefresh();
    } catch (error) {
      toast.error("Failed to send test email");
    }
  };

  const handleToggleUserStatus = async (email, currentStatus) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.put(`${API}/admin/users/${email}`, 
        { active: !currentStatus }, 
        { headers }
      );
      toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'}`);
      handleRefresh();
    } catch (error) {
      toast.error("Failed to update user status");
    }
  };

  // Check for stored token on mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem('adminToken');
    if (storedToken) {
      setAdminToken(storedToken);
      fetchAdminData(storedToken);
    }
  }, []);

  // Auto-refresh admin data every 30 seconds when authenticated
  useEffect(() => {
    if (!authenticated) return;
    
    const storedToken = sessionStorage.getItem('adminToken');
    if (!storedToken) return;

    const interval = setInterval(() => {
      fetchAdminData(storedToken);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [authenticated]);

  // Auto-load message history when tab is accessed
  useEffect(() => {
    if (authenticated && allMessageHistory.length === 0) {
      fetchAllMessageHistory();
    }
  }, [authenticated]);

  // Filter users based on search and status
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterActive === "all" || 
                         (filterActive === "active" && user.active) ||
                         (filterActive === "inactive" && !user.active);
    return matchesSearch && matchesFilter;
  });

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesStatus = logFilterStatus === "all" || log.status === logFilterStatus;
    const matchesEmail = !logFilterEmail || log.email.toLowerCase().includes(logFilterEmail.toLowerCase());
    return matchesStatus && matchesEmail;
  });

  const handleViewUserDetails = (email) => {
    setSelectedUserEmail(email);
  };

  const handleExportData = (type) => {
    let data, filename;
    switch(type) {
      case 'users':
        data = JSON.stringify(users, null, 2);
        filename = 'users_export.json';
        break;
      case 'logs':
        data = JSON.stringify(logs, null, 2);
        filename = 'email_logs_export.json';
        break;
      case 'feedback':
        data = JSON.stringify(feedbacks, null, 2);
        filename = 'feedback_export.json';
        break;
      case 'messages':
        data = JSON.stringify(allMessageHistory, null, 2);
        filename = 'message_history_export.json';
        break;
      default:
        return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${type} data`);
  };

  const handleGlobalSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.get(`${API}/admin/search?query=${encodeURIComponent(searchQuery)}&limit=50`, { headers });
      setSearchResults(response.data);
    } catch (error) {
      toast.error("Search failed");
    }
  };

  const handleTriggerJob = async (jobId) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      await axios.post(`${API}/admin/scheduler/jobs/${jobId}/trigger`, {}, { headers });
      toast.success("Job triggered successfully");
      handleRefresh();
    } catch (error) {
      toast.error("Failed to trigger job");
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.post(
        `${API}/admin/broadcast`,
        { message: broadcastMessage, subject: broadcastSubject || undefined },
        { headers }
      );
      toast.success(`Broadcast sent: ${response.data.success} success, ${response.data.failed} failed`);
      setBroadcastMessage("");
      setBroadcastSubject("");
      handleRefresh();
    } catch (error) {
      toast.error("Broadcast failed");
    }
  };

  const fetchTrends = async (days = 30) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.get(`${API}/admin/analytics/trends?days=${days}`, { headers });
      setTrends(response.data);
    } catch (error) {
      console.error("Failed to fetch trends:", error);
    }
  };

  const fetchAllMessageHistory = async () => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const params = new URLSearchParams();
      if (messageHistoryFilter.email) params.append('email', String(messageHistoryFilter.email));
      if (messageHistoryFilter.personality) {
        const personalityValue = typeof messageHistoryFilter.personality === 'string' 
          ? messageHistoryFilter.personality 
          : (messageHistoryFilter.personality?.value || messageHistoryFilter.personality?.name || '');
        if (personalityValue) params.append('personality', String(personalityValue));
      }
      if (messageHistoryFilter.startDate) params.append('start_date', String(messageHistoryFilter.startDate));
      if (messageHistoryFilter.endDate) params.append('end_date', String(messageHistoryFilter.endDate));
      params.append('limit', '500');
      
      const response = await axios.get(`${API}/admin/message-history?${params.toString()}`, { headers });
      // Sanitize messages before setting state
      const sanitizedMessages = sanitizeMessages(response.data.messages || []);
      setAllMessageHistory(sanitizedMessages);
    } catch (error) {
      toast.error("Failed to fetch message history");
    }
  };

  const fetchEmailStatistics = async (days = 30) => {
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      const response = await axios.get(`${API}/admin/email-statistics?days=${days}`, { headers });
      setEmailStats(response.data);
    } catch (error) {
      console.error("Failed to fetch email statistics:", error);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-indigo-500" />
            </div>
            <CardTitle className="text-center">Admin Access</CardTitle>
            <CardDescription className="text-center">Enter admin credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <Input
                type="password"
                placeholder="Admin token"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Authenticating..." : "Access Dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Monitor InboxInspire</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={handleRefresh} disabled={loading} className="w-full sm:w-auto">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {loading && !stats && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <span className="ml-2 text-muted-foreground">Loading dashboard...</span>
          </div>
        )}

        {!loading && !stats && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="h-5 w-5" />
                <p>Stats not available. Please refresh or check your connection.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.total_users}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.active_users} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Emails Sent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.total_emails_sent}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.failed_emails} failed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">{stats.success_rate}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Flame className="h-4 w-4" />
                  Avg Streak
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">{stats.avg_streak}</p>
                <p className="text-xs text-muted-foreground mt-1">days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Avg Rating
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-600">{stats.avg_rating}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total_feedback} feedbacks
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="realtime" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
            <TabsList className="inline-flex w-full min-w-max sm:min-w-0 gap-1 sm:gap-0 sm:grid sm:grid-cols-12">
              <TabsTrigger value="realtime" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">🔴 Live</span>
                <span className="sm:hidden">Live</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Users ({users.length})</span>
                <span className="sm:hidden">Users</span>
              </TabsTrigger>
              <TabsTrigger value="email-history" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Email History</span>
                <span className="sm:hidden">Emails</span>
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Logs ({logs.length})</span>
                <span className="sm:hidden">Logs</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Feedback ({feedbacks.length})</span>
                <span className="sm:hidden">Feedback</span>
              </TabsTrigger>
              <TabsTrigger value="events" className="flex-shrink-0 text-xs sm:text-sm">Events</TabsTrigger>
              <TabsTrigger value="errors" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Errors {errors?.total > 0 && `(${errors.total})`}</span>
                <span className="sm:hidden">Errors</span>
              </TabsTrigger>
              <TabsTrigger value="scheduler" className="flex-shrink-0 text-xs sm:text-sm">Scheduler</TabsTrigger>
              <TabsTrigger value="database" className="flex-shrink-0 text-xs sm:text-sm">Database</TabsTrigger>
              <TabsTrigger value="trends" className="flex-shrink-0 text-xs sm:text-sm">Trends</TabsTrigger>
              <TabsTrigger value="search" className="flex-shrink-0 text-xs sm:text-sm">Search</TabsTrigger>
              <TabsTrigger value="broadcast" className="flex-shrink-0 text-xs sm:text-sm">Broadcast</TabsTrigger>
              <TabsTrigger value="achievements" className="flex-shrink-0 text-xs sm:text-sm">Achievements</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="realtime">
            <RealTimeAnalytics adminToken={sessionStorage.getItem('adminToken')} />
          </TabsContent>

          <TabsContent value="email-history">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                    <CardTitle className="text-lg sm:text-xl">All Email Send History</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={fetchAllMessageHistory} className="flex-1 sm:flex-none">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExportData('messages')} className="flex-1 sm:flex-none">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-4">
                    <Input
                      placeholder="Filter by email..."
                      value={messageHistoryFilter.email}
                      onChange={(e) => setMessageHistoryFilter({...messageHistoryFilter, email: e.target.value})}
                      className="w-full sm:max-w-xs"
                      onKeyPress={(e) => e.key === 'Enter' && fetchAllMessageHistory()}
                    />
                    <Input
                      placeholder="Filter by personality..."
                      value={typeof messageHistoryFilter.personality === 'string' ? messageHistoryFilter.personality : ''}
                      onChange={(e) => setMessageHistoryFilter({...messageHistoryFilter, personality: e.target.value})}
                      className="w-full sm:max-w-xs"
                      onKeyPress={(e) => e.key === 'Enter' && fetchAllMessageHistory()}
                    />
                    <Input
                      type="date"
                      placeholder="Start date"
                      value={messageHistoryFilter.startDate}
                      onChange={(e) => setMessageHistoryFilter({...messageHistoryFilter, startDate: e.target.value})}
                      className="w-full sm:max-w-xs"
                    />
                    <Input
                      type="date"
                      placeholder="End date"
                      value={messageHistoryFilter.endDate}
                      onChange={(e) => setMessageHistoryFilter({...messageHistoryFilter, endDate: e.target.value})}
                      className="w-full sm:max-w-xs"
                    />
                    <Button onClick={fetchAllMessageHistory} size="sm" className="w-full sm:w-auto">
                      <Filter className="h-4 w-4 mr-2" />
                      Apply Filters
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setMessageHistoryFilter({email: "", personality: "", startDate: "", endDate: ""});
                        fetchAllMessageHistory();
                      }}
                      className="w-full sm:w-auto"
                    >
                      Clear
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {allMessageHistory.length > 0 ? (
                      allMessageHistory.map((msg) => {
                        return (
                          <Card key={msg.id} className="hover:bg-slate-50 transition">
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <p className="font-medium text-xs sm:text-sm truncate">{msg.email}</p>
                                    {msg.personality && (
                                      <Badge variant="outline">{safePersonalityValue(msg.personality)}</Badge>
                                    )}
                                    {msg.used_fallback && (
                                      <Badge className="bg-yellow-500">Backup</Badge>
                                    )}
                                    {msg.rating && (
                                      <div className="flex">
                                        {[...Array(5)].map((_, i) => (
                                          <Star
                                            key={i}
                                            className={`h-3 w-3 ${
                                              i < msg.rating
                                                ? 'fill-yellow-400 text-yellow-400'
                                                : 'text-gray-300'
                                            }`}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs sm:text-sm text-gray-700 line-clamp-3 mb-2">{msg.message}</p>
                                  {msg.feedback_text && (
                                    <div className="mt-2 p-2 bg-blue-50 rounded border-l-2 border-blue-400">
                                      <p className="text-xs text-blue-700 font-medium mb-1">User Feedback:</p>
                                      <p className="text-xs text-blue-900">{msg.feedback_text}</p>
                                    </div>
                                  )}
                                </div>
                                <div className="text-left sm:text-right sm:ml-4 flex-shrink-0">
                                  <span className="text-xs text-muted-foreground block">
                                    {formatDateTimeForTimezone(msg.sent_at, ADMIN_TIMEZONE, { includeZone: true })}
                                  </span>
                                  {msg.message_type && (
                                    <Badge variant="outline" className="mt-1 text-xs">
                                      {msg.message_type}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No message history found</p>
                        <Button onClick={fetchAllMessageHistory}>Load Message History</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {emailStats && (
                <Card>
                  <CardHeader>
                    <CardTitle>Email Delivery Statistics</CardTitle>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline" onClick={() => fetchEmailStatistics(7)}>7 Days</Button>
                      <Button size="sm" variant="outline" onClick={() => fetchEmailStatistics(30)}>30 Days</Button>
                      <Button size="sm" variant="outline" onClick={() => fetchEmailStatistics(90)}>90 Days</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Sent</p>
                        <p className="text-2xl font-bold text-blue-600">{emailStats.summary?.total_sent || 0}</p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Successful</p>
                        <p className="text-2xl font-bold text-green-600">{emailStats.summary?.successful || 0}</p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Failed</p>
                        <p className="text-2xl font-bold text-red-600">{emailStats.summary?.failed || 0}</p>
                      </div>
                      <div className="p-4 bg-indigo-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Success Rate</p>
                        <p className="text-2xl font-bold text-indigo-600">{emailStats.summary?.success_rate || 0}%</p>
                      </div>
                    </div>

                    {emailStats.top_users && emailStats.top_users.length > 0 && (
                      <div className="mt-6">
                        <h3 className="font-medium mb-3">Top Users by Email Count</h3>
                        <div className="space-y-2">
                          {emailStats.top_users.slice(0, 10).map((user, idx) => (
                            <div key={user._id || idx} className="flex items-center justify-between p-2 border rounded">
                              <span className="text-sm font-medium">{user._id || 'Unknown'}</span>
                              <div className="flex items-center gap-3">
                                <Badge className="bg-green-500">{user.success_count || 0} ✓</Badge>
                                <Badge className="bg-red-500">{user.failed_count || 0} ✗</Badge>
                                <span className="text-sm font-bold">{user.count || 0} total</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <CardTitle className="text-lg sm:text-xl">All Users</CardTitle>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full sm:max-w-xs"
                    />
                    <select
                      value={filterActive}
                      onChange={(e) => setFilterActive(e.target.value)}
                      className="px-3 py-2 border rounded-md w-full sm:w-auto"
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 sm:space-y-4">
                  {filteredUsers.map((user) => {
                    // Defensive: Ensure personalities is an array with valid objects
                    const personalities = Array.isArray(user.personalities) 
                      ? user.personalities.filter(p => p && typeof p === 'object' && p.value)
                      : [];
                    const schedule = user.schedule || {};
                    const scheduleTimezone = schedule.timezone;
                    const scheduleTimeLabel = formatScheduleTime(
                      schedule.times?.[0] || schedule.time || "",
                      scheduleTimezone,
                    );
                    const hasScheduleTime = scheduleTimeLabel && scheduleTimeLabel !== "Not set";
                    const displayTimezone = getDisplayTimezone(scheduleTimezone);
                    const cardStatusLabel = schedule.paused ? "Paused" : user.active ? "Active" : "Inactive";
                    const cardStatusColor = schedule.paused ? "bg-yellow-400" : user.active ? "bg-green-500" : "bg-gray-400";
                    
                    // Get personality display string safely
                    const personalityDisplay = personalities.length > 0 
                      ? personalities.map(p => safePersonalityValue(p)).join(', ') 
                      : 'None';
                    
                    return (
                      <div key={user.id} className="p-3 sm:p-4 border rounded-lg hover:bg-slate-50 transition">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-sm sm:text-base truncate">{user.name || 'Unknown User'}</p>
                              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${cardStatusColor}`} />
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate mb-2">{user.email}</p>
                            <div className="mt-2 space-y-1">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Satellite className="h-3 w-3" /> Status: <span className="font-semibold text-gray-800">{cardStatusLabel}</span>
                            </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Target className="h-3 w-3" /> Goals: {user.goals ? user.goals.substring(0, 60) + '...' : 'Not set'}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> Personalities: {personalityDisplay}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" /> Schedule:{" "}
                                <span className="font-semibold text-indigo-600">
                                  {schedule.frequency || "Not set"}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Globe className="h-3 w-3" /> Local send time:{" "}
                                <span className="font-semibold text-blue-600">
                                  {hasScheduleTime ? scheduleTimeLabel : "Not set"}
                                </span>
                                {hasScheduleTime && displayTimezone && (
                                  <span className="ml-2 text-xs text-gray-500">
                                    ({displayTimezone})
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Flame className="h-3 w-3" /> Streak: <span className="font-semibold text-orange-600">{user.streak_count || 0} days</span> • 
                                <MessageSquare className="h-3 w-3 ml-1" /> Messages: {user.total_messages_received || 0}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-row sm:flex-col gap-2 sm:ml-4 flex-shrink-0">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleViewUserDetails(user.email)}
                              className="flex-1 sm:flex-none text-xs sm:text-sm"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleSendTestEmail(user.email)}
                              className="flex-1 sm:flex-none text-xs sm:text-sm"
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Send Now</span>
                              <span className="sm:hidden">Send</span>
                            </Button>
                            <Button 
                              size="sm" 
                              variant={user.active ? "destructive" : "default"}
                              onClick={() => handleToggleUserStatus(user.email, user.active)}
                              className="flex-1 sm:flex-none text-xs sm:text-sm"
                            >
                              {user.active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No users found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Email Logs</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => handleExportData('logs')}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
                <div className="flex gap-2 mt-4">
                  <Input
                    placeholder="Filter by email..."
                    value={logFilterEmail}
                    onChange={(e) => setLogFilterEmail(e.target.value)}
                    className="max-w-xs"
                  />
                  <select
                    value={logFilterStatus}
                    onChange={(e) => setLogFilterStatus(e.target.value)}
                    className="px-3 py-2 border rounded-md"
                  >
                    <option value="all">All Status</option>
                    <option value="success">Success</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredLogs.map((log) => {
                    const timestamp = log.local_sent_at || log.sent_at;
                    return (
                      <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{log.email}</p>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {log.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{log.subject}</p>
                          {log.error_message && (
                            <p className="text-xs text-red-600 mt-1">Error: {log.error_message}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeForTimezone(timestamp, ADMIN_TIMEZONE, {
                            includeZone: true,
                          })}
                        </span>
                      </div>
                    );
                  })}
                  {filteredLogs.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No logs found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>System Events</CardTitle>
                <CardDescription>Background processes and system activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {systemEvents.map((event) => (
                    <div key={event.id} className="flex items-start justify-between p-3 border rounded-lg text-sm">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={event.status === 'success' ? 'bg-green-500' : 'bg-red-500'}>
                            {event.status}
                          </Badge>
                          <span className="font-medium">{event.event_type}</span>
                          <Badge variant="outline">{event.event_category}</Badge>
                        </div>
                        {event.details && Object.keys(event.details).length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {JSON.stringify(event.details).substring(0, 150)}
                          </p>
                        )}
                        {event.duration_ms && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Duration: {event.duration_ms}ms
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTimeForTimezone(event.timestamp, ADMIN_TIMEZONE, { includeZone: true })}
                      </span>
                    </div>
                  ))}
                  {systemEvents.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No system events found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors">
            <div className="grid gap-6">
              {errors && (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <CardTitle>System Errors ({errors.system_errors?.length || 0})</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {errors.system_errors?.slice(0, 20).map((error) => (
                          <div key={error.id} className="p-3 border rounded-lg bg-red-50">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <Badge className="bg-red-500 mb-2">{error.event_type}</Badge>
                                {error.details && (
                                  <pre className="text-xs overflow-x-auto mt-2">
                                    {JSON.stringify(error.details, null, 2)}
                                  </pre>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTimeForTimezone(error.timestamp, ADMIN_TIMEZONE, { includeZone: true })}
                              </span>
                            </div>
                          </div>
                        ))}
                        {(!errors.system_errors || errors.system_errors.length === 0) && (
                          <p className="text-center text-muted-foreground py-4">No system errors</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>API Errors ({errors.api_errors?.length || 0})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {errors.api_errors?.slice(0, 20).map((error) => (
                          <div key={error.id} className="p-3 border rounded-lg bg-orange-50">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-orange-500">{error.status_code}</Badge>
                                  <span className="font-medium text-sm">{error.endpoint}</span>
                                </div>
                                {error.error_message && (
                                  <p className="text-xs text-red-600">{error.error_message}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Response time: {error.response_time_ms}ms
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTimeForTimezone(error.timestamp, ADMIN_TIMEZONE, { includeZone: true })}
                              </span>
                            </div>
                          </div>
                        ))}
                        {(!errors.api_errors || errors.api_errors.length === 0) && (
                          <p className="text-center text-muted-foreground py-4">No API errors</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Email Failures ({errors.email_errors?.length || 0})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {errors.email_errors?.slice(0, 20).map((error) => (
                          <div key={error.id} className="p-3 border rounded-lg bg-yellow-50">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-sm">{error.email}</p>
                                <p className="text-xs text-muted-foreground mt-1">{error.subject}</p>
                                {error.error_message && (
                                  <p className="text-xs text-red-600 mt-1">Error: {error.error_message}</p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTimeForTimezone(error.sent_at, ADMIN_TIMEZONE, { includeZone: true })}
                              </span>
                            </div>
                          </div>
                        ))}
                        {(!errors.email_errors || errors.email_errors.length === 0) && (
                          <p className="text-center text-muted-foreground py-4">No email failures</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>User Feedback</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => handleExportData('feedback')}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {feedbacks.map((feedback) => (
                    <div key={feedback.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium text-sm">{feedback.email}</p>
                            <div className="flex">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3 w-3 ${
                                    i < feedback.rating
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          {feedback.feedback_text && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Feedback Message:</p>
                              <p className="text-sm text-gray-800 bg-gray-50 p-2 rounded border">{feedback.feedback_text}</p>
                            </div>
                          )}
                          {feedback.personality && (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-xs">
                                {safePersonalityValue(feedback.personality)}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeForTimezone(
                            feedback.created_at,
                            ADMIN_TIMEZONE,
                            { includeZone: true },
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                  {feedbacks.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No feedback yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Messages Delivered</span>
                        <span className="text-2xl font-bold">{stats?.total_messages || 0}</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">User Engagement Rate</span>
                        <span className="text-2xl font-bold">{stats?.engagement_rate || 0}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Active Users</p>
                        <p className="text-2xl font-bold text-blue-600">{stats?.active_users || 0}</p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Inactive Users</p>
                        <p className="text-2xl font-bold text-red-600">{stats?.inactive_users || 0}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Popular Personalities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(() => {
                      const personalityCounts = {};
                      users.forEach(user => {
                        (user.personalities || []).forEach(p => {
                          personalityCounts[p.value] = (personalityCounts[p.value] || 0) + 1;
                        });
                      });
                      
                      return Object.entries(personalityCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([name, count]) => (
                          <div key={name} className="flex items-center justify-between">
                            <span className="text-sm">{name}</span>
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scheduler">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Jobs ({schedulerJobs.length})</CardTitle>
                <CardDescription>All active email scheduling jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {schedulerJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4 text-indigo-600" />
                          <span className="font-medium">{job.id}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Function: {job.func}</p>
                        <p className="text-xs text-muted-foreground">Trigger: {job.trigger || 'N/A'}</p>
                        {job.next_run_time && (
                          <p className="text-xs text-blue-600 mt-1">
                            Next run: {formatDateTimeForTimezone(new Date(job.next_run_time), ADMIN_TIMEZONE, { includeZone: true })}
                          </p>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleTriggerJob(job.id)}>
                        <Play className="h-3 w-3 mr-1" />
                        Trigger
                      </Button>
                    </div>
                  ))}
                  {schedulerJobs.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No scheduled jobs</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="database">
            <div className="grid gap-6">
              {dbHealth && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Collection Statistics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Object.entries(dbHealth.collections || {}).map(([name, count]) => (
                          <div key={name} className="p-3 border rounded-lg">
                            <p className="text-sm text-muted-foreground capitalize">{name.replace('_', ' ')}</p>
                            <p className="text-2xl font-bold">{count.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Documents</p>
                        <p className="text-3xl font-bold text-blue-600">{dbHealth.total_documents?.toLocaleString() || 0}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Activity (Last 24 Hours)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Messages</p>
                          <p className="text-2xl font-bold">{dbHealth.recent_activity?.messages_24h || 0}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Emails</p>
                          <p className="text-2xl font-bold">{dbHealth.recent_activity?.emails_24h || 0}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Activities</p>
                          <p className="text-2xl font-bold">{dbHealth.recent_activity?.activities_24h || 0}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Errors</p>
                          <p className="text-2xl font-bold text-red-600">{dbHealth.recent_activity?.errors_24h || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="trends">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Analytics Trends</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => fetchTrends(7)}>7 Days</Button>
                    <Button size="sm" variant="outline" onClick={() => fetchTrends(30)}>30 Days</Button>
                    <Button size="sm" variant="outline" onClick={() => fetchTrends(90)}>90 Days</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {trends ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-medium mb-2">User Registrations</h3>
                      <div className="space-y-2">
                        {trends.user_trends?.slice(0, 10).map((item) => {
                          const maxCount = trends.user_trends?.length > 0 
                            ? Math.max(...trends.user_trends.map(t => t.count || 0))
                            : 1;
                          return (
                            <div key={item._id} className="flex items-center justify-between">
                              <span className="text-sm">{item._id}</span>
                              <span className="text-sm font-medium">{item.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Email Activity</h3>
                      <div className="space-y-2">
                        {trends.email_trends?.slice(0, 10).map((item) => (
                          <div key={item._id} className="flex items-center justify-between">
                            <span className="text-sm">{item._id}</span>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-green-500">{item.success || 0}</Badge>
                              <Badge className="bg-red-500">{item.failed || 0}</Badge>
                              <span className="text-sm font-medium">{item.count} total</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Feedback Trends</h3>
                      <div className="space-y-2">
                        {trends.feedback_trends?.slice(0, 10).map((item) => (
                          <div key={item._id} className="flex items-center justify-between">
                            <span className="text-sm">{item._id}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">Avg: {item.avg_rating?.toFixed(1) || 0}</span>
                              <span className="text-sm font-medium">{item.count} feedbacks</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Button onClick={() => fetchTrends(30)}>Load Trends</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle>Global Search</CardTitle>
                <CardDescription>Search across all collections</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder="Search users, messages, feedback, logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleGlobalSearch()}
                  />
                  <Button onClick={handleGlobalSearch}>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
                {searchResults && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Found {searchResults.total} results</p>
                    {searchResults.results.users.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Users ({searchResults.results.users.length})</h3>
                        <div className="space-y-2">
                          {searchResults.results.users.map((user) => (
                            <div key={user.email} className="p-2 border rounded text-sm">
                              <p className="font-medium">{user.name} - {user.email}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.results.messages.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Messages ({searchResults.results.messages.length})</h3>
                        <div className="space-y-2">
                          {searchResults.results.messages.map((msg) => (
                            <div key={msg.id} className="p-2 border rounded text-sm">
                              <p className="font-medium">{msg.email}</p>
                              <p className="text-xs text-muted-foreground">{msg.message?.substring(0, 100)}...</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.results.feedback.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Feedback ({searchResults.results.feedback.length})</h3>
                        <div className="space-y-2">
                          {searchResults.results.feedback.map((fb) => (
                            <div key={fb.id} className="p-2 border rounded text-sm">
                              <p className="font-medium">{fb.email}</p>
                              <p className="text-xs text-muted-foreground">{fb.comment?.substring(0, 100)}...</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.results.logs.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Logs ({searchResults.results.logs.length})</h3>
                        <div className="space-y-2">
                          {searchResults.results.logs.map((log) => (
                            <div key={log.id} className="p-2 border rounded text-sm">
                              <p className="font-medium">{log.email} - {log.subject}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="broadcast">
            <Card>
              <CardHeader>
                <CardTitle>Broadcast Message</CardTitle>
                <CardDescription>Send a message to all active users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Subject (Optional)</Label>
                    <Input
                      placeholder="Message subject..."
                      value={broadcastSubject}
                      onChange={(e) => setBroadcastSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Message (HTML supported)</Label>
                    <Textarea
                      placeholder="Enter your message here..."
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      rows={10}
                    />
                  </div>
                  <Button onClick={handleBroadcast} className="w-full">
                    <Megaphone className="h-4 w-4 mr-2" />
                    Send to All Active Users ({users.filter(u => u.active).length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      Achievement Management
                    </CardTitle>
                    <CardDescription>
                      Manage system achievements and assign them to users
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchAchievements}
                      disabled={achievementsLoading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${achievementsLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => {
                        setEditingAchievement(null);
                        setShowAchievementForm(true);
                      }}
                    >
                      <Award className="h-4 w-4 mr-2" />
                      Add Achievement
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {achievementsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Achievement Form */}
                    {showAchievementForm && (
                      <AchievementFormCard
                        achievement={editingAchievement}
                        onSave={(data) => {
                          if (editingAchievement) {
                            handleUpdateAchievement(editingAchievement.id, data);
                          } else {
                            handleCreateAchievement(data);
                          }
                        }}
                        onCancel={() => {
                          setShowAchievementForm(false);
                          setEditingAchievement(null);
                        }}
                        getAchievementIcon={getAchievementIcon}
                      />
                    )}

                    {/* Achievements List */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                          All Achievements ({achievements.length})
                        </h3>
                        <Badge variant="outline">
                          Active: {achievements.filter(a => a.active).length}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {achievements.map((achievement) => (
                          <Card 
                            key={achievement.id}
                            className={achievement.active ? "" : "opacity-60 border-gray-300"}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className={`p-2 rounded-lg ${achievement.active ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-400'}`}>
                                    {getAchievementIcon(achievement.icon_name)}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold">{achievement.name}</h4>
                                    <Badge variant={achievement.active ? "default" : "secondary"} className="text-xs">
                                      {achievement.active ? "Active" : "Inactive"}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">{achievement.description}</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                <Badge variant="outline" className="text-xs">
                                  {achievement.category}
                                </Badge>
                                {achievement.show_on_home && (
                                  <Badge variant="outline" className="text-xs bg-blue-50">
                                    Show on Home
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingAchievement(achievement);
                                    setShowAchievementForm(true);
                                  }}
                                  className="flex-1"
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteAchievement(achievement.id, false)}
                                  className="flex-1"
                                >
                                  {achievement.active ? "Deactivate" : "Delete"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                      {achievements.length === 0 && (
                        <div className="text-center py-12">
                          <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                          <p className="text-muted-foreground">No achievements found</p>
                        </div>
                      )}
                    </div>

                    {/* Bulk Achievement Assignment */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Bulk Achievement Assignment</CardTitle>
                        <CardDescription>Assign or remove achievements from all users at once</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <Label>Select Achievement</Label>
                            <Select 
                              value={selectedAchievementForBulk || ""} 
                              onValueChange={setSelectedAchievementForBulk}
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Choose an achievement" />
                              </SelectTrigger>
                              <SelectContent>
                                {achievements.filter(a => a.active).map((achievement) => (
                                  <SelectItem key={achievement.id} value={achievement.id}>
                                    <div className="flex items-center gap-2">
                                      {getAchievementIcon(achievement.icon_name)}
                                      {achievement.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedAchievementForBulk && (
                            <div className="flex gap-2">
                              <Button
                                variant="default"
                                onClick={() => handleBulkAssignAchievement(selectedAchievementForBulk)}
                                className="flex-1"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Assign to All Users
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleBulkRemoveAchievement(selectedAchievementForBulk)}
                                className="flex-1"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Remove from All Users
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Streak Management */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Streak Management</CardTitle>
                        <CardDescription>Recalculate streaks based on message history</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <Label>Recalculate Streaks</Label>
                            <p className="text-sm text-muted-foreground mb-3">
                              This will recalculate streaks for all users based on their message history. 
                              Useful if streaks are incorrect.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="default"
                                onClick={handleRecalculateStreaks}
                                disabled={achievementsLoading}
                              >
                                <RefreshCw className={`h-4 w-4 mr-2 ${achievementsLoading ? 'animate-spin' : ''}`} />
                                Recalculate All Streaks
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Individual User Achievement Assignment */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Assign Achievement to Individual User</CardTitle>
                        <CardDescription>Manually assign achievements to specific users</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <Label>Select User</Label>
                            <Select 
                              value={selectedUserForAchievement || ""} 
                              onValueChange={setSelectedUserForAchievement}
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Choose a user" />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map((user) => (
                                  <SelectItem key={user.email} value={user.email}>
                                    {user.name} ({user.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedUserForAchievement && (
                            <div>
                              <Label>Select Achievement</Label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                {achievements.filter(a => a.active).map((achievement) => (
                                  <div key={achievement.id} className="flex items-center justify-between p-2 border rounded">
                                    <div className="flex items-center gap-2">
                                      {getAchievementIcon(achievement.icon_name)}
                                      <span className="text-sm">{achievement.name}</span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleAssignAchievement(selectedUserForAchievement, achievement.id)}
                                    >
                                      Assign
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* User Details Modal */}
        {selectedUserEmail && (
          <AdminUserDetails
            email={selectedUserEmail}
            adminToken={sessionStorage.getItem('adminToken')}
            onClose={() => setSelectedUserEmail(null)}
          />
        )}
      </div>
    </div>
  );
}

function SignedInRouter() {
  if (window.location.pathname === "/admin") {
    return <AdminDashboard />;
  }
  return <UserApp />;
}

function UserApp() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [appUser, setAppUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress;

  const loadUserProfile = useCallback(async () => {
    if (!email) {
      return;
    }

    setLoading(true);
    setNeedsOnboarding(false);
    setLoadError(false);

    try {
      const response = await axios.get(`${API}/users/${email}`);
      setAppUser(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        setNeedsOnboarding(true);
        setAppUser(null);
      } else {
        console.error("Failed to load user profile:", error);
        toast.error("Failed to load your profile. Please try again.");
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!email) {
      toast.error("Unable to determine your email address.");
      return;
    }
    loadUserProfile();
  }, [isLoaded, email, loadUserProfile]);

  const handleOnboardingComplete = (userData) => {
    setAppUser(userData);
    setNeedsOnboarding(false);
  };

  const handleUserUpdate = (updatedUser) => {
    setAppUser(updatedUser);
  };

  const handleLogout = () => {
    signOut();
  };

  if (!isLoaded || !email) {
    return <LoadingState message="Preparing your experience..." />;
  }

  if (loading) {
    return <LoadingState message="Loading your dashboard..." />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen email={email} onComplete={handleOnboardingComplete} />;
  }

  if (loadError) {
    return <ErrorState onRetry={loadUserProfile} />;
  }

  if (!appUser) {
    return <LoadingState message="Setting up your account..." />;
  }

  return (
    <DashboardScreen
      user={appUser}
      onLogout={handleLogout}
      onUserUpdate={handleUserUpdate}
    />
  );
}

function LoadingState({ message }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
      <h2 className="text-xl font-semibold text-gray-800">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        We couldn't load your InboxInspire account data. Please try again in a moment.
      </p>
      <Button onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

function App() {
  // Check if user is accessing admin route - bypass Clerk auth for admin
  if (window.location.pathname === "/admin") {
    return (
      <ErrorBoundary>
        <div className="App">
          <Toaster position="top-center" />
          <NetworkStatus />
          <AdminDashboard />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="App">
        <Toaster position="top-center" />
        <NetworkStatus />

        <SignedOut>
          <AuthScreen />
        </SignedOut>

        <SignedIn>
          <SignedInRouter />
        </SignedIn>
      </div>
    </ErrorBoundary>
  );
}

export default App;
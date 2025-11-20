import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import "@/App.css";
import axios from "axios";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@/components/animate-ui/components/headless/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { NotificationList, showNotification } from "@/components/animate-ui/components/community/notification-list";
import { SignedIn, SignedOut, SignIn, SignUp, useUser, useClerk, UserProfile } from "@clerk/clerk-react";
import { CheckCircle, Mail, Sparkles, Clock, User, LogOut, Send, Edit, Shield, BarChart3, Users, History, TrendingUp, Globe, RefreshCw, Flame, Star, Loader2, AlertTriangle, Download, Eye, Filter, Database, Search, Calendar, Play, Megaphone, Trophy, Award, Target, Zap, BookOpen, Book, X, Satellite, Goal, Calendar as CalendarIcon, MessageSquare, Wifi, Activity, Settings, CircleDot, Sun as Sunburst } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MessageHistory } from "@/components/MessageHistory";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { GoalsManager } from "@/components/GoalsManager";
import { StreakCalendar } from "@/components/StreakCalendar";
import { StreakMilestones } from "@/components/StreakMilestones";
import { RealTimeAnalytics } from "@/components/RealTimeAnalytics";
import { AdminUserDetails } from "@/components/AdminUserDetails";
import { AchievementCelebration } from "@/components/AchievementCelebration";
import { DashboardLayout } from "@/components/DashboardLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { NetworkStatus } from "@/components/NetworkStatus";
import { BackendConnectionStatus } from "@/components/BackendConnectionStatus";
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
import { cn } from "@/lib/utils";

// IST timezone constant for admin dashboard
const ADMIN_TIMEZONE = "Asia/Kolkata";

// Import dynamic API configuration
import API_CONFIG from './config/api';
import { ROUTES, getCurrentRoute, updatePageMetadata } from './config/routes';
const BACKEND_URL = API_CONFIG.BACKEND_URL;
const API = API_CONFIG.API_BASE;

const FAMOUS_PERSONALITIES = [
  // Indian Icons (10)
  "A.P.J. Abdul Kalam",
  "Ratan Tata",
  "Sadhguru",
  "M.S. Dhoni",
  "Swami Vivekananda",
  "Sudha Murty",
  "Sachin Tendulkar",
  "Shah Rukh Khan",
  "Narayana Murthy",
  "Kiran Mazumdar-Shaw",
  // Indian-Origin Tech Leaders (2)
  "Sundar Pichai",
  "Satya Nadella",
  // International Icons (7)
  "Elon Musk",
  "Mark Zuckerberg",
  "Oprah Winfrey",
  "Nelson Mandela",
  "Tony Robbins",
  "Michelle Obama",
  "Denzel Washington"
];

const TONE_OPTIONS = [
  "Funny & Uplifting",
  "Friendly & Warm",
  "Tough Love & Real Talk",
  "Serious & Direct",
  "Philosophical & Reflective",
  "Energetic & Enthusiastic",
  "Calm & Meditative",
  "Poetic & Artistic",
  "Sarcastic & Witty",
  "Coach-Like & Accountability",
  "Storytelling & Narrative"
];

function AuthScreen() {
  const currentRoute = getCurrentRoute();
  const pathname = window.location.pathname;
  const isSignUp = pathname.startsWith(ROUTES.SIGN_UP.path);
  
  // Update page metadata
  useEffect(() => {
    const route = isSignUp ? ROUTES.SIGN_UP : ROUTES.SIGN_IN;
    updatePageMetadata(route);
  }, [isSignUp]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-50" />
      
      {/* Animated Background Orbs */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[100px] animate-pulse delay-1000" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-6 shadow-sm">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            {isSignUp ? "Create an account" : "Welcome back"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isSignUp
              ? "Start your journey to daily inspiration"
              : "Sign in to continue your motivation streak"}
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-border/30 shadow-lg bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            {isSignUp ? (
              <SignUp
                routing="path"
                path={ROUTES.SIGN_UP.path}
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border-none bg-transparent p-0",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton: "border border-border/50 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200",
                    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 px-4 rounded-lg transition-all duration-200 w-full shadow-sm hover:shadow",
                    formFieldInput: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    formFieldLabel: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block",
                    identityPreviewEditButton: "text-primary hover:text-primary/80",
                    formResendCodeLink: "text-primary hover:text-primary/80",
                    footerActionLink: "text-primary hover:text-primary/80 font-medium hover:underline underline-offset-4",
                    formFieldErrorText: "text-destructive text-xs mt-1 font-medium",
                    dividerLine: "bg-border/50",
                    dividerText: "text-muted-foreground bg-transparent px-2"
                  },
                  layout: {
                    socialButtonsPlacement: "top",
                    socialButtonsVariant: "blockButton",
                  }
                }}
                afterSignUpUrl="/"
              />
            ) : (
              <SignIn
                routing="path"
                path={ROUTES.SIGN_IN.path}
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border-none bg-transparent p-0",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton: "border border-border/50 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200",
                    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 px-4 rounded-lg transition-all duration-200 w-full shadow-sm hover:shadow",
                    formFieldInput: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    formFieldLabel: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block",
                    identityPreviewEditButton: "text-primary hover:text-primary/80",
                    formResendCodeLink: "text-primary hover:text-primary/80",
                    footerActionLink: "text-primary hover:text-primary/80 font-medium hover:underline underline-offset-4",
                    formFieldErrorText: "text-destructive text-xs mt-1 font-medium",
                    dividerLine: "bg-border/50",
                    dividerText: "text-muted-foreground bg-transparent px-2"
                  },
                  layout: {
                    socialButtonsPlacement: "top",
                    socialButtonsVariant: "blockButton",
                  }
                }}
                afterSignInUrl="/"
                afterSignUpUrl="/"
              />
            )}
          </CardContent>
        </Card>
        
        {/* Footer Links */}
        <div className="mt-8 text-center space-x-4 text-sm text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          <span>•</span>
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          <span>•</span>
          <a href="#" className="hover:text-foreground transition-colors">Help</a>
        </div>
      </div>
    </div>
  );
}

function OnboardingScreen({ email, onComplete }) {
  // Update page metadata
  useEffect(() => {
    updatePageMetadata(ROUTES.ONBOARDING);
  }, []);
  
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
    })(),
    user_timezone: (() => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof tz === 'string' ? tz : "UTC";
      } catch {
        return "UTC";
      }
    })(), // NEW: Global timezone for dashboard
    deadline: null
  });
  const [loading, setLoading] = useState(false);

  const handleSubmitName = (e) => {
    e.preventDefault();
    if (!formData.name) {
      showNotification({ type: 'error', message: "Please enter your name", title: "Validation Error" });
      toast.error("Please enter your name");
      return;
    }
    setStep(2);
  };

  const handleSubmitGoals = (e) => {
    e.preventDefault();
    if (!formData.goals) {
      showNotification({ type: 'error', message: "Please tell us about your goals", title: "Validation Error" });
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
      showNotification({ type: 'error', message: "Please add at least one personality", title: "Validation Error" });
      toast.error("Please add at least one personality");
      return;
    }
    
    setStep(4);
  };

  const handleAddPersonality = () => {
    const { type, value, customValue } = formData.currentPersonality;
    if (!value && !customValue) {
      showNotification({ type: 'error', message: "Please select or enter a personality", title: "Validation Error" });
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
      showNotification({ type: 'success', message: "Personality Added!", title: "Success" });
      toast.success("Personality Added!", {
      description: "Great choice! This personality will inspire your daily motivation!",
      duration: 3000,
    });
    
    setTimeout(() => {
      showNotification({ type: 'success', message: "Keep Going!", title: "Personality Added" });
      toast.success("Keep Going!", {
        description: "Add more personalities or continue to complete your setup!",
        duration: 2500,
      });
    }, 500);
  };

  const handleFinalSubmit = async () => {
    if (formData.personalities.length === 0) {
      showNotification({ type: 'error', message: "Please add at least one personality", title: "Validation Error" });
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
        skip_next: false,
        end_date: formData.deadline || null
      };

      const response = await axios.post(`${API}/onboarding`, {
        email,
        name: formData.name,
        goals: formData.goals,
        personalities: formData.personalities,
        rotation_mode: "sequential",
        schedule,
        user_timezone: formData.user_timezone || formData.timezone || "UTC"  // NEW: Send global timezone
      });

      showNotification({ type: 'success', message: "Welcome to Tend!", title: "Welcome" });
      toast.success("Welcome to Tend!", {
        description: "You're all set! Get ready for daily motivation!",
        duration: 4000,
      });
      
      // Multiple celebratory toasts
      setTimeout(() => {
        showNotification({ type: 'success', message: "Let's Begin!", title: "Ready" });
        toast.success("Let's Begin!", {
          description: "Your journey to success starts now!",
          duration: 3000,
        });
      }, 600);
      
      setTimeout(() => {
        showNotification({ type: 'success', message: "You've Got This!", title: "Motivation" });
        toast.success("You've Got This!", {
          description: "We're here to support you every step of the way!",
          duration: 3000,
        });
      }, 1200);
      
      setTimeout(() => {
        showNotification({ type: 'success', message: "Check Your Inbox!", title: "Email Sent" });
        toast.success("Check Your Inbox!", {
          description: "Your first motivational email is coming soon!",
          duration: 3000,
        });
      }, 1800);
      onComplete(response.data.user);
    } catch (error) {
      showNotification({ type: 'error', message: error.response?.data?.detail || "Failed to complete setup", title: "Error" });
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
                step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>{s}</div>
              {s < 4 && <div className={`h-1 w-8 mx-1 transition-all ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
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
          <Card className="group hover:shadow-lg transition-all duration-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                  <Target className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl">Tell us about your goals</CardTitle>
                  <CardDescription className="mt-1">What are you working towards?</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={handleSubmitGoals} className="space-y-5">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Your Goals</Label>
                  <Textarea
                    placeholder="I'm working on building my startup, learning to code, getting fit..."
                    value={formData.goals}
                    onChange={(e) => setFormData({...formData, goals: e.target.value})}
                    className="min-h-32 resize-none"
                    data-testid="goals-input"
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-11">Back</Button>
                  <Button type="submit" className="flex-1 h-11" data-testid="goals-next-btn">Continue</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="group hover:shadow-lg transition-all duration-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                  <Users className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl">Choose Your Inspiration Style</CardTitle>
                  <CardDescription className="mt-1">Add one or more personalities to rotate through</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
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
          <Card className="group hover:shadow-lg transition-all duration-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                  <Globe className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl">Set Your Timezone</CardTitle>
                  <CardDescription className="mt-1">This will be used for all dates and times across your dashboard</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4" />
                  Your Timezone
                </Label>
                <p className="text-sm text-muted-foreground mb-3">
                  All dates, times, streaks, and analytics will be displayed in this timezone.
                </p>
                <Select 
                  value={safeSelectValue(formData.user_timezone, (() => {
                    try {
                      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                      return typeof tz === 'string' ? tz : "UTC";
                    } catch {
                      return "UTC";
                    }
                  })())} 
                  onValueChange={(value) => setFormData({...formData, user_timezone: value})}
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
                <Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1 h-11">Back</Button>
                <Button onClick={() => setStep(5)} className="flex-1 h-11">Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && (
          <Card className="group hover:shadow-lg transition-all duration-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                  <CalendarIcon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl">Schedule Your Inspiration</CardTitle>
                  <CardDescription className="mt-1">When should we send your messages?</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
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
                  Schedule Timezone
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Timezone for email delivery schedule (can be different from your dashboard timezone)
                </p>
                <Select 
                  value={safeSelectValue(formData.timezone, formData.user_timezone || "UTC")} 
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

              <div>
                <Label>Deadline (Optional)</Label>
                <Input
                  type="datetime-local"
                  value={formData.deadline ? (() => {
                    // Convert UTC ISO string to local datetime-local format
                    const utcDate = new Date(formData.deadline);
                    const year = utcDate.getFullYear();
                    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
                    const day = String(utcDate.getDate()).padStart(2, '0');
                    const hours = String(utcDate.getHours()).padStart(2, '0');
                    const minutes = String(utcDate.getMinutes()).padStart(2, '0');
                    return `${year}-${month}-${day}T${hours}:${minutes}`;
                  })() : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      // Convert local datetime to UTC ISO string
                      const localDate = new Date(value);
                      const isoString = localDate.toISOString();
                      setFormData({...formData, deadline: isoString});
                    } else {
                      setFormData({...formData, deadline: null});
                    }
                  }}
                  className="mt-2"
                  placeholder="Leave empty for no deadline"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Emails will stop being sent after this date and time
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(4)} className="flex-1 h-11">Back</Button>
                <Button onClick={handleFinalSubmit} disabled={loading} className="flex-1 h-11" data-testid="onboarding-finish-btn">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting Up...
                    </>
                  ) : (
                    "Complete Setup"
                  )}
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
  // Update page metadata
  useEffect(() => {
    updatePageMetadata(ROUTES.DASHBOARD);
  }, []);
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [editMode, setEditMode] = useState(false);
  const [editAccountMode, setEditAccountMode] = useState(false);
  const [formData, setFormData] = useState({
    name: typeof user.name === 'string' ? user.name : '',
    goals: typeof user.goals === 'string' ? user.goals : '', // Kept for backward compatibility, not editable in UI
    frequency: typeof user.schedule?.frequency === 'string' ? user.schedule.frequency : 'daily',
    time: user.schedule?.times?.[0] || (typeof user.schedule?.time === 'string' ? user.schedule.time : "09:00"),
    active: typeof user.active === 'boolean' ? user.active : false,
    user_timezone: user.user_timezone || user.schedule?.timezone || "UTC"  // NEW: Global timezone
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
  const goalsManagerRef = useRef(null);

  const userTimezone = user.schedule?.timezone;
  const userScheduleTimeLabel = formatScheduleTime(
    user.schedule?.times?.[0] || user.schedule?.time || "",
    userTimezone,
  );
  const userTimezoneDisplay = getDisplayTimezone(userTimezone);
  const schedulePaused = user.schedule?.paused;
  const statusLabel = schedulePaused ? "Paused" : user.active ? "Active" : "Inactive";
  const statusColor = schedulePaused ? "bg-muted-foreground" : user.active ? "bg-foreground" : "bg-muted";

  const handleUserStateUpdate = useCallback((updatedUser) => {
    // Sanitize user data before updating state
    const sanitizedUser = sanitizeUser(updatedUser);
    if (sanitizedUser) {
      onUserUpdate(sanitizedUser);
      setRefreshKey((prev) => prev + 1);
    } else {
      console.error('Failed to sanitize user data');
      showNotification({ type: 'error', message: 'Invalid user data received', title: "Error" });
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
        active: formData.active,
        user_timezone: formData.user_timezone  // NEW: Update global timezone
      };

      const response = await axios.put(`${API}/users/${user.email}`, updates);
      // Sanitize response data before updating
      const sanitizedUser = sanitizeUser(response.data);
      if (sanitizedUser) {
        handleUserStateUpdate(sanitizedUser);
      }
      setEditMode(false);
      showNotification({ type: 'success', message: "Settings Updated!", title: "Success" });
      toast.success("Settings Updated!", {
        description: "Your preferences have been saved successfully!",
        duration: 3000,
      });
      
      // Additional celebratory toast
      setTimeout(() => {
        showNotification({ type: 'success', message: "All Set!", title: "Complete" });
        toast.success("All Set!", {
          description: "Your motivational emails will reflect these changes!",
          duration: 2500,
        });
      }, 500);
    } catch (error) {
      showNotification({ type: 'error', message: "Failed to update settings", title: "Error" });
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
        showNotification({ type: 'error', message: "No personalities configured", title: "Error" });
        toast.error("No personalities configured");
        setLoading(false);
        return;
      }
      
      const currentIndex = user.current_personality_index || 0;
      const currentPersonality = personalities[currentIndex];
      
      if (!currentPersonality) {
        showNotification({ type: 'error', message: "No active personality found", title: "Error" });
        toast.error("No active personality found");
        setLoading(false);
        return;
      }
      
      // Get goals from formData or user.goals
      const goalsText = formData.goals || user.goals || "Stay motivated and achieve my goals";
      const userName = formData.name || user.name || "User";
      
      // Log API endpoint for debugging
      console.log('Generating preview with API:', `${API}/generate-message`);
      console.log('Request payload:', {
        email: user.email,
        goals: goalsText.substring(0, 50) + '...',
        personality: currentPersonality,
        user_name: userName
      });
      
      const response = await axios.post(`${API}/generate-message`, {
        email: user.email,
        goals: goalsText,
        personality: {
          type: currentPersonality.type,
          value: currentPersonality.value
        },
        user_name: userName
      }, {
        timeout: 30000, // 30 second timeout for AI generation
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.data && response.data.message) {
        setPreviewMessage(response.data.message);
        if (response.data.used_fallback) {
          showNotification({ type: 'warning', message: "Preview generated using a backup message while the AI is busy.", title: "Notice" });
          toast.warning("Preview generated using a backup message while the AI is busy.");
        } else {
          showNotification({ type: 'success', message: "Preview Generated!", title: "Success" });
          toast.success("Preview Generated!", {
            description: "Here's a sneak peek of your personalized motivation!",
            duration: 3000,
          });
          
          setTimeout(() => {
            showNotification({ type: 'success', message: "Ready to Send!", title: "Ready" });
            toast.success("Ready to Send!", {
              description: "This is how your email will look. Want to send it now?",
              duration: 3000,
            });
          }, 500);
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Generate preview error:", error);
      
      let errorMessage = "Failed to generate preview";
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. The AI is taking longer than expected. Please try again.";
      } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
        errorMessage = "Cannot connect to the server. Please check your connection and ensure the backend is running.";
      } else if (error.response) {
        errorMessage = error.response?.data?.detail || error.response?.data?.message || `Server error: ${error.response.status}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showNotification({ type: 'error', message: errorMessage, title: "Error" });
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleSendNow = async () => {
    setLoading(true);
    try {
      // URL encode email to handle special characters
      const encodedEmail = encodeURIComponent(user.email);
      const apiUrl = `${API}/send-now/${encodedEmail}`;
      
      console.log('Sending email now to:', encodedEmail);
      console.log('API URL:', apiUrl);
      console.log('Full API base:', API);
      
      const response = await axios.post(apiUrl, {}, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });
      
      // Check for error response
      if (response.status >= 400) {
        throw new Error(response.data?.detail || `Server returned ${response.status}`);
      }
      
      showNotification({ type: 'success', message: "Email Sent!", title: "Success" });
      toast.success("Email Sent!", {
        description: "Check your inbox for your personalized motivation!",
        duration: 3000,
      });
      
      // Additional celebratory toasts
      setTimeout(() => {
        showNotification({ type: 'success', message: "You've Got This!", title: "Motivation" });
        toast.success("You've Got This!", {
          description: "Your motivation is on its way. Keep pushing forward!",
          duration: 3000,
        });
      }, 600);
      
      setTimeout(() => {
        showNotification({ type: 'success', message: "Stay Strong!", title: "Motivation" });
        toast.success("Stay Strong!", {
          description: "Every step counts. You're doing amazing!",
          duration: 2500,
        });
      }, 1200);
      await refreshUserData();
    } catch (error) {
      console.error("Send now error:", error);
      
      let errorMessage = "Failed to send email";
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. Please check your connection and try again.";
      } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
        errorMessage = "Cannot connect to the server. Please check your connection and ensure the backend is running.";
      } else if (error.response) {
        const serverError = error.response?.data?.detail || error.response?.data?.message;
        if (serverError) {
          errorMessage = serverError;
        } else {
          errorMessage = `Server error: ${error.response.status}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showNotification({ type: 'error', message: errorMessage, title: "Error" });
      toast.error(errorMessage, { duration: 5000 });
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
      showNotification({ type: 'error', message: "Failed to load achievements", title: "Error" });
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

  const [activeTab, setActiveTab] = useState("overview");

  return (
    <>
      {/* Achievement Celebration Modal */}
      <AchievementCelebration
        achievements={newAchievements}
        open={showCelebration}
        onClose={() => setShowCelebration(false)}
        onViewAchievements={handleViewAchievements}
      />
      
      <DashboardLayout
        user={user}
        onLogout={onLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddGoal={() => {
          // Switch to overview tab if not already there
          if (activeTab !== "overview") {
            setActiveTab("overview");
            // Wait for tab switch, then open modal
            setTimeout(() => {
              if (goalsManagerRef.current) {
                goalsManagerRef.current.openModal();
              }
            }, 100);
          } else {
            // Already on overview, open modal immediately
            if (goalsManagerRef.current) {
              goalsManagerRef.current.openModal();
            }
          }
        }}
      >
        <TabGroup value={activeTab} onChange={setActiveTab} className="space-y-6">
          <TabPanels>
            <TabPanel value="overview" className="space-y-6 sm:space-y-8">
            {/* Welcome Header - Only on Overview */}
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-1.5">
                    Welcome back, {user?.name?.split(' ')[0] || "User"}
                  </h1>
                  <p className="text-sm text-muted-foreground font-normal flex items-center gap-1.5">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{user?.email || ""}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Hero Section - Streak & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Hero Streak Card - Enhanced with Color */}
              <Card className="lg:col-span-2 border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-amber-500/3 to-transparent shadow-sm hover:shadow-md hover:border-orange-500/30 transition-all duration-300 overflow-hidden relative group">
                {/* Subtle background elements */}
                <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/8 via-amber-500/4 to-transparent opacity-50 group-hover:opacity-70 transition-opacity duration-300" />
                
                <CardContent className="p-6 sm:p-8 relative">
                  {/* Header */}
                  <div className="mb-8">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/15 border border-orange-500/25 group-hover:from-orange-500/25 group-hover:to-amber-500/20 transition-all duration-300 shadow-sm shadow-orange-500/10 flex-shrink-0">
                        <Flame className="h-5 w-5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-semibold text-orange-600/80 dark:text-orange-400/80 uppercase tracking-wider mb-1">Current Streak</h3>
                        <p className="text-xs text-muted-foreground font-normal leading-relaxed">Consecutive days of motivation</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Streak Number Display */}
                  <div className="flex items-end gap-3 mb-8">
                    <div className="relative">
                      <p className="text-6xl sm:text-7xl font-bold tracking-tighter leading-none bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 bg-clip-text text-transparent">
                        {user.streak_count || 0}
                      </p>
                    </div>
                    <p className="text-base font-medium text-orange-600/70 dark:text-orange-400/70 mb-1">days</p>
                  </div>
                  
                  {/* Milestone Progress */}
                  <div className="pt-5 border-t border-orange-500/15">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-orange-600/70 dark:text-orange-400/70 font-medium">Next milestone</span>
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                        {user.streak_count < 7 ? 7 : user.streak_count < 30 ? 30 : user.streak_count < 100 ? 100 : '∞'} days
                      </span>
                    </div>
                    <div className="w-full h-2 bg-orange-500/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500 rounded-full transition-all duration-700 ease-out shadow-sm shadow-orange-500/30"
                        style={{ 
                          width: `${Math.min(100, user.streak_count < 7 
                            ? ((user.streak_count || 0) / 7) * 100 
                            : user.streak_count < 30 
                            ? (((user.streak_count || 0) - 7) / 23) * 100 
                            : user.streak_count < 100
                            ? (((user.streak_count || 0) - 30) / 70) * 100
                            : 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats Summary - Refined */}
              <div className="space-y-4">
                <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors">
                        <Mail className="h-4 w-4 text-blue-500" />
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Messages</p>
                    </div>
                    <p className="text-3xl font-bold tracking-tight text-foreground mb-3">
                      {user.total_messages_received || 0}
                    </p>
                    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-300 rounded-full transition-all duration-700 ease-out shadow-sm"
                        style={{ width: `${Math.min(100, ((user.total_messages_received || 0) / 100) * 100)}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 group-hover:bg-green-500/15 transition-colors">
                        <Target className="h-4 w-4 text-green-500" />
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Goals</p>
                    </div>
                    <p className="text-3xl font-bold tracking-tight text-foreground mb-2">
                      {(() => {
                        // Count active goals from goals array
                        const activeFromGoals = goals ? goals.filter(g => g.active !== false).length : 0;
                        // Check if main goal exists and is active (not paused)
                        const mainGoalActive = user.goals && typeof user.goals === 'string' && user.goals.trim() && !user.schedule?.paused ? 1 : 0;
                        return activeFromGoals + mainGoalActive;
                      })()}
                    </p>
                    <p className="text-xs text-muted-foreground font-normal">
                      {(() => {
                        const totalFromGoals = goals ? goals.length : 0;
                        const hasMainGoal = user.goals && typeof user.goals === 'string' && user.goals.trim() ? 1 : 0;
                        const total = totalFromGoals + hasMainGoal;
                        return `${total} total ${total === 1 ? 'goal' : 'goals'}`;
                      })()}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Quick Actions Card - Refined */}
            <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Quick Actions
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button 
                    size="sm" 
                    onClick={handleSendNow} 
                    disabled={loading} 
                    className="w-full justify-center gap-2 h-10 font-medium shadow-sm hover:shadow-md transition-all"
                  >
                    <Send className="h-4 w-4" />
                    Send Now
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleGeneratePreview} 
                    disabled={loading} 
                    className="w-full justify-center gap-2 h-10 font-medium border-border/40 hover:border-border hover:bg-background/50 transition-all"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate Preview
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setActiveTab("analytics")} 
                    className="w-full justify-center gap-2 h-10 font-medium border-border/40 hover:border-border hover:bg-background/50 transition-all"
                  >
                    <TrendingUp className="h-4 w-4" />
                    View Analytics
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Status Cards - Enhanced Design */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Email Status */}
              <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "p-2 rounded-lg transition-all duration-300",
                      user?.active && !user?.schedule?.paused 
                        ? "bg-green-500/10 group-hover:bg-green-500/15" 
                        : "bg-muted/50"
                    )}>
                      <Activity className={cn(
                        "h-4 w-4 transition-colors",
                        user?.active && !user?.schedule?.paused 
                          ? "text-green-500" 
                          : "text-muted-foreground"
                      )} />
                    </div>
                    <div className={cn(
                      "h-2.5 w-2.5 rounded-full mt-1 transition-all duration-300",
                      user?.active && !user?.schedule?.paused 
                        ? "bg-green-500 shadow-lg shadow-green-500/50 animate-pulse" 
                        : "bg-muted-foreground"
                    )} />
                  </div>
                  <div className="mb-3">
                    <p className={cn(
                      "text-2xl font-bold tracking-tight mb-1 transition-colors",
                      user?.active && !user?.schedule?.paused 
                        ? "text-green-600" 
                        : "text-foreground"
                    )}>
                      {user?.active && !user?.schedule?.paused ? "Active" : "Paused"}
                    </p>
                    <p className="text-xs text-muted-foreground font-normal">
                      Email notifications
                    </p>
                  </div>
                  {/* Schedule frequency indicator */}
                  <div className="pt-3 border-t border-border/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Frequency
                      </span>
                      <span className="text-xs font-semibold text-foreground capitalize">
                        {user?.schedule?.frequency || 'daily'}
                      </span>
                    </div>
                    {user?.schedule?.times && user.schedule.times.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-normal">
                          {user.schedule.times.length} {user.schedule.times.length === 1 ? 'time' : 'times'} per day
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Next Email */}
              {(() => {
                // Calculate next email info similar to AnalyticsDashboard
                if (!user?.schedule || !user?.active) return null;
                
                const schedule = user.schedule;
                const frequency = schedule.frequency || 'daily';
                const times = schedule.times || (schedule.time ? [schedule.time] : ['09:00']);
                const lastEmailSent = user.last_email_sent;
                
                try {
                  const now = new Date();
                  const [hours, minutes] = times[0].split(':').map(Number);
                  
                  let nextSend = new Date();
                  nextSend.setHours(hours, minutes, 0, 0);
                  
                  if (frequency === 'daily') {
                    if (nextSend <= now || (lastEmailSent && new Date(lastEmailSent).toDateString() === now.toDateString())) {
                      nextSend.setDate(nextSend.getDate() + 1);
                    }
                  } else if (frequency === 'weekly') {
                    const daysUntilNext = (7 - now.getDay() + 1) % 7 || 7;
                    nextSend.setDate(nextSend.getDate() + daysUntilNext);
                  } else if (frequency === 'monthly') {
                    nextSend.setMonth(nextSend.getMonth() + 1);
                  }
                  
                  const diffMs = nextSend - now;
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMins / 60);
                  const diffDays = Math.floor(diffHours / 24);
                  
                  let timeDisplay = '';
                  if (diffDays > 0) {
                    timeDisplay = `${diffDays}d`;
                  } else if (diffHours > 0) {
                    timeDisplay = `${diffHours}h`;
                  } else {
                    timeDisplay = `${diffMins}m`;
                  }
                  
                  const goals = typeof user.goals === 'string' ? user.goals : '';
                  const goalPreview = goals ? goals.split('\n')[0].substring(0, 30) + (goals.length > 30 ? '...' : '') : 'Your goals';
                  
                  return (
                    <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/15 transition-colors">
                            <Clock className="h-4 w-4 text-blue-500" />
                          </div>
                        </div>
                        <div>
                          <p className="text-2xl font-semibold tracking-tight text-foreground mb-1">
                            {timeDisplay}
                          </p>
                          <p className="text-xs text-muted-foreground font-normal line-clamp-1">
                            {goalPreview}
                          </p>
                        </div>
                        {/* Countdown indicator */}
                        <div className="mt-3 pt-3 border-t border-border/20">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">Soon</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                } catch (error) {
                  return null;
                }
              })()}

              {/* Achievement */}
              {achievementsLoading ? (
                <Card className="border border-border/30 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ) : achievements.unlocked && achievements.unlocked.length > 0 ? (
                (() => {
                  const highestAchievement = achievements.unlocked
                    .sort((a, b) => {
                      const priorityDiff = (b.priority || 0) - (a.priority || 0);
                      if (priorityDiff !== 0) return priorityDiff;
                      const aDate = a.unlocked_at ? new Date(a.unlocked_at).getTime() : 0;
                      const bDate = b.unlocked_at ? new Date(b.unlocked_at).getTime() : 0;
                      return bDate - aDate;
                    })[0];
                  
                  return (
                    <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-2 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/15 transition-colors">
                            <Trophy className="h-4 w-4 text-amber-500" />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-400/5 border border-amber-500/20 flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                            {getAchievementIcon(highestAchievement.icon_name || "Trophy")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate mb-0.5">
                              {highestAchievement.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {highestAchievement.category || "Achievement"}
                            </p>
                          </div>
                        </div>
                        {/* Achievement progress */}
                        <div className="pt-3 border-t border-border/20">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                              Progress
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {achievements.total_unlocked || 0} / {achievements.total_available || 0}
                            </span>
                          </div>
                          <div className="w-full h-1 bg-muted/30 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                              style={{ 
                                width: `${achievements.total_available > 0 
                                  ? Math.round((achievements.total_unlocked / achievements.total_available) * 100) 
                                  : 0}%` 
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()
              ) : (
                <Card className="border border-border/30 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-5">
                    <div className="text-center py-4">
                      <Trophy className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No achievements yet</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Section Header - Mobile Optimized */}
            <div className="flex items-center gap-2 sm:gap-3 pt-2 sm:pt-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent hidden sm:block" />
              <div className="flex items-center gap-2 px-2 sm:px-4">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Goals & Schedule</h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent hidden sm:block" />
            </div>

            {/* Goals Manager - Mobile Redesigned Container */}
            <div className="relative">
              {/* Desktop: Enhanced Container with gradient */}
              <div className="hidden sm:block relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/2 via-transparent to-blue-500/2 rounded-2xl -z-10 opacity-50" />
                <div className="relative bg-card/40 backdrop-blur-sm border border-border/30 rounded-2xl p-6 sm:p-8 hover:border-border/50 transition-all duration-300">
                  <GoalsManager ref={goalsManagerRef} user={user} onUpdate={handleUserStateUpdate} />
                </div>
              </div>
              
              {/* Mobile: Clean Minimalistic Design */}
              <div className="sm:hidden">
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <GoalsManager ref={goalsManagerRef} user={user} onUpdate={handleUserStateUpdate} />
                </div>
              </div>
            </div>

            {/* Section Header */}
            <div className="flex items-center gap-0 sm:gap-3 pt-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
              <div className="flex items-center gap-0 sm:gap-2 px-4">
                <Sparkles className="hidden sm:block h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Message Preview</h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

            {/* Preview & Send - Enhanced Minimalistic Design */}
            <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm overflow-hidden relative group">
              {/* Subtle background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/2 via-transparent to-blue-500/2 opacity-40 group-hover:opacity-60 transition-opacity duration-300" />
              
              <CardHeader className="pb-4 relative">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-0 sm:gap-3">
                    <div className="hidden sm:block p-2 rounded-lg bg-primary/10 border border-primary/15 group-hover:bg-primary/15 transition-colors duration-300">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base sm:text-lg font-semibold">Preview Your Next Message</CardTitle>
                      <p className="hidden sm:block text-xs text-muted-foreground mt-0.5 font-normal">See what your next motivational email will look like</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleGeneratePreview} 
                      disabled={loading} 
                      className="w-full sm:w-auto border-border/40 hover:border-border hover:bg-background/50 transition-all duration-200"
                    >
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Generate Preview
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleSendNow} 
                      disabled={loading} 
                      data-testid="send-now-btn" 
                      className="w-full sm:w-auto shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      Send Now
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                {previewMessage ? (
                  <div className="bg-gradient-to-br from-muted/40 to-muted/20 border border-border/30 p-6 sm:p-8 rounded-xl relative overflow-hidden">
                    {/* Subtle pattern */}
                    <div className="absolute inset-0 bg-grid-pattern opacity-[0.015]" />
                    
                    <div className="relative">
                      {/* Preview header */}
                      <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-border/20">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-sm shadow-green-500/50" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generated Preview</span>
                        <div className="ml-auto">
                          <div className="h-1.5 w-12 bg-primary/20 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                          </div>
                        </div>
                      </div>
                      
                      {/* Message content */}
                      <div className="prose prose-sm max-w-none">
                        <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap text-foreground font-normal">
                          {previewMessage}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 sm:py-20">
                    <div className="relative inline-block mb-5">
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/8 to-primary/3 border border-primary/15 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform duration-300 shadow-sm">
                        <Mail className="h-10 w-10 text-primary/50" />
                      </div>
                      {/* Subtle glow effect */}
                      <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-base font-semibold text-foreground">Ready to preview?</p>
                      <p className="text-sm text-muted-foreground">Click "Generate Preview" to see a sample message</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </TabPanel>

            <TabPanel value="analytics" className="space-y-6">
            {/* Page Header */}
            <div className="mb-6">
              <div className="flex items-center gap-0 sm:gap-3 mb-2">
                <div className="hidden sm:block p-2 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-400/5 border border-blue-500/20">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Analytics</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Track your progress and engagement metrics
                  </p>
                </div>
              </div>
            </div>

            {/* Your Motivation Streak - First */}
            <AnalyticsDashboard 
              email={user.email}
              user={user}
              refreshKey={refreshKey}
              onNewAchievements={handleNewAchievements}
            />
            
            {/* Streak Calendar */}
            <StreakCalendar 
              streakCount={user.streak_count || 0}
              totalMessages={user.total_messages_received || 0}
              lastEmailSent={user.last_email_sent}
              messageHistory={messageHistory}
              timezone={userTimezone}
            />
            </TabPanel>

            <TabPanel value="achievements" className="space-y-4 sm:space-y-6">
            {/* Page Header */}
            <div className="mb-6">
              <div className="flex items-center gap-0 sm:gap-3 mb-2">
                <div className="hidden sm:block p-2 rounded-lg bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20">
                  <Trophy className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Achievements</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {achievements.total_unlocked} of {achievements.total_available} unlocked
                  </p>
                </div>
              </div>
            </div>

            <Card className="border border-border/30 hover:border-border/50 transition-all duration-300">
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg font-semibold">
                      Your Achievements
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-1.5">
                      Track your progress and unlock new milestones
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
                      <Download />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchAchievements}
                      disabled={achievementsLoading}
                      className="flex-1 sm:flex-initial"
                    >
                      <RefreshCw className={achievementsLoading ? 'animate-spin' : ''} />
                      <span className="hidden sm:inline">Refresh</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {achievementsLoading ? (
                  <div className="flex items-center justify-center py-8 sm:py-12">
                    <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Progress Info with Visual Bar */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
                        <span className="text-sm font-medium text-foreground">Progress</span>
                        <span className="text-sm font-semibold">
                          {achievements.total_available > 0 
                            ? Math.round((achievements.total_unlocked / achievements.total_available) * 100) 
                            : 0}% ({achievements.total_unlocked} of {achievements.total_available})
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500 transition-all duration-700 ease-out rounded-full shadow-sm shadow-orange-500/30"
                          style={{ 
                            width: `${achievements.total_available > 0 
                              ? Math.round((achievements.total_unlocked / achievements.total_available) * 100) 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </div>

                    {/* Unlocked Achievements */}
                    {achievements.unlocked.length > 0 && (
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-orange-600/80 dark:text-orange-400/80">
                          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 flex-shrink-0" />
                          Unlocked ({achievements.unlocked.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {achievements.unlocked.map((achievement) => (
                            <Card 
                              key={achievement.id} 
                              className="border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent hover:border-orange-500/30 hover:shadow-md transition-all duration-300"
                            >
                              <CardContent className="p-3 sm:p-4">
                                <div className="flex items-start gap-2 sm:gap-3">
                                  <div className="p-1.5 sm:p-2 bg-gradient-to-br from-orange-500/20 to-amber-500/15 border border-orange-500/25 rounded-lg text-orange-500 flex-shrink-0">
                                    {getAchievementIcon(achievement.icon_name)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                      <h4 className="font-semibold text-sm sm:text-base truncate text-foreground">{achievement.name}</h4>
                                      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 text-xs w-fit">
                                        Unlocked
                                      </Badge>
                                    </div>
                                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{achievement.description}</p>
                                    {achievement.category && (
                                      <Badge variant="secondary" className="mt-2 text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">
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
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-muted-foreground">
                          <Award className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                          Locked ({achievements.locked.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                          {achievements.locked.map((achievement) => (
                            <Card 
                              key={achievement.id} 
                              className="border border-border/30 bg-muted/30 opacity-75 group hover:opacity-90 hover:border-orange-500/20 transition-all duration-300"
                            >
                              <CardContent className="p-3 sm:p-4">
                                <div className="flex items-start gap-2 sm:gap-3">
                                  <div className="p-1.5 sm:p-2 bg-muted rounded-lg text-muted-foreground flex-shrink-0 group-hover:bg-orange-500/10 group-hover:text-orange-500/50 transition-colors">
                                    {getAchievementIcon(achievement.icon_name)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                      <h4 className="font-semibold text-sm sm:text-base text-muted-foreground truncate">{achievement.name}</h4>
                                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs w-fit">
                                        Locked
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

                    {/* Empty State */}
                    {achievements.unlocked.length === 0 && achievements.locked.length === 0 && (
                      <div className="text-center py-16">
                        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                          <Trophy className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">No achievements available yet</h3>
                        <p className="text-sm text-muted-foreground">Start using Tend to unlock achievements!</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </TabPanel>

            <TabPanel value="history" className="space-y-6">
            {/* Page Header */}
            <div className="mb-6">
              <div className="flex items-center gap-0 sm:gap-3 mb-2">
                <div className="hidden sm:block p-2 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-400/5 border border-purple-500/20">
                  <History className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Message History</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    View and manage all your motivational messages
                  </p>
                </div>
              </div>
            </div>

            <MessageHistory
              email={user.email}
              timezone={userTimezone}
              refreshKey={refreshKey}
              onFeedbackSubmitted={refreshUserData}
            />
            </TabPanel>

            <TabPanel value="settings" className="space-y-6">
              {/* Page Header */}
              <div className="mb-6">
                <div className="flex items-center gap-0 sm:gap-3 mb-2">
                  <div className="hidden sm:block p-2 rounded-lg bg-gradient-to-br from-gray-500/10 to-gray-400/5 border border-gray-500/20">
                    <Settings className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Settings</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Manage your account preferences and information
                    </p>
                  </div>
                </div>
              </div>

              {/* Basic Information Card */}
              <Card className="group hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                          <User className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-lg sm:text-xl">Basic Information</CardTitle>
                          <CardDescription className="text-xs sm:text-sm mt-0.5">Update your name and email preferences</CardDescription>
                        </div>
                      </div>
                    </div>
                    {!editMode && (
                      <Button onClick={() => setEditMode(true)} data-testid="edit-settings-btn" className="w-full sm:w-auto shrink-0">
                        <Edit />
                        <span className="sm:inline">Edit</span>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-4 sm:p-6">
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

                <div className="pt-4 border-t">
                  <Label className="text-sm sm:text-base flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4" />
                    Dashboard Timezone
                  </Label>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                    All dates, times, streaks, and analytics will be displayed in this timezone.
                  </p>
                  <Select 
                    value={safeSelectValue(formData.user_timezone || user.user_timezone || user.schedule?.timezone || "UTC", "UTC")} 
                    onValueChange={(value) => setFormData({...formData, user_timezone: value})}
                    disabled={!editMode}
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

              {/* Account Management Card */}
              <Card className="group hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                          <Shield className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-lg sm:text-xl">Account Management</CardTitle>
                          <CardDescription className="text-xs sm:text-sm mt-0.5">Manage your account settings, email, password, and security</CardDescription>
                        </div>
                      </div>
                    </div>
                    {!editAccountMode && (
                      <Button onClick={() => setEditAccountMode(true)} variant="outline" size="sm" className="w-full sm:w-auto shrink-0 h-11 sm:h-9 touch-manipulation">
                        <Edit />
                        <span className="sm:inline">Edit</span>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-4 sm:p-6">
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
                        className="flex-1 sm:flex-initial sm:min-w-[120px] h-11 sm:h-9 touch-manipulation"
                      >
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </DashboardLayout>
    </>
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
      showNotification({ type: 'error', message: "Please fill in all required fields", title: "Validation Error" });
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
  // Update page metadata
  useEffect(() => {
    updatePageMetadata(ROUTES.ADMIN);
  }, []);
  
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
  const [unifiedLogs, setUnifiedLogs] = useState([]);
  const [unifiedLogsLoading, setUnifiedLogsLoading] = useState(false);
  const [unifiedLogsPage, setUnifiedLogsPage] = useState(1);
  const [unifiedLogsTotal, setUnifiedLogsTotal] = useState(0);
  const [unifiedLogsType, setUnifiedLogsType] = useState("all"); // all, activity, system, api
  const [unifiedLogsSearch, setUnifiedLogsSearch] = useState("");
  const [unifiedLogsStartDate, setUnifiedLogsStartDate] = useState("");
  const [unifiedLogsEndDate, setUnifiedLogsEndDate] = useState("");
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
      showNotification({ type: 'error', message: "Authentication failed", title: "Error" });
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
        showNotification({ type: 'error', message: "Unexpected response format from server", title: "Error" });
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
      showNotification({ type: 'success', message: "Achievement Created!", title: "Success" });
      toast.success("Achievement Created!", {
        description: "New achievement added! Users can now unlock this milestone!",
        duration: 4000,
      });
      
      setTimeout(() => {
        showNotification({ type: 'success', message: "Exciting!", title: "Success" });
        toast.success("Exciting!", {
          description: "This achievement will motivate users to reach new heights!",
          duration: 3000,
        });
      }, 600);
      
      setTimeout(() => {
        showNotification({ type: 'success', message: "Users Will Love This!", title: "Success" });
        toast.success("Users Will Love This!", {
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
      showNotification({ type: 'success', message: "Achievement Updated!", title: "Success" });
      toast.success("Achievement Updated!", {
        description: "The achievement has been updated successfully!",
        duration: 3000,
      });
      
      setTimeout(() => {
        showNotification({ type: 'success', message: "Changes Saved!", title: "Success" });
        toast.success("Changes Saved!", {
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
        showNotification({ type: 'success', message: "Achievement has been deleted", title: "Achievement Deleted" });
        toast.success("Achievement Deleted", {
          description: "The achievement has been permanently removed from the system.",
          duration: 3000,
        });
      } else {
        toast.success("⏸️ Achievement Deactivated", {
          description: "The achievement has been deactivated. Users won't see it anymore.",
          duration: 3000,
        });
        
        setTimeout(() => {
          showNotification({ type: 'info', message: "Tip", title: "Info" });
          toast.info("Tip", {
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
        showNotification({ type: 'success', message: "Achievement Assigned!", title: "Success" });
        toast.success("Achievement Assigned!", {
          description: "The user has been awarded this achievement!",
          duration: 3000,
        });
        
        setTimeout(() => {
          showNotification({ type: 'success', message: "They'll Love It!", title: "Success" });
          toast.success("They'll Love It!", {
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

  const fetchUnifiedLogs = async (page = 1, reset = false) => {
    try {
      setUnifiedLogsLoading(true);
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` };
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "100",
        log_type: unifiedLogsType,
      });
      
      if (unifiedLogsSearch) {
        params.append("search", unifiedLogsSearch);
      }
      if (unifiedLogsStartDate) {
        params.append("start_date", unifiedLogsStartDate);
      }
      if (unifiedLogsEndDate) {
        params.append("end_date", unifiedLogsEndDate);
      }
      if (logFilterEmail) {
        params.append("user_email", logFilterEmail);
      }
      
      const response = await axios.get(`${API}/admin/logs/unified?${params.toString()}`, { headers });
      
      if (reset) {
        setUnifiedLogs(response.data.logs);
      } else {
        setUnifiedLogs([...unifiedLogs, ...response.data.logs]);
      }
      
      setUnifiedLogsTotal(response.data.total);
      setUnifiedLogsPage(response.data.page);
    } catch (error) {
      console.error("Failed to fetch unified logs:", error);
      toast.error("Failed to load logs");
    } finally {
      setUnifiedLogsLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchUnifiedLogs(1, true);
    }
  }, [authenticated, unifiedLogsType, unifiedLogsSearch, unifiedLogsStartDate, unifiedLogsEndDate, logFilterEmail]);

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-foreground" />
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
            <p className="text-muted-foreground text-sm sm:text-base">Monitor Tend</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={handleRefresh} disabled={loading} className="w-full sm:w-auto">
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto">
              <LogOut />
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
              <div className="flex items-center gap-2 text-foreground">
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
                <p className="text-3xl font-bold text-foreground">{stats.avg_streak}</p>
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
                <p className="text-3xl font-bold text-foreground">{stats.avg_rating}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total_feedback} feedbacks
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <TabGroup defaultValue="realtime" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
            <TabList className="inline-flex w-full min-w-max sm:min-w-0 gap-1 sm:gap-0 sm:grid sm:grid-cols-12">
              <Tab value="realtime" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Live</span>
                <span className="sm:hidden">Live</span>
              </Tab>
              <Tab value="users" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Users ({users.length})</span>
                <span className="sm:hidden">Users</span>
              </Tab>
              <Tab value="email-history" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Email History</span>
                <span className="sm:hidden">Emails</span>
              </Tab>
              <Tab value="logs" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Logs ({logs.length})</span>
                <span className="sm:hidden">Logs</span>
              </Tab>
              <Tab value="feedback" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Feedback ({feedbacks.length})</span>
                <span className="sm:hidden">Feedback</span>
              </Tab>
              <Tab value="events" className="flex-shrink-0 text-xs sm:text-sm">Events</Tab>
              <Tab value="errors" className="flex-shrink-0 text-xs sm:text-sm">
                <span className="hidden sm:inline">Errors {errors?.total > 0 && `(${errors.total})`}</span>
                <span className="sm:hidden">Errors</span>
              </Tab>
              <Tab value="scheduler" className="flex-shrink-0 text-xs sm:text-sm">Scheduler</Tab>
              <Tab value="database" className="flex-shrink-0 text-xs sm:text-sm">Database</Tab>
              <Tab value="trends" className="flex-shrink-0 text-xs sm:text-sm">Trends</Tab>
              <Tab value="search" className="flex-shrink-0 text-xs sm:text-sm">Search</Tab>
              <Tab value="broadcast" className="flex-shrink-0 text-xs sm:text-sm">Broadcast</Tab>
              <Tab value="achievements" className="flex-shrink-0 text-xs sm:text-sm">Achievements</Tab>
            </TabList>
          </div>
          
          <TabPanels>
            <TabPanel value="realtime">
            <RealTimeAnalytics adminToken={sessionStorage.getItem('adminToken')} />
            </TabPanel>

            <TabPanel value="email-history">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                    <CardTitle className="text-lg sm:text-xl">All Email Send History</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={fetchAllMessageHistory} className="flex-1 sm:flex-none">
                        <RefreshCw />
                        Refresh
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExportData('messages')} className="flex-1 sm:flex-none">
                        <Download />
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
                      <Filter />
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
                                      <Badge className="bg-foreground text-background">Backup</Badge>
                                    )}
                                    {msg.rating && (
                                      <div className="flex">
                                        {[...Array(5)].map((_, i) => (
                                          <Star
                                            key={i}
                                            className={`h-3 w-3 ${
                                              i < msg.rating
                                                ? 'fill-foreground text-foreground'
                                                : 'text-gray-300'
                                            }`}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs sm:text-sm text-gray-700 line-clamp-3 mb-2">{msg.message}</p>
                                  {msg.feedback_text && (
                                    <div className="mt-2 p-2 bg-muted rounded border border-border">
                                      <p className="text-xs text-foreground font-medium mb-1">User Feedback:</p>
                                      <p className="text-xs text-foreground">{msg.feedback_text}</p>
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
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Sent</p>
                        <p className="text-2xl font-bold text-foreground">{emailStats.summary?.total_sent || 0}</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Successful</p>
                        <p className="text-2xl font-bold text-foreground">{emailStats.summary?.successful || 0}</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Failed</p>
                        <p className="text-2xl font-bold text-foreground">{emailStats.summary?.failed || 0}</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Success Rate</p>
                        <p className="text-2xl font-bold text-foreground">{emailStats.summary?.success_rate || 0}%</p>
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
                                <Badge className="bg-foreground text-background">{user.success_count || 0} ✓</Badge>
                                <Badge className="bg-foreground text-background">{user.failed_count || 0} ✗</Badge>
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
            </TabPanel>

            <TabPanel value="users">
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
                    const cardStatusColor = schedule.paused ? "bg-muted-foreground" : user.active ? "bg-foreground" : "bg-muted";
                    
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
                                <Flame className="h-3 w-3" /> Streak: <span className="font-semibold text-foreground">{user.streak_count || 0} days</span> • 
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
                              <Eye />
                              Details
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleSendTestEmail(user.email)}
                              className="flex-1 sm:flex-none text-xs sm:text-sm"
                            >
                              <Mail />
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
            </TabPanel>

            <TabPanel value="logs">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg sm:text-xl">Comprehensive Logs Viewer</CardTitle>
                      <CardDescription className="mt-1">
                        View all activity logs, system events, and API analytics in one place
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchUnifiedLogs(1, true)}>
                      <RefreshCw className={unifiedLogsLoading ? 'animate-spin' : ''} />
                      Refresh
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Input
                      placeholder="Search logs..."
                      value={unifiedLogsSearch}
                      onChange={(e) => setUnifiedLogsSearch(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && fetchUnifiedLogs(1, true)}
                      className="flex-1 min-w-[200px]"
                    />
                    <Input
                      type="email"
                      placeholder="Filter by email..."
                      value={logFilterEmail}
                      onChange={(e) => setLogFilterEmail(e.target.value)}
                      className="max-w-xs"
                    />
                    <Select value={unifiedLogsType} onValueChange={setUnifiedLogsType}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="activity">Activity</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      placeholder="Start date"
                      value={unifiedLogsStartDate}
                      onChange={(e) => setUnifiedLogsStartDate(e.target.value)}
                      className="max-w-xs"
                    />
                    <Input
                      type="date"
                      placeholder="End date"
                      value={unifiedLogsEndDate}
                      onChange={(e) => setUnifiedLogsEndDate(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setUnifiedLogsSearch("");
                        setLogFilterEmail("");
                        setUnifiedLogsStartDate("");
                        setUnifiedLogsEndDate("");
                        setUnifiedLogsType("all");
                        fetchUnifiedLogs(1, true);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  
                  <div className="mt-2 text-sm text-muted-foreground">
                    Showing {unifiedLogs.length} of {unifiedLogsTotal} logs
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {unifiedLogsLoading && unifiedLogs.length === 0 ? (
                      <div className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">Loading logs...</p>
                      </div>
                    ) : unifiedLogs.length > 0 ? (
                      <>
                        {unifiedLogs.map((log, index) => {
                          const logType = log.log_type || 'unknown';
                          const timestamp = log.timestamp || log.display_time;
                          const isError = log.status === 'error' || log.status === 'failed' || (log.status_code && log.status_code >= 400);
                          
                          return (
                            <Card key={`${log.id || log.log_type}-${index}`} className={`hover:bg-slate-50 transition ${isError ? 'border-border bg-muted/30' : ''}`}>
                              <CardContent className="p-3 sm:p-4">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      <Badge variant={logType === 'activity' ? 'default' : logType === 'system' ? 'secondary' : 'outline'}>
                                        {logType.toUpperCase()}
                                      </Badge>
                                      
                                      {log.action_type && (
                                        <Badge variant="outline">{log.action_type}</Badge>
                                      )}
                                      {log.event_type && (
                                        <Badge variant="outline">{log.event_type}</Badge>
                                      )}
                                      {log.endpoint && (
                                        <Badge variant="outline" className="font-mono text-xs">
                                          {log.method} {log.endpoint}
                                        </Badge>
                                      )}
                                      
                                      {log.status && (
                                        <Badge className={log.status === 'success' ? 'bg-foreground text-background' : log.status === 'error' || log.status === 'failed' ? 'bg-foreground text-background' : 'bg-muted-foreground text-background'}>
                                          {log.status}
                                        </Badge>
                                      )}
                                      {log.status_code && (
                                        <Badge className={log.status_code >= 400 ? 'bg-foreground text-background' : log.status_code >= 300 ? 'bg-muted-foreground text-background' : 'bg-foreground text-background'}>
                                          {log.status_code}
                                        </Badge>
                                      )}
                                      
                                      {log.response_time_ms && (
                                        <Badge variant="outline" className={log.response_time_ms > 1000 ? 'text-foreground' : log.response_time_ms > 500 ? 'text-muted-foreground' : ''}>
                                          {log.response_time_ms}ms
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {log.user_email && (
                                      <p className="text-sm font-medium mb-1">{log.user_email}</p>
                                    )}
                                    
                                    {log.action_category && (
                                      <p className="text-xs text-muted-foreground mb-1">Category: {log.action_category}</p>
                                    )}
                                    {log.event_category && (
                                      <p className="text-xs text-muted-foreground mb-1">Category: {log.event_category}</p>
                                    )}
                                    
                                    {log.details && Object.keys(log.details).length > 0 && (
                                      <div className="mt-2 p-2 bg-slate-100 rounded text-xs font-mono overflow-x-auto">
                                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2).substring(0, 300)}</pre>
                                      </div>
                                    )}
                                    
                                    {log.error_message && (
                                      <div className="mt-2 p-2 bg-muted border border-border rounded text-xs text-foreground">
                                        <strong>Error:</strong> {log.error_message}
                                      </div>
                                    )}
                                    
                                    {log.duration_ms && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Duration: {log.duration_ms}ms
                                      </p>
                                    )}
                                  </div>
                                  
                                  <div className="text-left sm:text-right sm:ml-4 flex-shrink-0">
                                    <span className="text-xs text-muted-foreground block">
                                      {timestamp ? formatDateTimeForTimezone(timestamp, ADMIN_TIMEZONE, { includeZone: true }) : 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                        
                        {unifiedLogsPage < Math.ceil(unifiedLogsTotal / 100) && (
                          <div className="text-center pt-4">
                            <Button 
                              variant="outline" 
                              onClick={() => fetchUnifiedLogs(unifiedLogsPage + 1, false)}
                              disabled={unifiedLogsLoading}
                            >
                              {unifiedLogsLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                <>
                                  Load More ({unifiedLogsTotal - unifiedLogs.length} remaining)
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No logs found</p>
                        <Button onClick={() => fetchUnifiedLogs(1, true)}>Refresh</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* Email Logs (Legacy) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Email Send Logs</CardTitle>
                  <CardDescription>Email delivery status logs</CardDescription>
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
                                log.status === 'success' ? 'bg-muted text-foreground' : 'bg-muted text-foreground'
                              }`}>
                                {log.status}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{log.subject}</p>
                            {log.error_message && (
                              <p className="text-xs text-foreground mt-1">Error: {log.error_message}</p>
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
                      <p className="text-center text-muted-foreground py-8">No email logs found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            </TabPanel>

            <TabPanel value="events">
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
                          <Badge className={event.status === 'success' ? 'bg-foreground text-background' : 'bg-foreground text-background'}>
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
            </TabPanel>

            <TabPanel value="errors">
            <div className="grid gap-6">
              {errors && (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-foreground" />
                        <CardTitle>System Errors ({errors.system_errors?.length || 0})</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {errors.system_errors?.slice(0, 20).map((error) => (
                          <div key={error.id} className="p-3 border rounded-lg bg-muted">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <Badge className="bg-foreground text-background mb-2">{error.event_type}</Badge>
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
                          <div key={error.id} className="p-3 border rounded-lg bg-muted">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-foreground text-background">{error.status_code}</Badge>
                                  <span className="font-medium text-sm">{error.endpoint}</span>
                                </div>
                                {error.error_message && (
                                  <p className="text-xs text-foreground">{error.error_message}</p>
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
            </TabPanel>

            <TabPanel value="feedback">
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
            </TabPanel>

            <TabPanel value="analytics">
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
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Active Users</p>
                        <p className="text-2xl font-bold text-foreground">{stats?.active_users || 0}</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Inactive Users</p>
                        <p className="text-2xl font-bold text-foreground">{stats?.inactive_users || 0}</p>
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
            </TabPanel>

            <TabPanel value="scheduler">
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
            </TabPanel>

            <TabPanel value="database">
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
                          <p className="text-2xl font-bold text-foreground">{dbHealth.recent_activity?.errors_24h || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
            </TabPanel>

            <TabPanel value="trends">
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
                              <Badge className="bg-foreground text-background">{item.success || 0}</Badge>
                              <Badge className="bg-foreground text-background">{item.failed || 0}</Badge>
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
            </TabPanel>

            <TabPanel value="search">
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
            </TabPanel>

            <TabPanel value="broadcast">
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
            </TabPanel>

            <TabPanel value="achievements" className="space-y-6">
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
            </TabPanel>
          </TabPanels>
        </TabGroup>

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
  const currentRoute = getCurrentRoute();
  
  // Update page metadata based on current route
  useEffect(() => {
    updatePageMetadata(currentRoute);
  }, [currentRoute]);
  
  if (window.location.pathname === ROUTES.ADMIN.path) {
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

  const syncClerkUserToDatabase = useCallback(async () => {
    if (!user || !email) {
      return;
    }

    try {
      // Sync Clerk user data to database
      await axios.post(`${API}/auth/clerk-sync`, {
        clerk_user_id: user.id,
        email: email,
        first_name: user.firstName,
        last_name: user.lastName,
        image_url: user.imageUrl,
      });
      
      // User synced successfully (logged in development only)
      if (process.env.NODE_ENV === 'development') {
        console.log(`Synced Clerk user to database: ${email}`);
      }
    } catch (error) {
      console.error("Failed to sync Clerk user:", error);
      // Don't show error to user - this is background sync
    }
  }, [user, email]);

  const loadUserProfile = useCallback(async () => {
    if (!email) {
      return;
    }

    setLoading(true);
    setNeedsOnboarding(false);
    setLoadError(false);

    try {
      // First, sync Clerk user data to database
      await syncClerkUserToDatabase();
      
      // Then load user profile
      const response = await axios.get(`${API}/users/${email}`);
      const userData = response.data;
      
      // Check if user needs onboarding:
      // - User is not active (created but onboarding not completed)
      // - User doesn't have goals or schedule set up
      const needsOnboardingCheck = !userData.active || 
                                   !userData.goals || 
                                   !userData.schedule || 
                                   !userData.personalities || 
                                   userData.personalities.length === 0;
      
      if (needsOnboardingCheck) {
        setNeedsOnboarding(true);
        setAppUser(null);
      } else {
        setAppUser(userData);
        setNeedsOnboarding(false);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        // User doesn't exist yet - will be created by sync, show onboarding
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
  }, [email, syncClerkUserToDatabase]);

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
        We couldn't load your Tend account data. Please try again in a moment.
      </p>
      <Button onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

function App() {
  // Check if user is accessing admin route - bypass Clerk auth for admin
  if (window.location.pathname === ROUTES.ADMIN.path) {
    return (
      <ErrorBoundary>
        <div className="App">
          <Toaster position="top-center" />
          {/* <NotificationList /> - Moved to layouts */}
          <NetworkStatus />
          <BackendConnectionStatus />
          <AdminDashboard />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="App">
        <Toaster position="top-center" />
        {/* <NotificationList /> - Moved to layouts for better positioning */}
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
import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { CheckCircle, Mail, Sparkles, Clock, User, LogOut, Send, Edit, Shield, BarChart3, Users, MailCheck, History, TrendingUp, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MessageHistory } from "@/components/MessageHistory";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { PersonalityManager } from "@/components/PersonalityManager";
import { ScheduleManager } from "@/components/ScheduleManager";
import { StreakCalendar } from "@/components/StreakCalendar";
import { TIMEZONES } from "@/utils/timezones";

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

function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    // Check for magic link token in URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const emailParam = params.get('email');
    
    if (token && emailParam) {
      verifyToken(emailParam, token);
    }
  }, []);

  const verifyToken = async (email, token) => {
    try {
      const response = await axios.post(`${API}/auth/verify`, { email, token });
      
      if (response.data.user_exists) {
        onLoginSuccess(response.data.user, true);
      } else {
        onLoginSuccess({ email }, false);
      }
      
      // Clean URL
      window.history.replaceState({}, document.title, "/");
    } catch (error) {
      toast.error("Invalid or expired login link");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    
    setLoading(true);
    
    try {
      // Show immediate feedback
      toast.info("Sending magic link...", { duration: 2000 });
      
      const response = await axios.post(`${API}/auth/login`, { email });
      setEmailSent(true);
      toast.success("Magic link sent! Check your inbox 📧");
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error.response?.data?.detail || "Failed to send login link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-12 pb-8">
            <div className="flex justify-center mb-6">
              <div className="h-20 w-20 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center">
                <MailCheck className="h-10 w-10 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-4">Check Your Email</h2>
            <p className="text-muted-foreground mb-6">
              We've sent a login link to <span className="font-semibold">{email}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Click the link in your email to access your account
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Mail className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl">InboxInspire</CardTitle>
          <CardDescription>Get personalized motivation in your inbox</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="login-email">Email Address</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2"
                data-testid="login-email-input"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="login-btn">
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Sending...
                </>
              ) : (
                "Send Login Link"
              )}
            </Button>
          </form>
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
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
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
    toast.success("Personality added! Add more or continue.");
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

      toast.success("Welcome to InboxInspire!");
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
                    {formData.personalities.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="font-medium">{p.value}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormData({
                            ...formData,
                            personalities: formData.personalities.filter((_, idx) => idx !== i)
                          })}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
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
                      value={formData.currentPersonality.value} 
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
                      value={formData.currentPersonality.value} 
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
                <Select value={formData.frequency} onValueChange={(value) => setFormData({...formData, frequency: value})}>
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
                  value={formData.timezone} 
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
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name,
    goals: user.goals,
    frequency: user.schedule.frequency,
    time: user.schedule.times ? user.schedule.times[0] : (user.schedule.time || "09:00"),
    active: user.active
  });
  const [previewMessage, setPreviewMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const updates = {
        name: formData.name,
        goals: formData.goals,
        schedule: {
          ...user.schedule,
          frequency: formData.frequency,
          times: [formData.time]
        },
        active: formData.active
      };

      const response = await axios.put(`${API}/users/${user.email}`, updates);
      onUserUpdate(response.data);
      setEditMode(false);
      toast.success("Settings updated!");
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
      toast.success("Preview generated!");
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
      toast.success("Motivation sent to your inbox!");
    } catch (error) {
      toast.error("Failed to send email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Welcome back, {user.name}!</h1>
            <p className="text-muted-foreground mt-1">{user.email}</p>
          </div>
          <Button variant="outline" onClick={onLogout} data-testid="logout-btn">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="analytics-tab">
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="history-tab">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${user.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-2xl font-bold">{user.active ? 'Active' : 'Paused'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Frequency</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold capitalize">{user.schedule.frequency}</p>
                  <p className="text-sm text-muted-foreground">at {user.schedule.times ? user.schedule.times[0] : user.schedule.time || "09:00"}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Personalities</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">{user.personalities?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">active</p>
                </CardContent>
              </Card>
            </div>

            {/* Current Goals */}
            <Card>
              <CardHeader>
                <CardTitle>Your Current Goals</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{user.goals}</p>
              </CardContent>
            </Card>

            {/* Preview & Send */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Preview Your Next Message</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleGeneratePreview} disabled={loading}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Preview
                    </Button>
                    <Button size="sm" onClick={handleSendNow} disabled={loading} data-testid="send-now-btn">
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
            <StreakCalendar 
              streakCount={user.streak_count || 0}
              totalMessages={user.total_messages_received || 0}
              lastEmailSent={user.last_email_sent}
            />
            <AnalyticsDashboard email={user.email} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <MessageHistory email={user.email} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <PersonalityManager user={user} onUpdate={onUserUpdate} />
            <ScheduleManager user={user} onUpdate={onUserUpdate} />
            
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>Update your name and goals</CardDescription>
                  </div>
                  {!editMode && (
                    <Button onClick={() => setEditMode(true)} data-testid="edit-settings-btn">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    disabled={!editMode}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Goals</Label>
                  <Textarea
                    value={formData.goals}
                    onChange={(e) => setFormData({...formData, goals: e.target.value})}
                    disabled={!editMode}
                    className="mt-2 min-h-32"
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive motivational emails</p>
                  </div>
                  <Switch
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                    disabled={!editMode}
                  />
                </div>

                {editMode && (
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" onClick={() => setEditMode(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={handleUpdate} disabled={loading} className="flex-1" data-testid="save-settings-btn">
                      {loading ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [adminToken, setAdminToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState("all"); // all, active, inactive

  const fetchAdminData = async (token) => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, usersRes, logsRes, feedbackRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/users`, { headers }),
        axios.get(`${API}/admin/email-logs?limit=100`, { headers }),
        axios.get(`${API}/admin/feedback?limit=100`, { headers })
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data.users);
      setLogs(logsRes.data.logs);
      setFeedbacks(feedbackRes.data.feedbacks);
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

  // Filter users based on search and status
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterActive === "all" || 
                         (filterActive === "active" && user.active) ||
                         (filterActive === "inactive" && !user.active);
    return matchesSearch && matchesFilter;
  });

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
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Monitor InboxInspire</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="logs">Email Logs</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <CardTitle>All Users</CardTitle>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-xs"
                    />
                    <select
                      value={filterActive}
                      onChange={(e) => setFilterActive(e.target.value)}
                      className="px-3 py-2 border rounded-md"
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredUsers.map((user) => {
                    const personalities = user.personalities || [];
                    const schedule = user.schedule || {};
                    
                    return (
                      <div key={user.id} className="p-4 border rounded-lg hover:bg-slate-50 transition">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{user.name}</p>
                              <div className={`h-2 w-2 rounded-full ${user.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                            </div>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-muted-foreground">
                                🎯 Goals: {user.goals?.substring(0, 60)}...
                              </p>
                              <p className="text-xs text-muted-foreground">
                                🎭 Personalities: {personalities.length > 0 
                                  ? personalities.map(p => p.value).join(', ') 
                                  : 'None'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                📅 Schedule: {schedule.frequency || 'Not set'} at {schedule.times?.[0] || 'N/A'} ({schedule.timezone || 'UTC'})
                              </p>
                              <p className="text-xs text-muted-foreground">
                                🔥 Streak: {user.streak_count || 0} days • 
                                📧 Messages: {user.total_messages_received || 0}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 ml-4">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleSendTestEmail(user.email)}
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              Send Now
                            </Button>
                            <Button 
                              size="sm" 
                              variant={user.active ? "destructive" : "default"}
                              onClick={() => handleToggleUserStatus(user.email, user.active)}
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
                <CardTitle>Recent Email Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {logs.map((log) => (
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
                        {new Date(log.sent_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No logs found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>User Feedback</CardTitle>
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
                          {feedback.comment && (
                            <p className="text-sm text-muted-foreground">{feedback.comment}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(feedback.created_at).toLocaleString()}
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
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Total Messages Delivered</span>
                        <span className="text-2xl font-bold">{stats?.total_messages || 0}</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full">
                        <div 
                          className="h-2 bg-indigo-500 rounded-full" 
                          style={{ width: '75%' }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">User Engagement Rate</span>
                        <span className="text-2xl font-bold">{stats?.engagement_rate || 0}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full">
                        <div 
                          className="h-2 bg-green-500 rounded-full" 
                          style={{ width: `${stats?.engagement_rate || 0}%` }}
                        />
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
                            <div className="flex items-center gap-2">
                              <div className="w-32 h-2 bg-slate-200 rounded-full">
                                <div 
                                  className="h-2 bg-indigo-500 rounded-full" 
                                  style={{ width: `${(count / users.length) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-8">{count}</span>
                            </div>
                          </div>
                        ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = useState("login"); // login, onboarding, dashboard, admin
  const [user, setUser] = useState(null);

  // Check for admin route
  useEffect(() => {
    if (window.location.pathname === "/admin") {
      setView("admin");
    }
  }, []);

  const handleLoginSuccess = (userData, userExists) => {
    if (userExists) {
      setUser(userData);
      setView("dashboard");
    } else {
      setUser({ email: userData.email });
      setView("onboarding");
    }
  };

  const handleOnboardingComplete = (userData) => {
    setUser(userData);
    setView("dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    setView("login");
  };

  const handleUserUpdate = (updatedUser) => {
    setUser(updatedUser);
  };

  return (
    <div className="App">
      <Toaster position="top-center" />
      
      {view === "admin" && <AdminDashboard />}
      {view === "login" && <LoginScreen onLoginSuccess={handleLoginSuccess} />}
      {view === "onboarding" && <OnboardingScreen email={user?.email} onComplete={handleOnboardingComplete} />}
      {view === "dashboard" && <DashboardScreen user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
    </div>
  );
}

export default App;
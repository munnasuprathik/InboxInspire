import { useState, useEffect, useCallback } from "react";
import React from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, Edit, Trash2, Clock, Calendar, X, History, 
  Target, Zap, Mail, Settings, Play, Pause, Sparkles, Timer, Info, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { TIMEZONES } from "@/utils/timezones";
import { formatDateTimeForTimezone } from "@/utils/timezoneFormatting";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WEEKDAYS = [
  { value: 0, label: "Monday", short: "Mon" },
  { value: 1, label: "Tuesday", short: "Tue" },
  { value: 2, label: "Wednesday", short: "Wed" },
  { value: 3, label: "Thursday", short: "Thu" },
  { value: 4, label: "Friday", short: "Fri" },
  { value: 5, label: "Saturday", short: "Sat" },
  { value: 6, label: "Sunday", short: "Sun" }
];

export function GoalsManager({ user, onUpdate }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [tones, setTones] = useState([]);
  const [selectedGoalHistory, setSelectedGoalHistory] = useState(null);
  const [goalHistory, setGoalHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  
  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    mode: "personality",
    personality_id: "",
    tone: "",
    custom_text: "",
    schedules: [{ type: "daily", time: "09:00", timezone: "UTC", active: true }],
    send_limit_per_day: null,
    send_time_windows: [],
    active: true
  });

  const fetchGoals = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/users/${user.email}/goals`);
      setGoals(response.data.goals || []);
    } catch (error) {
      console.error("Failed to fetch goals:", error);
      toast.error("Failed to load goals");
    }
  }, [user.email]);

  // Get all goals including main goal (user.goals)
  const getAllGoals = () => {
    const allGoals = [...goals];
    // Add main goal if it exists
    if (user.goals && typeof user.goals === 'string' && user.goals.trim()) {
      // Parse title and description from goals string
      // Format: "Title\nDescription" or just "Title"
      const goalsLines = user.goals.split('\n');
      const title = goalsLines[0]?.trim() || 'My Main Goal';
      const description = goalsLines.slice(1).join('\n').trim() || title; // If no description, use title as fallback
      
      allGoals.unshift({
        id: 'main_goal',
        title: title,
        description: description,
        isMainGoal: true,
        active: true,
        schedules: user.schedule ? [{
          type: user.schedule.frequency || 'daily',
          time: user.schedule.times?.[0] || user.schedule.time || '09:00',
          timezone: user.schedule.timezone || 'UTC',
          active: !user.schedule.paused
        }] : [],
        mode: 'personality',
        personality_id: user.personalities?.[user.current_personality_index || 0]?.id || user.personalities?.[user.current_personality_index || 0]?.value || ''
      });
    }
    return allGoals;
  };

  // Get counts including main goal
  const getGoalCounts = () => {
    const allGoals = getAllGoals();
    const totalGoals = allGoals.length;
    const activeGoals = allGoals.filter(g => g.active !== false).length;
    const upcomingSends = allGoals.reduce((sum, goal) => {
      if (goal.next_sends) {
        return sum + goal.next_sends.length;
      }
      // For main goal, estimate based on schedule
      if (goal.isMainGoal && goal.active) {
        return sum + 1; // At least one upcoming
      }
      return sum;
    }, 0);
    return { totalGoals, activeGoals, upcomingSends };
  };

  const fetchTones = useCallback(async () => {
    try {
      const tonesRes = await axios.get(`${API}/tone-options`);
      const tonesList = tonesRes.data?.tones || [];
      setTones(tonesList);
      if (tonesList.length === 0) {
        console.warn("No tones received from API");
      }
    } catch (error) {
      console.error("Failed to fetch tones:", error);
      // Set empty array on error to prevent issues
      setTones([]);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    fetchTones();
  }, [fetchGoals, fetchTones]);

  // Refresh personalities and tones when user changes
  useEffect(() => {
    if (user && user.personalities) {
      // Ensure personalities are available
      if (user.personalities.length === 0) {
        console.warn("No personalities found for user");
      } else {
        console.log("Personalities available:", user.personalities.length, user.personalities);
      }
    }
    fetchTones(); // Refresh tones when user changes
  }, [user, fetchTones]);

  const handleOpenModal = (goal = null) => {
    if (goal) {
      setEditingGoal(goal);
      // Get personality ID or value - ensure it matches what's in the dropdown
      let personalityId = goal.personality_id || "";
      
      // For main goal, get personality from user's current_personality_index
      if ((goal.isMainGoal || goal.id === 'main_goal') && user.personalities && user.personalities.length > 0) {
        const currentIndex = user.current_personality_index || 0;
        const currentPersonality = user.personalities[currentIndex];
        if (currentPersonality) {
          personalityId = currentPersonality.id || currentPersonality.value || "";
        }
      }
      
      if (!personalityId && user.personalities && user.personalities.length > 0) {
        // Use ID if available, otherwise use value
        const firstPersonality = user.personalities[0];
        personalityId = firstPersonality.id || firstPersonality.value || "";
      }
      
      // For main goal, parse description from user.goals if not already set
      let description = goal.description || "";
      if ((goal.isMainGoal || goal.id === 'main_goal') && user.goals && typeof user.goals === 'string') {
        const goalsLines = user.goals.split('\n');
        if (goalsLines.length > 1) {
          description = goalsLines.slice(1).join('\n').trim();
        }
      }
      
      // For main goal, get schedule from user.schedule
      let schedules = goal.schedules || [];
      if ((goal.isMainGoal || goal.id === 'main_goal') && user.schedule) {
        schedules = [{
          type: user.schedule.frequency || 'daily',
          time: user.schedule.times?.[0] || user.schedule.time || '09:00',
          timezone: user.schedule.timezone || 'UTC',
          active: !user.schedule.paused
        }];
      }
      
      // For main goal, get send_time_windows from user.schedule
      let send_time_windows = goal.send_time_windows || [];
      if ((goal.isMainGoal || goal.id === 'main_goal') && user.schedule?.send_time_windows) {
        send_time_windows = user.schedule.send_time_windows;
      }
      
      setFormData({
        title: goal.title || "",
        description: description,
        mode: goal.mode || "personality",
        personality_id: personalityId,
        tone: goal.tone || "",
        custom_text: goal.custom_text || "",
        schedules: schedules,
        send_limit_per_day: goal.send_limit_per_day || null,
        send_time_windows: send_time_windows,
        active: goal.active !== false
      });
    } else {
      setEditingGoal(null);
      // Get the first available personality ID or value as default
      let defaultPersonalityId = "";
      if (user.personalities && user.personalities.length > 0) {
        const firstPersonality = user.personalities[0];
        defaultPersonalityId = firstPersonality.id || firstPersonality.value || "";
      }
      setFormData({
        title: "",
        description: "",
        mode: "personality",
        personality_id: defaultPersonalityId,
        tone: "",
        custom_text: "",
        schedules: [{ type: "daily", time: "09:00", timezone: user.schedule?.timezone || "UTC", active: true }],
        send_limit_per_day: null,
        send_time_windows: [],
        active: true
      });
    }
    setActiveTab("basic");
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingGoal(null);
    setActiveTab("basic");
  };

  const handleAddSchedule = () => {
    setFormData({
      ...formData,
      schedules: [
        ...formData.schedules,
        { type: "daily", time: "09:00", timezone: user.schedule?.timezone || "UTC", active: true }
      ]
    });
  };

  const handleRemoveSchedule = (index) => {
    setFormData({
      ...formData,
      schedules: formData.schedules.filter((_, i) => i !== index)
    });
  };

  const handleAddTimeWindow = () => {
    if (formData.send_time_windows.length >= 5) {
      toast.error("Maximum 5 time windows allowed");
      return;
    }
    setFormData({
      ...formData,
      send_time_windows: [
        ...formData.send_time_windows,
        { start_time: "09:00", end_time: "17:00", timezone: user.schedule?.timezone || "UTC", max_sends: 1 }
      ]
    });
  };

  const handleRemoveTimeWindow = (index) => {
    setFormData({
      ...formData,
      send_time_windows: formData.send_time_windows.filter((_, i) => i !== index)
    });
  };

  const handleUpdateTimeWindow = (index, field, value) => {
    const newWindows = [...formData.send_time_windows];
    newWindows[index] = { ...newWindows[index], [field]: value };
    setFormData({ ...formData, send_time_windows: newWindows });
  };

  const handleUpdateSchedule = (index, field, value) => {
    const newSchedules = [...formData.schedules];
    newSchedules[index] = { ...newSchedules[index], [field]: value };
    setFormData({ ...formData, schedules: newSchedules });
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.title.trim()) {
      toast.error("Title is required");
      setActiveTab("basic");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Description is required");
      setActiveTab("basic");
      return;
    }
    if (formData.schedules.length === 0) {
      toast.error("At least one schedule is required");
      setActiveTab("schedules");
      return;
    }
    if (formData.mode === "personality" && !formData.personality_id) {
      toast.error("Please select a personality");
      setActiveTab("content");
      return;
    }
    if (formData.mode === "tone" && !formData.tone) {
      toast.error("Please select a tone");
      setActiveTab("content");
      return;
    }
    if (formData.mode === "custom" && !formData.custom_text.trim()) {
      toast.error("Please provide custom text");
      setActiveTab("content");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        mode: formData.mode,
        personality_id: formData.mode === "personality" ? formData.personality_id : null,
        tone: formData.mode === "tone" ? formData.tone : null,
        custom_text: formData.mode === "custom" ? formData.custom_text.trim() : null,
        schedules: formData.schedules.map(s => ({
          type: s.type,
          time: s.time,
          timezone: s.timezone,
          weekdays: s.type === "weekly" ? (s.weekdays || [0]) : null,
          monthly_dates: s.type === "monthly" ? (s.monthly_dates || [1]) : null,
          active: s.active !== false
        })),
        send_limit_per_day: formData.send_limit_per_day || null,
        send_time_windows: formData.send_time_windows.length > 0 ? formData.send_time_windows.map(w => ({
          start_time: w.start_time,
          end_time: w.end_time,
          timezone: w.timezone,
          max_sends: w.max_sends || 1
        })) : null,
        active: formData.active
      };

      if (editingGoal) {
        // Handle primary goal update differently
        if (editingGoal.isMainGoal || editingGoal.id === 'main_goal') {
          // For primary goal, update user's goals field and schedule
          // Combine title and description for the goals field (title on first line, description on subsequent lines)
          const updatedGoals = `${formData.title.trim()}\n${formData.description.trim()}`;
          
          // Update user with goals, schedule, and active status
          const userUpdatePayload = {
            goals: updatedGoals,
            active: formData.active  // Include active status
          };
          
          // Update schedule if schedules exist
          if (formData.schedules && formData.schedules.length > 0) {
            const firstSchedule = formData.schedules[0];
            // Build schedule object with all necessary fields
            const scheduleUpdate = {
              frequency: firstSchedule.type,
              times: [firstSchedule.time],  // Use times array (not time string)
              timezone: firstSchedule.timezone || user.schedule?.timezone || 'UTC',
              paused: !firstSchedule.active
            };
            
            // Preserve existing schedule fields if they exist
            if (user.schedule) {
              // Keep existing custom fields if present
              if (user.schedule.custom_days) scheduleUpdate.custom_days = user.schedule.custom_days;
              if (user.schedule.custom_interval) scheduleUpdate.custom_interval = user.schedule.custom_interval;
              if (user.schedule.monthly_dates) scheduleUpdate.monthly_dates = user.schedule.monthly_dates;
              if (user.schedule.send_time_windows) scheduleUpdate.send_time_windows = user.schedule.send_time_windows;
            }
            
            // Add send_time_windows if provided
            if (formData.send_time_windows && formData.send_time_windows.length > 0) {
              scheduleUpdate.send_time_windows = formData.send_time_windows.map(w => ({
                start_time: w.start_time,
                end_time: w.end_time,
                timezone: w.timezone || scheduleUpdate.timezone,
                max_sends: w.max_sends || 1
              }));
            }
            
            userUpdatePayload.schedule = scheduleUpdate;
          }
          
          // Also update personality-related fields if mode is personality
          if (formData.mode === "personality" && formData.personality_id) {
            // Find the personality index
            const personalityIndex = user.personalities?.findIndex(p => 
              (p.id && p.id === formData.personality_id) || 
              (p.value && p.value === formData.personality_id) ||
              (p.name && p.name === formData.personality_id)
            );
            if (personalityIndex !== -1 && personalityIndex !== undefined) {
              userUpdatePayload.current_personality_index = personalityIndex;
            }
          }
          
          try {
            await axios.put(`${API}/users/${user.email}`, userUpdatePayload);
            toast.success("🎯 Primary Goal Updated!", {
              description: "Your main goal has been updated successfully. Keep pushing forward!",
              duration: 4000,
            });
            
            // Additional celebratory toast for active status
            if (formData.active) {
              setTimeout(() => {
                toast.success("✨ Goal Activated!", {
                  description: "Your goal is now active and you'll receive motivational emails!",
                  duration: 3000,
                });
              }, 500);
            }
            
            // Refresh user data after update
            if (onUpdate) {
              try {
                const userResponse = await axios.get(`${API}/users/${user.email}`);
                onUpdate(userResponse.data);
              } catch (error) {
                console.error("Failed to refresh user data:", error);
              }
            }
          } catch (error) {
            console.error("Failed to update primary goal:", error);
            toast.error(error.response?.data?.detail || "Failed to update primary goal");
            setLoading(false);
            return; // Exit early on error
          }
          
          // Close modal and refresh after successful main goal update
          handleCloseModal();
          fetchGoals();
          setLoading(false);
          return; // Exit early after main goal update
        } else {
          await axios.put(`${API}/users/${user.email}/goals/${editingGoal.id}`, payload);
          toast.success("🚀 Goal Updated!", {
            description: "Your goal has been updated. You're one step closer to success!",
            duration: 4000,
          });
          
          // Additional toast for active status
          if (formData.active) {
            setTimeout(() => {
              toast.success("💪 Goal Activated!", {
                description: "This goal is now active and sending you motivation!",
                duration: 3000,
              });
            }, 500);
          }
        }
      } else {
        await axios.post(`${API}/users/${user.email}/goals`, payload);
        toast.success("🎉 New Goal Created!", {
          description: "Congratulations! Your new goal has been added. Let's make it happen!",
          duration: 4000,
        });
        
        // Additional celebratory toasts
        setTimeout(() => {
          toast.success("📧 Emails Scheduled!", {
            description: "You'll start receiving motivational emails for this goal soon!",
            duration: 3000,
          });
        }, 600);
        
        if (formData.active) {
          setTimeout(() => {
            toast.success("✨ Goal is Active!", {
              description: "This goal is active and ready to motivate you daily!",
              duration: 3000,
            });
          }, 1200);
        }
      }

      handleCloseModal();
      fetchGoals();
      
      // Refresh user data and pass to onUpdate
      if (onUpdate) {
        try {
          const response = await axios.get(`${API}/users/${user.email}`);
          onUpdate(response.data);
        } catch (error) {
          console.error("Failed to refresh user data:", error);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (goalId) => {
    if (!window.confirm("Are you sure you want to delete this goal? This will cancel all pending messages.")) {
      return;
    }

    setLoading(true);
    try {
      await axios.delete(`${API}/users/${user.email}/goals/${goalId}`);
      toast.success("🗑️ Goal Deleted", {
        description: "The goal has been removed. You can always create a new one!",
        duration: 3000,
      });
      fetchGoals();
      
      // Refresh user data and pass to onUpdate
      if (onUpdate) {
        try {
          const response = await axios.get(`${API}/users/${user.email}`);
          onUpdate(response.data);
        } catch (error) {
          console.error("Failed to refresh user data:", error);
        }
      }
    } catch (error) {
      toast.error("Failed to delete goal");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (goal) => {
    setLoading(true);
    try {
      await axios.put(`${API}/users/${user.email}/goals/${goal.id}`, {
        active: !goal.active
      });
      if (!goal.active) {
        toast.success("✨ Goal Activated!", {
          description: "This goal is now active and will send you motivational emails!",
          duration: 3000,
        });
        setTimeout(() => {
          toast.success("💪 You're Ready!", {
            description: "Get ready to receive daily motivation for this goal!",
            duration: 2500,
          });
        }, 500);
      } else {
        toast.info("⏸️ Goal Paused", {
          description: "This goal has been paused. You can reactivate it anytime!",
          duration: 3000,
        });
      }
      fetchGoals();
      
      // Refresh user data and pass to onUpdate
      if (onUpdate) {
        try {
          const response = await axios.get(`${API}/users/${user.email}`);
          onUpdate(response.data);
        } catch (error) {
          console.error("Failed to refresh user data:", error);
        }
      }
    } catch (error) {
      toast.error("Failed to update goal");
    } finally {
      setLoading(false);
    }
  };

  const handleViewHistory = async (goal) => {
    setSelectedGoalHistory(goal);
    setHistoryLoading(true);
    try {
      const response = await axios.get(`${API}/users/${user.email}/goals/${goal.id}/history`);
      setGoalHistory(response.data.messages || []);
    } catch (error) {
      toast.error("Failed to load goal history");
      setGoalHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getModeLabel = (mode) => {
    switch (mode) {
      case "personality": return "Personality";
      case "tone": return "Tone";
      case "custom": return "Custom";
      default: return mode;
    }
  };

  const getModeValue = (goal) => {
    if (goal.mode === "personality") {
      // Find personality by ID or value (handle both cases)
      const personality = user.personalities?.find(p => 
        p.id === goal.personality_id || p.value === goal.personality_id || p.name === goal.personality_id
      );
      return personality?.value || personality?.name || goal.personality_id || "Unknown";
    } else if (goal.mode === "tone") {
      return goal.tone || "Unknown";
    } else {
      return goal.custom_text?.substring(0, 30) || "Custom";
    }
  };

  const counts = getGoalCounts();
  const allGoals = getAllGoals();

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Target className="h-5 w-5 flex-shrink-0" />
              Goals & Motivational Emails
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Create multiple goals with custom schedules, personalities, and time-based send limits
            </p>
          </div>
          <Dialog open={showModal} onOpenChange={setShowModal}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenModal()} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="sm:inline">Create New Goal</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto w-[95vw] sm:w-[90vw] md:w-full p-4 sm:p-6">
              <DialogHeader className="pb-3 sm:pb-4">
                <DialogTitle className="text-xl sm:text-2xl font-bold">{editingGoal ? "Edit Goal" : "Create New Goal"}</DialogTitle>
              </DialogHeader>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-1 [&>*]:min-h-[48px] sm:[&>*]:min-h-[40px] [&>*]:text-xs sm:[&>*]:text-sm [&>*]:touch-manipulation [&>*]:px-2 sm:[&>*]:px-3">
                  <TabsTrigger value="basic" className="font-medium">Basic</TabsTrigger>
                  <TabsTrigger value="content" className="font-medium">Content</TabsTrigger>
                  <TabsTrigger value="schedules" className="font-medium">Schedules</TabsTrigger>
                  <TabsTrigger value="limits" className="font-medium">Time Limits</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-5 sm:space-y-6 mt-4 sm:mt-6">
                  <div className="space-y-2">
                    <Label className="text-base sm:text-lg font-semibold">Goal Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Finish MVP, Learn Spanish"
                      className="mt-1 text-base"
                    />
                    <p className="text-xs sm:text-sm text-muted-foreground">Give your goal a clear, motivating name</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base sm:text-lg font-semibold">Description <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Additional context for personalized messages..."
                      className="mt-1 text-base"
                      rows={5}
                      required
                    />
                    <p className="text-xs sm:text-sm text-muted-foreground">Add details to help personalize your motivational messages</p>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex-1">
                      <Label className="text-base sm:text-lg font-semibold cursor-pointer">Active</Label>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Enable or disable this goal</p>
                    </div>
                    <Switch
                      checked={formData.active}
                      onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                      className="flex-shrink-0"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="content" className="space-y-5 sm:space-y-6 mt-4 sm:mt-6">
                  <div className="space-y-2">
                    <Label className="text-base sm:text-lg font-semibold">Content Mode *</Label>
                    <Select
                      value={formData.mode}
                      onValueChange={(value) => setFormData({ ...formData, mode: value, personality_id: "", tone: "", custom_text: "" })}
                      className="mt-1"
                    >
                      <SelectTrigger className="text-base">
                        <SelectValue placeholder="Select content mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personality">Personality</SelectItem>
                        <SelectItem value="tone">Tone</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs sm:text-sm text-muted-foreground">Choose how you want your messages to be generated</p>
                  </div>

                  {formData.mode === "personality" && (
                    <div className="space-y-2">
                      <Label className="text-base sm:text-lg font-semibold">Select Personality *</Label>
                      {!user.personalities || user.personalities.length === 0 ? (
                        <div className="mt-1 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm sm:text-base text-yellow-800">
                            No personalities found. Please add personalities first in the Goals section.
                          </p>
                        </div>
                      ) : (
                        <>
                          <Select
                            value={formData.personality_id || ""}
                            onValueChange={(value) => {
                              setFormData({ ...formData, personality_id: value });
                            }}
                            className="mt-1"
                          >
                            <SelectTrigger className="text-base">
                              <SelectValue placeholder="Choose a personality" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px] overflow-y-auto">
                              {user.personalities && user.personalities.length > 0 ? (
                                (() => {
                                  // Filter out any null/undefined personalities and ensure uniqueness
                                  const validPersonalities = user.personalities.filter(p => p && (p.id || p.value || p.name));
                                  const seenValues = new Set();
                                  const uniquePersonalities = validPersonalities.filter(p => {
                                    const value = p.id || p.value || p.name;
                                    if (!value || seenValues.has(value)) {
                                      return false; // Skip duplicates and empty values
                                    }
                                    seenValues.add(value);
                                    return true;
                                  });
                                  
                                  if (uniquePersonalities.length === 0) {
                                    return <SelectItem value="" disabled>No personalities available</SelectItem>;
                                  }
                                  
                                  return uniquePersonalities.map((p, index) => {
                                    // Use ID if available, otherwise use value, otherwise use name
                                    const itemValue = String(p.id || p.value || p.name || `personality_${index}`);
                                    const displayName = p.value || p.name || p.id || `Personality ${index + 1}`;
                                    // Ensure unique key - use combination of index and value (stable key)
                                    const uniqueKey = `personality-${index}-${itemValue}`;
                                    return (
                                      <SelectItem 
                                        key={uniqueKey} 
                                        value={itemValue} 
                                        className="text-base cursor-pointer hover:bg-muted"
                                      >
                                        {String(displayName)}
                                      </SelectItem>
                                    );
                                  });
                                })()
                              ) : (
                                <SelectItem value="" disabled>No personalities available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs sm:text-sm text-muted-foreground">Select a personality to write messages in their style</p>
                        </>
                      )}
                    </div>
                  )}

                  {formData.mode === "tone" && (
                    <div className="space-y-2">
                      <Label className="text-base sm:text-lg font-semibold">Select Tone *</Label>
                      {tones.length === 0 ? (
                        <div className="mt-1 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm sm:text-base text-yellow-800">
                            Loading tones...
                          </p>
                        </div>
                      ) : (
                        <>
                          <Select
                            value={formData.tone || ""}
                            onValueChange={(value) => setFormData({ ...formData, tone: value })}
                            className="mt-1"
                          >
                            <SelectTrigger className="text-base">
                              <SelectValue placeholder="Choose a tone">
                                {formData.tone || "Choose a tone"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {tones && tones.length > 0 ? (
                                tones.map((tone) => (
                                  <SelectItem key={tone} value={tone} className="text-base">
                                    {tone}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="" disabled>Loading tones...</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs sm:text-sm text-muted-foreground">Choose the emotional tone for your messages</p>
                        </>
                      )}
                    </div>
                  )}

                  {formData.mode === "custom" && (
                    <div className="space-y-2">
                      <Label className="text-base sm:text-lg font-semibold">Custom Style Guide *</Label>
                      <Textarea
                        value={formData.custom_text}
                        onChange={(e) => setFormData({ ...formData, custom_text: e.target.value })}
                        placeholder="Describe the writing style you want (e.g., 'Write like a friendly mentor, use short sentences, be encouraging but realistic')..."
                        className="mt-1 text-base"
                        rows={6}
                      />
                      <p className="text-xs sm:text-sm text-muted-foreground">Describe how you want your messages to be written</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="schedules" className="space-y-5 sm:space-y-6 mt-4 sm:mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 pb-3 border-b">
                    <div>
                      <Label className="text-base sm:text-lg font-semibold">Schedules *</Label>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Configure when emails should be sent</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddSchedule} className="w-full sm:w-auto min-w-[140px]">
                      <Plus className="h-4 w-4 sm:mr-2" />
                      <span>Add Schedule</span>
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    {formData.schedules.map((schedule, index) => (
                      <Card key={index} className="p-4 sm:p-5 border-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-4 pb-3 border-b">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary flex-shrink-0" />
                            <span className="font-semibold text-base sm:text-lg">Schedule {index + 1}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <Label className="text-sm cursor-pointer">Active</Label>
                              <Switch
                                checked={schedule.active}
                                onCheckedChange={(checked) => handleUpdateSchedule(index, "active", checked)}
                              />
                            </div>
                            {formData.schedules.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveSchedule(index)}
                                className="h-9 w-9 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs sm:text-sm">Frequency</Label>
                            <Select
                              value={schedule.type}
                              onValueChange={(value) => handleUpdateSchedule(index, "type", value)}
                            >
                              <SelectTrigger className="h-9">
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
                            <Label className="text-xs sm:text-sm">Time</Label>
                            <Input
                              type="time"
                              value={schedule.time}
                              onChange={(e) => handleUpdateSchedule(index, "time", e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs sm:text-sm">Timezone</Label>
                            <Select
                              value={schedule.timezone}
                              onValueChange={(value) => handleUpdateSchedule(index, "timezone", value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-[200px]">
                                {TIMEZONES.map((tz) => (
                                  <SelectItem key={tz.value} value={tz.value}>
                                    {tz.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {schedule.type === "weekly" && (
                          <div className="mt-4 space-y-2">
                            <Label className="text-sm sm:text-base font-medium block">Weekdays</Label>
                            <div className="flex flex-wrap gap-2">
                              {WEEKDAYS.map((day) => (
                                <Button
                                  key={day.value}
                                  type="button"
                                  variant={schedule.weekdays?.includes(day.value) ? "default" : "outline"}
                                  size="sm"
                                  className="h-10 sm:h-9 text-sm min-w-[44px] sm:min-w-0 px-3 sm:px-2 touch-manipulation"
                                  onClick={() => {
                                    const weekdays = schedule.weekdays || [];
                                    const newWeekdays = weekdays.includes(day.value)
                                      ? weekdays.filter(d => d !== day.value)
                                      : [...weekdays, day.value];
                                    handleUpdateSchedule(index, "weekdays", newWeekdays);
                                  }}
                                >
                                  {day.short}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {schedule.type === "monthly" && (
                          <div className="mt-3">
                            <Label className="text-xs sm:text-sm">Days of Month (comma-separated, 1-31)</Label>
                            <Input
                              value={schedule.monthly_dates?.join(",") || ""}
                              onChange={(e) => {
                                const dates = e.target.value
                                  .split(",")
                                  .map(d => parseInt(d.trim()))
                                  .filter(d => !isNaN(d) && d >= 1 && d <= 31);
                                handleUpdateSchedule(index, "monthly_dates", dates);
                              }}
                              placeholder="1, 15, 30"
                              className="h-9 mt-1"
                            />
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="limits" className="space-y-5 sm:space-y-6 mt-4 sm:mt-6">
                  <Alert className="bg-blue-50 border-blue-200">
                    <Info className="h-5 w-5 text-blue-600" />
                    <AlertDescription className="text-sm sm:text-base text-blue-900">
                      Configure when and how many emails can be sent. Time windows take priority over daily limits.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label className="text-base sm:text-lg font-semibold">Max Sends Per Day (Fallback)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={formData.send_limit_per_day || ""}
                      onChange={(e) => setFormData({ ...formData, send_limit_per_day: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Leave empty for no limit"
                      className="mt-1 text-base"
                    />
                    <p className="text-xs sm:text-sm text-muted-foreground">Maximum emails per day if time windows are not configured</p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 pb-3 border-b">
                      <div>
                        <Label className="text-base sm:text-lg font-semibold">Send Time Windows (Max 5)</Label>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Restrict sending to specific time periods</p>
                      </div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={handleAddTimeWindow}
                        disabled={formData.send_time_windows.length >= 5}
                        className="w-full sm:w-auto min-w-[160px]"
                      >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span>Add Time Window</span>
                      </Button>
                    </div>
                    
                    <div className="space-y-4">
                      {formData.send_time_windows.map((window, index) => (
                        <Card key={index} className="p-4 sm:p-5 border-2 border-primary/20">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-4 pb-3 border-b">
                            <div className="flex items-center gap-2">
                              <Timer className="h-5 w-5 text-primary flex-shrink-0" />
                              <span className="font-semibold text-base sm:text-lg">Window {index + 1}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveTimeWindow(index)}
                              className="h-9 w-9 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs sm:text-sm">Start Time</Label>
                              <Input
                                type="time"
                                value={window.start_time}
                                onChange={(e) => handleUpdateTimeWindow(index, "start_time", e.target.value)}
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs sm:text-sm">End Time</Label>
                              <Input
                                type="time"
                                value={window.end_time}
                                onChange={(e) => handleUpdateTimeWindow(index, "end_time", e.target.value)}
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs sm:text-sm">Timezone</Label>
                              <Select
                                value={window.timezone}
                                onValueChange={(value) => handleUpdateTimeWindow(index, "timezone", value)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                  {TIMEZONES.map((tz) => (
                                    <SelectItem key={tz.value} value={tz.value}>
                                      {tz.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs sm:text-sm">Max Sends in Window</Label>
                              <Input
                                type="number"
                                min="1"
                                max="50"
                                value={window.max_sends || 1}
                                onChange={(e) => handleUpdateTimeWindow(index, "max_sends", parseInt(e.target.value) || 1)}
                                className="h-9"
                              />
                            </div>
                          </div>
                        </Card>
                      ))}
                      
                      {formData.send_time_windows.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No time windows configured. Emails will be sent at scheduled times without time restrictions.
                        </p>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6 sm:mt-8 pt-4 border-t flex-col sm:flex-row gap-3 sm:gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleCloseModal} 
                  className="w-full sm:w-auto order-2 sm:order-1 min-h-[48px] sm:min-h-0"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={loading} 
                  className="w-full sm:w-auto order-1 sm:order-2 min-h-[48px] sm:min-h-0 font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                      <span className="sm:inline">Saving...</span>
                    </>
                  ) : editingGoal ? "Update Goal" : "Create Goal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-6">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Goals</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{counts.totalGoals}</p>
                </div>
                <Target className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">Active Goals</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{counts.activeGoals}</p>
                </div>
                <Play className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">Upcoming Sends</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{counts.upcomingSends}</p>
                </div>
                <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Goals List */}
        {allGoals.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground px-4">
            <Target className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-sm sm:text-base">No goals yet. Create your first goal to start receiving personalized motivational emails.</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {allGoals.map((goal) => {
              const isActive = goal.active;
              
              return (
                <Card key={goal.id} className={!isActive ? "opacity-60" : ""}>
                  <CardContent className="p-3 sm:p-4 md:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0 w-full sm:w-auto">
                        {/* Title and Badges - Stack on mobile */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2 sm:mb-3">
                          <h3 className="font-semibold text-base sm:text-lg leading-snug break-words overflow-wrap-anywhere flex-1 min-w-0 order-1 sm:order-none">{goal.title || "Untitled Goal"}</h3>
                          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap order-2 sm:order-none">
                            {goal.isMainGoal && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs whitespace-nowrap">
                                Primary Goal
                              </Badge>
                            )}
                            <Badge variant={isActive ? "default" : "secondary"} className="gap-1 text-xs whitespace-nowrap">
                              {isActive ? (
                                <>
                                  <Play className="h-3 w-3 flex-shrink-0" />
                                  Active
                                </>
                              ) : (
                                <>
                                  <Pause className="h-3 w-3 flex-shrink-0" />
                                  Paused
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                        {/* Description - Always show if available */}
                        {goal.description && goal.description.trim() && (
                          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed break-words overflow-wrap-anywhere mb-2 sm:mb-3 whitespace-pre-wrap">{goal.description}</p>
                        )}
                        {/* Metadata Row */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                          <Badge variant="outline" className="gap-1 text-xs min-w-0 max-w-full">
                            {goal.mode === "personality" && <Sparkles className="h-3 w-3 flex-shrink-0" />}
                            {goal.mode === "tone" && <Zap className="h-3 w-3 flex-shrink-0" />}
                            {goal.mode === "custom" && <Settings className="h-3 w-3 flex-shrink-0" />}
                            <span className="hidden sm:inline">{getModeLabel(goal.mode)}: </span>
                            <span className="truncate max-w-[120px] sm:max-w-[180px] md:max-w-none inline-block">{getModeValue(goal) || "N/A"}</span>
                          </Badge>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="whitespace-nowrap">{(goal.schedules || []).filter(s => s.active).length} active schedule{(goal.schedules || []).filter(s => s.active).length !== 1 ? 's' : ''}</span>
                          </div>
                          {goal.send_time_windows && goal.send_time_windows.length > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Timer className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="whitespace-nowrap">{goal.send_time_windows.length} time window{goal.send_time_windows.length !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                          {goal.next_sends && goal.next_sends.length > 0 && (
                            <div className="flex items-center gap-1 min-w-0 w-full sm:w-auto sm:flex-initial">
                              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate text-xs sm:text-sm">Next: {formatDateTimeForTimezone(goal.next_sends[0], goal.schedules?.[0]?.timezone || "UTC", { includeDate: true, includeTime: true })}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Action Buttons - Stack on mobile */}
                      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 justify-end sm:justify-start">
                        {!goal.isMainGoal && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewHistory(goal)}
                              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(goal)}
                              disabled={loading}
                              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                            >
                              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                        {!goal.isMainGoal && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenModal(goal)}
                              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(goal.id)}
                              disabled={loading}
                              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {goal.isMainGoal && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenModal(goal)}
                            className="h-9 w-9 sm:h-8 sm:w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Goal History Dialog */}
      <Dialog open={selectedGoalHistory !== null} onOpenChange={(open) => !open && setSelectedGoalHistory(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message History: {selectedGoalHistory?.title}</DialogTitle>
          </DialogHeader>
          
          {historyLoading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <div>Loading history...</div>
            </div>
          ) : goalHistory.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages sent yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {goalHistory.map((msg) => (
                <Card key={msg.id} className={msg.status === "sent" ? "" : "opacity-60"}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={msg.status === "sent" ? "default" : msg.status === "failed" ? "destructive" : "secondary"}>
                            {msg.status}
                          </Badge>
                          {msg.generated_subject && (
                            <span className="font-semibold text-sm">{msg.generated_subject}</span>
                          )}
                        </div>
                        {msg.generated_body && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3 bg-muted/50 p-3 rounded">
                            {msg.generated_body}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              Scheduled: {formatDateTimeForTimezone(msg.scheduled_for, selectedGoalHistory?.schedules?.[0]?.timezone || "UTC", { includeDate: true, includeTime: true })}
                            </span>
                          </div>
                          {msg.sent_at && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span>
                                Sent: {formatDateTimeForTimezone(msg.sent_at, selectedGoalHistory?.schedules?.[0]?.timezone || "UTC", { includeDate: true, includeTime: true })}
                              </span>
                            </div>
                          )}
                        </div>
                        {msg.error_message && (
                          <Alert variant="destructive" className="mt-3">
                            <X className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              {msg.error_message}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

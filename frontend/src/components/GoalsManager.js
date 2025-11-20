import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import React from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/animate-ui/components/radix/dialog";
import { Badge } from "@/components/ui/badge";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@/components/animate-ui/components/headless/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, Edit, Trash2, Clock, Calendar, X, History, 
  Target, Zap, Mail, Settings, Play, Pause, Sparkles, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { showNotification } from "@/components/animate-ui/components/community/notification-list";
import { TIMEZONES } from "@/utils/timezones";
import { formatDateTimeForTimezone } from "@/utils/timezoneFormatting";
import { cn } from "@/lib/utils";

// Use centralized API configuration
import API_CONFIG from '@/config/api';
const API = API_CONFIG.API_BASE;

const WEEKDAYS = [
  { value: 0, label: "Monday", short: "Mon" },
  { value: 1, label: "Tuesday", short: "Tue" },
  { value: 2, label: "Wednesday", short: "Wed" },
  { value: 3, label: "Thursday", short: "Thu" },
  { value: 4, label: "Friday", short: "Fri" },
  { value: 5, label: "Saturday", short: "Sat" },
  { value: 6, label: "Sunday", short: "Sun" }
];

export const GoalsManager = forwardRef(function GoalsManager({ user, onUpdate }, ref) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [tones, setTones] = useState([]);
  const [famousPersonalities, setFamousPersonalities] = useState([]);
  const [selectedGoalHistory, setSelectedGoalHistory] = useState(null);
  const [goalHistory, setGoalHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  
  // Get default schedule from user's existing schedule preferences
  const getDefaultSchedule = () => {
    if (user?.schedule) {
      const defaultTime = user.schedule.times?.[0] || user.schedule.time || "09:00";
      return [{
        type: user.schedule.frequency || "daily",
        time: defaultTime,
        times: user.schedule.times || [defaultTime],  // NEW: Always include times array
        timezone: user.schedule.timezone || "UTC",
        active: !user.schedule.paused,
        end_date: user.schedule.end_date || null
      }];
    }
    // Fallback defaults if no user schedule exists
    return [{ 
      type: "daily", 
      time: "09:00", 
      times: ["09:00"],  // NEW: Always include times array
      timezone: "UTC", 
      active: true, 
      end_date: null 
    }];
  };
  
  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    mode: "personality",
    personality_id: "",
    tone: "",
    custom_text: "",
    schedules: getDefaultSchedule(),
    active: true
  });

  const fetchGoals = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/users/${user.email}/goals`);
      setGoals(response.data.goals || []);
    } catch (error) {
      console.error("Failed to fetch goals:", error);
      showNotification({ type: 'error', message: "Failed to load goals", title: "Error" });
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
      
      const schedulePaused = user.schedule?.paused || false;
      allGoals.unshift({
        id: 'main_goal',
        title: title,
        description: description,
        isMainGoal: true,
        active: !schedulePaused, // Active if schedule is not paused
        schedules: user.schedule ? [{
          type: user.schedule.frequency || 'daily',
          time: user.schedule.times?.[0] || user.schedule.time || '09:00',
          timezone: user.schedule.timezone || 'UTC',
          active: !user.schedule.paused,
          end_date: user.schedule.end_date || null
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

  const fetchFamousPersonalities = useCallback(async () => {
    try {
      const personalitiesRes = await axios.get(`${API}/famous-personalities`);
      const personalitiesList = personalitiesRes.data?.personalities || [];
      setFamousPersonalities(personalitiesList);
      if (personalitiesList.length === 0) {
        console.warn("No personalities received from API");
      }
    } catch (error) {
      console.error("Failed to fetch famous personalities:", error);
      // Set empty array on error to prevent issues
      setFamousPersonalities([]);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    fetchTones();
    fetchFamousPersonalities();
  }, [fetchGoals, fetchTones, fetchFamousPersonalities]);

  // Refresh personalities and tones when user changes
  useEffect(() => {
    if (user && user.personalities) {
      // Ensure personalities are available
      if (user.personalities.length === 0) {
        console.warn("No personalities found for user");
      } else {
        // Personalities loaded (debug only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log("Personalities available:", user.personalities.length, user.personalities);
        }
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
          // Prefer value (name) over ID for display
          personalityId = currentPersonality.value || currentPersonality.name || currentPersonality.id || "";
        }
      }
      
      // If personalityId is a UUID, try to find the corresponding name from famousPersonalities or user.personalities
      if (personalityId && !famousPersonalities.includes(personalityId)) {
        // Check if it's a UUID (looks like one)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personalityId);
        if (isUUID) {
          // Find the personality name from user.personalities
          const foundPersonality = user.personalities?.find(p => 
            p.id === personalityId || p.value === personalityId || p.name === personalityId
          );
          if (foundPersonality) {
            personalityId = foundPersonality.value || foundPersonality.name || personalityId;
          }
        }
      }
      
      if (!personalityId && user.personalities && user.personalities.length > 0) {
        // Use value (name) if available, otherwise use ID
        const firstPersonality = user.personalities[0];
        personalityId = firstPersonality.value || firstPersonality.name || firstPersonality.id || "";
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
        const mainTime = user.schedule.times?.[0] || user.schedule.time || '09:00';
        schedules = [{
          type: user.schedule.frequency || 'daily',
          time: mainTime,
          times: user.schedule.times || [mainTime],  // NEW: Always include times array
          timezone: user.schedule.timezone || 'UTC',
          active: !user.schedule.paused,
          end_date: user.schedule.end_date || null
        }];
      }
      // Ensure all schedules have end_date field and times array
      schedules = schedules.map(s => ({
        ...s,
        end_date: s.end_date || null,
        // Ensure times array exists - use times if available, otherwise create from time
        times: s.times && s.times.length > 0 ? s.times : (s.time ? [s.time] : ["09:00"]),
        // Keep time for backward compatibility
        time: s.time || s.times?.[0] || "09:00"
      }));
      
      setFormData({
        title: goal.title || "",
        description: description,
        mode: goal.mode || "personality",
        personality_id: personalityId,
        tone: goal.tone || "",
        custom_text: goal.custom_text || "",
        schedules: schedules,
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
        schedules: getDefaultSchedule(),
        active: true
      });
    }
    setActiveTab("basic");
    setShowModal(true);
  };

  // Expose method to parent via ref
  useImperativeHandle(ref, () => ({
    openModal: (goal = null) => {
      handleOpenModal(goal);
    }
  }));

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingGoal(null);
    setActiveTab("basic");
  };

  const handleAddSchedule = () => {
      // Use user's schedule preferences for new schedule, or defaults
      const defaultSchedule = getDefaultSchedule()[0];
      setFormData({
        ...formData,
        schedules: [
          ...formData.schedules,
          { 
            type: defaultSchedule.type, 
            time: defaultSchedule.time, 
            times: defaultSchedule.times || [defaultSchedule.time || "09:00"],  // NEW: Always include times array
            timezone: defaultSchedule.timezone, 
            active: defaultSchedule.active, 
            end_date: defaultSchedule.end_date 
          }
        ]
      });
  };

  const handleRemoveSchedule = (index) => {
    setFormData({
      ...formData,
      schedules: formData.schedules.filter((_, i) => i !== index)
    });
  };


  const handleUpdateSchedule = (index, field, value) => {
    const newSchedules = [...formData.schedules];
    const updatedSchedule = { ...newSchedules[index], [field]: value };
    
    // If updating time, also update times array
    if (field === "time" && value) {
      updatedSchedule.times = [value];
    }
    
    newSchedules[index] = updatedSchedule;
    setFormData({ ...formData, schedules: newSchedules });
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.title.trim()) {
      showNotification({ type: 'error', message: "Title is required", title: "Validation Error" });
      toast.error("Title is required");
      setActiveTab("basic");
      return;
    }
    if (!formData.description.trim()) {
      showNotification({ type: 'error', message: "Description is required", title: "Validation Error" });
      toast.error("Description is required");
      setActiveTab("basic");
      return;
    }
    if (formData.schedules.length === 0) {
      showNotification({ type: 'error', message: "At least one schedule is required", title: "Validation Error" });
      toast.error("At least one schedule is required");
      setActiveTab("schedules");
      return;
    }
    if (formData.mode === "personality" && !formData.personality_id) {
      showNotification({ type: 'error', message: "Please select a personality", title: "Validation Error" });
      toast.error("Please select a personality");
      setActiveTab("content");
      return;
    }
    if (formData.mode === "tone" && !formData.tone) {
      showNotification({ type: 'error', message: "Please select a tone", title: "Validation Error" });
      toast.error("Please select a tone");
      setActiveTab("content");
      return;
    }
    if (formData.mode === "custom" && !formData.custom_text.trim()) {
      showNotification({ type: 'error', message: "Please provide custom text", title: "Validation Error" });
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
          time: s.time,  // Keep for backward compatibility
          times: s.times || [s.time || "09:00"],  // NEW: Always include times array
          timezone: s.timezone,
          weekdays: s.type === "weekly" ? (s.weekdays || [0]) : null,
          monthly_dates: s.type === "monthly" ? (s.monthly_dates || [1]) : null,
          active: s.active !== false,
          end_date: s.end_date || null
        })),
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
              paused: !firstSchedule.active,
              end_date: firstSchedule.end_date || null
            };
            
            // Preserve existing schedule fields if they exist
            if (user.schedule) {
              // Keep existing custom fields if present
              if (user.schedule.custom_days) scheduleUpdate.custom_days = user.schedule.custom_days;
              if (user.schedule.custom_interval) scheduleUpdate.custom_interval = user.schedule.custom_interval;
              if (user.schedule.monthly_dates) scheduleUpdate.monthly_dates = user.schedule.monthly_dates;
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
            showNotification({ type: 'success', message: "Your main goal has been updated successfully. Keep pushing forward!", title: "Primary Goal Updated" });
            toast.success("Primary Goal Updated!", {
              description: "Your main goal has been updated successfully. Keep pushing forward!",
              duration: 4000,
            });
            
            // Additional celebratory toast for active status
            if (formData.active) {
              setTimeout(() => {
                showNotification({ type: 'success', message: "Your goal is now active and you'll receive motivational emails!", title: "Goal Activated" });
                toast.success("Goal Activated!", {
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
            showNotification({ type: 'error', message: error.response?.data?.detail || "Failed to update primary goal", title: "Error" });
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
          showNotification({ type: 'success', message: "Your goal has been updated. You're one step closer to success!", title: "Goal Updated" });
          toast.success("Goal Updated!", {
            description: "Your goal has been updated. You're one step closer to success!",
            duration: 4000,
          });
          
          // Additional toast for active status
          if (formData.active) {
            setTimeout(() => {
              showNotification({ type: 'success', message: "This goal is now active and sending you motivation!", title: "Goal Activated" });
              toast.success("Goal Activated!", {
                description: "This goal is now active and sending you motivation!",
                duration: 3000,
              });
            }, 500);
          }
        }
      } else {
        await axios.post(`${API}/users/${user.email}/goals`, payload);
        showNotification({ type: 'success', message: "Congratulations! Your new goal has been added. Let's make it happen!", title: "New Goal Created" });
        toast.success("New Goal Created!", {
          description: "Congratulations! Your new goal has been added. Let's make it happen!",
          duration: 4000,
        });
        
        // Additional celebratory toasts
        setTimeout(() => {
          showNotification({ type: 'success', message: "You'll start receiving motivational emails for this goal soon!", title: "Emails Scheduled" });
          toast.success("Emails Scheduled!", {
            description: "You'll start receiving motivational emails for this goal soon!",
            duration: 3000,
          });
        }, 600);
        
        if (formData.active) {
          setTimeout(() => {
            showNotification({ type: 'success', message: "This goal is now active and sending you motivation!", title: "Goal is Active" });
            toast.success("Goal is Active!", {
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
      showNotification({ type: 'error', message: error.response?.data?.detail || "Failed to save goal", title: "Error" });
      toast.error(error.response?.data?.detail || "Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (goalId) => {
    const isPrimaryGoal = goalId === 'main_goal';
    const confirmMessage = isPrimaryGoal 
      ? "Are you sure you want to delete your primary goal? This will clear your main goal and cancel all pending messages."
      : "Are you sure you want to delete this goal? This will cancel all pending messages.";
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      if (isPrimaryGoal) {
        // For primary goal, clear user's goals field
        await axios.put(`${API}/users/${user.email}`, {
          goals: "",
          schedule: null
        });
        showNotification({ type: 'success', message: "Primary goal has been deleted", title: "Goal Deleted" });
        toast.success("Primary Goal Deleted", {
          description: "Your primary goal has been removed. You can always create a new one!",
          duration: 3000,
        });
      } else {
        // For regular goals, use the delete endpoint
        await axios.delete(`${API}/users/${user.email}/goals/${goalId}`);
        showNotification({ type: 'success', message: "Goal has been deleted", title: "Goal Deleted" });
        toast.success("Goal Deleted", {
          description: "The goal has been removed. You can always create a new one!",
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
      showNotification({ type: 'error', message: "Failed to delete goal", title: "Error" });
      toast.error("Failed to delete goal");
      console.error("Delete error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (goal) => {
    setLoading(true);
    try {
      const isPrimaryGoal = goal.id === 'main_goal' || goal.isMainGoal;
      
      if (isPrimaryGoal) {
        // For primary goal, update user's schedule paused status
        const currentSchedule = user.schedule || {};
        await axios.put(`${API}/users/${user.email}`, {
          schedule: {
            ...currentSchedule,
            paused: goal.active // If currently active, pause it; if paused, activate it
          }
        });
      } else {
        // For regular goals, use the goals endpoint
        await axios.put(`${API}/users/${user.email}/goals/${goal.id}`, {
          active: !goal.active
        });
      }
      
      if (!goal.active) {
        toast.success("Goal Activated!", {
          description: "This goal is now active and will send you motivational emails!",
          duration: 3000,
        });
        setTimeout(() => {
          showNotification({ type: 'success', message: "You're ready to receive motivation!", title: "Ready" });
          toast.success("You're Ready!", {
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
      showNotification({ type: 'error', message: "Failed to update goal", title: "Error" });
      toast.error("Failed to update goal");
      console.error("Toggle active error:", error);
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
      showNotification({ type: 'error', message: "Failed to load goal history", title: "Error" });
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
    <Card className="border-0 sm:border shadow-none sm:shadow-sm">
      <CardHeader className="pb-3 sm:pb-6 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-xl">
              <Target className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-primary" />
              <span className="sm:hidden">Goals</span>
              <span className="hidden sm:inline">Goals & Motivational Emails</span>
            </CardTitle>
            <p className="hidden sm:block text-sm text-muted-foreground mt-1">
              Create multiple goals with custom schedules and personalities
            </p>
          </div>
          <Dialog open={showModal} onOpenChange={setShowModal}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenModal()} className="w-full sm:w-auto h-10 sm:h-9 touch-manipulation min-h-[44px] sm:min-h-0">
                <Plus className="h-4 w-4 flex-shrink-0" />
                <span className="sm:inline">Create New Goal</span>
              </Button>
            </DialogTrigger>
            <DialogContent from="top" showCloseButton={true} className="w-full h-[100dvh] sm:h-[85vh] sm:max-w-4xl p-0 bg-background border-border shadow-xl flex flex-col gap-0 sm:rounded-xl overflow-hidden max-w-full">
              {/* Sticky Header */}
              <div className="flex-shrink-0 sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 py-3 sm:px-6 sm:py-5 border-b border-border/40 flex items-center justify-between">
                <DialogHeader className="p-0 space-y-0 text-left w-full">
                  <DialogTitle className="text-base sm:text-2xl font-bold tracking-tight flex items-center gap-1.5 sm:gap-2">
                    {editingGoal ? <Edit className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> : <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />}
                    {editingGoal ? "Edit Goal" : "New Goal"}
                  </DialogTitle>
                </DialogHeader>
              </div>
              
              {/* Layout: Split View on Desktop, Stacked on Mobile */}
              <div className="flex-1 w-full relative text-foreground overflow-hidden flex flex-col sm:flex-row bg-background">
                <TabGroup value={activeTab} onChange={setActiveTab} className="w-full h-full flex flex-col sm:flex-row">
                  
                  {/* Navigation Sidebar */}
                  <div className="shrink-0 z-20 bg-background sm:bg-muted/10 border-b sm:border-b-0 sm:border-r border-border/40 sm:w-64 h-auto sm:h-full">
                    <TabList className="flex sm:flex-col w-full h-full p-1.5 sm:p-4 gap-1 sm:gap-2 overflow-x-auto sm:overflow-y-auto scrollbar-hide bg-transparent items-stretch sm:justify-start">
                      <Tab value="basic" className={cn(
                        "flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-manipulation min-h-[44px] sm:min-h-0",
                        activeTab === "basic" 
                          ? "bg-secondary text-secondary-foreground sm:bg-background sm:text-foreground sm:shadow-sm" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}>
                        <Target className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden xs:inline">Basic Details</span>
                        <span className="xs:hidden">Basic</span>
                      </Tab>
                      <Tab value="content" className={cn(
                        "flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-manipulation min-h-[44px] sm:min-h-0",
                        activeTab === "content" 
                          ? "bg-secondary text-secondary-foreground sm:bg-background sm:text-foreground sm:shadow-sm" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}>
                        <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>Content</span>
                      </Tab>
                      <Tab value="schedules" className={cn(
                        "flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-manipulation min-h-[44px] sm:min-h-0",
                        activeTab === "schedules" 
                          ? "bg-secondary text-secondary-foreground sm:bg-background sm:text-foreground sm:shadow-sm" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}>
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>Schedules</span>
                      </Tab>
                    </TabList>
                  </div>

                  {/* Content Panel */}
                  <div className="flex-1 h-full overflow-y-auto bg-background/50 scroll-smooth">

                  <TabPanels className="w-full max-w-3xl mx-auto p-3 sm:p-8 pb-24 sm:pb-12">
                    <TabPanel value="basic" className="space-y-4 sm:space-y-6 focus:outline-none w-full">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-sm sm:text-lg font-semibold">Goal Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Finish MVP, Learn Spanish"
                      className="mt-1 text-base h-11 sm:h-10"
                    />
                    <p className="text-xs text-muted-foreground">Give your goal a clear, motivating name</p>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-sm sm:text-lg font-semibold">Description <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Additional context for personalized messages..."
                      className="mt-1 text-base min-h-[100px] sm:min-h-[80px]"
                      rows={4}
                      required
                    />
                    <p className="text-xs text-muted-foreground">Add details to help personalize your motivational messages</p>
                  </div>
                  <div className="flex items-center justify-between p-3 sm:p-4 border rounded-lg bg-muted/30">
                    <div className="flex-1">
                      <Label className="text-sm sm:text-lg font-semibold cursor-pointer">Active</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Enable or disable this goal</p>
                    </div>
                    <Switch
                      checked={formData.active}
                      onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                      className="flex-shrink-0"
                    />
                  </div>
                  </TabPanel>

                  <TabPanel value="content" className="space-y-4 sm:space-y-6 focus:outline-none w-full">
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="text-sm sm:text-lg font-semibold">How should we write your emails?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                      {[
                        { id: "personality", icon: Sparkles, title: "Personality", desc: "Use a famous persona" },
                        { id: "tone", icon: Zap, title: "Tone", desc: "Set a specific mood" },
                        { id: "custom", icon: Settings, title: "Custom", desc: "Write your own style" }
                      ].map((option) => {
                        const Icon = option.icon;
                        const isSelected = formData.mode === option.id;
                        return (
                          <div 
                            key={option.id}
                            onClick={() => setFormData({ ...formData, mode: option.id, personality_id: "", tone: "", custom_text: "" })}
                            className={cn(
                              "cursor-pointer relative flex flex-col items-center text-center p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 hover:bg-accent/5 touch-manipulation min-h-[100px] sm:min-h-0",
                              isSelected 
                                ? "border-primary bg-primary/5 shadow-sm" 
                                : "border-border/50 hover:border-primary/30"
                            )}
                          >
                            <div className={cn(
                              "p-1.5 sm:p-2 rounded-full mb-1.5 sm:mb-2 transition-colors",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}>
                              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                            </div>
                            <h3 className="font-semibold text-sm mb-0.5">{option.title}</h3>
                            <p className="text-xs text-muted-foreground">{option.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {formData.mode === "personality" && (
                    <div className="space-y-1.5 sm:space-y-2 animate-in fade-in zoom-in-95 duration-300">
                      <Label className="text-sm sm:text-lg font-semibold">Select Personality *</Label>
                      {famousPersonalities.length === 0 ? (
                        <div className="mt-1 p-4 bg-muted border border-border rounded-lg">
                          <p className="text-sm sm:text-base text-foreground">
                            Loading personalities...
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
                            <SelectTrigger className="text-base h-11 sm:h-12 touch-manipulation">
                              <SelectValue placeholder="Choose a personality">
                                {(() => {
                                  // Display the personality name, not the ID
                                  const selectedPersonality = formData.personality_id;
                                  if (!selectedPersonality) return "Choose a personality";
                                  // If it's already a name in famousPersonalities, use it
                                  if (famousPersonalities.includes(selectedPersonality)) {
                                    return selectedPersonality;
                                  }
                                  // If it's a UUID, try to find the name
                                  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedPersonality);
                                  if (isUUID && user.personalities) {
                                    const foundPersonality = user.personalities.find(p => 
                                      p.id === selectedPersonality || p.value === selectedPersonality || p.name === selectedPersonality
                                    );
                                    if (foundPersonality) {
                                      return foundPersonality.value || foundPersonality.name || selectedPersonality;
                                    }
                                  }
                                  // Fallback: return as-is (might be a name we don't recognize)
                                  return selectedPersonality;
                                })()}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px] overflow-y-auto">
                              {famousPersonalities && famousPersonalities.length > 0 ? (
                                famousPersonalities.map((personality) => (
                                  <SelectItem 
                                    key={personality} 
                                    value={personality} 
                                    className="text-base cursor-pointer hover:bg-muted py-3"
                                  >
                                    {personality}
                                  </SelectItem>
                                ))
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
                    <div className="space-y-1.5 sm:space-y-2 animate-in fade-in zoom-in-95 duration-300">
                      <Label className="text-sm sm:text-lg font-semibold">Select Tone *</Label>
                      {tones.length === 0 ? (
                        <div className="mt-1 p-4 bg-muted border border-border rounded-lg">
                          <p className="text-sm sm:text-base text-foreground">
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
                            <SelectTrigger className="text-base h-11 sm:h-12 touch-manipulation">
                              <SelectValue placeholder="Choose a tone">
                                {formData.tone || "Choose a tone"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {tones && tones.length > 0 ? (
                                tones.map((tone) => (
                                  <SelectItem key={tone} value={tone} className="text-base py-3">
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
                    <div className="space-y-1.5 sm:space-y-2 animate-in fade-in zoom-in-95 duration-300">
                      <Label className="text-sm sm:text-lg font-semibold">Custom Style Guide *</Label>
                      <Textarea
                        value={formData.custom_text}
                        onChange={(e) => setFormData({ ...formData, custom_text: e.target.value })}
                        placeholder="Describe the writing style you want (e.g., 'Write like a friendly mentor, use short sentences, be encouraging but realistic')..."
                        className="mt-1 text-base min-h-[120px] sm:min-h-[150px] touch-manipulation"
                        rows={5}
                      />
                      <p className="text-xs text-muted-foreground">Describe how you want your messages to be written</p>
                    </div>
                  )}
                  </TabPanel>

                  <TabPanel value="schedules" className="space-y-4 sm:space-y-6 focus:outline-none w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-0 pb-2.5 sm:pb-3 border-b">
                    <div>
                      <Label className="text-sm sm:text-lg font-semibold">Delivery Schedule</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">When should we send you emails?</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddSchedule} className="w-full sm:w-auto min-w-[140px] h-11 sm:h-9 touch-manipulation min-h-[44px] sm:min-h-0">
                      <Plus className="mr-1 sm:mr-1.5 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <span>Add Time</span>
                    </Button>
                  </div>
                  
                  <div className="space-y-3 sm:space-y-4">
                    {formData.schedules.map((schedule, index) => (
                      <div key={index} className="p-3 sm:p-5 rounded-xl border border-border/40 bg-accent/10 hover:bg-accent/20 transition-colors space-y-3 sm:space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-0 mb-3 sm:mb-4">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-background border border-border shadow-sm text-xs sm:text-sm font-semibold text-muted-foreground flex-shrink-0">
                              {index + 1}
                            </div>
                            <span className="font-medium text-sm sm:text-base">Schedule Config</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <div className="flex items-center gap-2 bg-background/50 px-2.5 sm:px-3 py-1.5 rounded-full border border-border/30">
                              <Label className="text-xs font-medium cursor-pointer whitespace-nowrap" htmlFor={`active-${index}`}>Active</Label>
                              <Switch
                                id={`active-${index}`}
                                checked={schedule.active}
                                onCheckedChange={(checked) => handleUpdateSchedule(index, "active", checked)}
                                className="scale-75 sm:scale-100 origin-right"
                              />
                            </div>
                            {formData.schedules.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveSchedule(index)}
                                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full touch-manipulation min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0"
                              >
                                <X className="h-4 w-4 sm:h-5 sm:w-5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4">
                          <div className="sm:col-span-4">
                            <Label className="text-xs sm:text-sm text-muted-foreground mb-1.5 block">Frequency</Label>
                            <Select
                              value={schedule.type}
                              onValueChange={(value) => handleUpdateSchedule(index, "type", value)}
                            >
                              <SelectTrigger className="h-11 sm:h-10 bg-background text-base sm:text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="daily" className="text-base sm:text-sm">Daily (Every Day)</SelectItem>
                                <SelectItem value="weekly" className="text-base sm:text-sm">Weekly (Specific Days)</SelectItem>
                                <SelectItem value="monthly" className="text-base sm:text-sm">Monthly (Specific Dates)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="sm:col-span-3">
                            <Label className="text-xs sm:text-sm text-muted-foreground mb-1.5 block">Time</Label>
                            <Input
                              type="time"
                              value={schedule.time}
                              onChange={(e) => handleUpdateSchedule(index, "time", e.target.value)}
                              className="h-11 sm:h-10 bg-background text-base sm:text-sm"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <Label className="text-xs sm:text-sm text-muted-foreground mb-1.5 block">Timezone</Label>
                            <Select
                              value={schedule.timezone}
                              onValueChange={(value) => handleUpdateSchedule(index, "timezone", value)}
                            >
                              <SelectTrigger className="h-11 sm:h-10 bg-background text-base sm:text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-[250px]">
                                {TIMEZONES.map((tz) => (
                                  <SelectItem key={tz.value} value={tz.value} className="text-base sm:text-sm">
                                    {tz.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="sm:col-span-12">
                            <Label className="text-xs sm:text-sm text-muted-foreground mb-1.5 block">Stop Sending After (Optional)</Label>
                            <Input
                              type="datetime-local"
                              value={schedule.end_date ? (() => {
                                const utcDate = new Date(schedule.end_date);
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
                                  const localDate = new Date(value);
                                  const isoString = localDate.toISOString();
                                  handleUpdateSchedule(index, "end_date", isoString);
                                } else {
                                  handleUpdateSchedule(index, "end_date", null);
                                }
                              }}
                              className="h-11 sm:h-10 bg-background text-base sm:text-sm"
                              placeholder="Select a date to stop emails"
                            />
                          </div>
                        </div>

                        {schedule.type === "weekly" && (
                          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Label className="text-xs sm:text-sm text-muted-foreground mb-2 block">Repeat On</Label>
                            <div className="flex flex-wrap gap-2">
                              {WEEKDAYS.map((day) => {
                                const isSelected = schedule.weekdays?.includes(day.value);
                                return (
                                  <button
                                    key={day.value}
                                    type="button"
                                    onClick={() => {
                                      const weekdays = schedule.weekdays || [];
                                      const newWeekdays = weekdays.includes(day.value)
                                        ? weekdays.filter(d => d !== day.value)
                                        : [...weekdays, day.value];
                                      handleUpdateSchedule(index, "weekdays", newWeekdays);
                                    }}
                                    className={cn(
                                      "h-10 sm:h-9 px-3 sm:px-3 rounded-md text-sm font-medium transition-all border touch-manipulation min-h-[40px] sm:min-h-0",
                                      isSelected
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                                    )}
                                  >
                                    {day.short}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {schedule.type === "monthly" && (
                          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Label className="text-xs sm:text-sm text-muted-foreground mb-1.5 block">Days of Month (e.g., 1, 15, 30)</Label>
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
                              className="h-11 sm:h-10 bg-background text-base sm:text-sm"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  </TabPanel>
                </TabPanels>
                </div>
              </TabGroup>

              </div>
              {/* Sticky Footer for Mobile */}
              <div className="flex-shrink-0 sticky bottom-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border/40 p-3 sm:p-0 sm:bg-transparent sm:border-0 sm:relative sm:mt-8 sm:pt-4 sm:border-t-0 w-full">
                <DialogFooter className="flex-col sm:flex-row gap-2.5 sm:gap-2 w-full">
                  <Button 
                    variant="outline" 
                    onClick={handleCloseModal} 
                    className="w-full sm:w-auto order-2 sm:order-1 h-11 sm:h-10 text-base touch-manipulation"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={loading} 
                    className="w-full sm:w-auto order-1 sm:order-2 h-11 sm:h-10 text-base font-semibold shadow-md touch-manipulation"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin mr-2" />
                        Saving...
                      </>
                    ) : editingGoal ? "Update Goal" : "Create Goal"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 py-4 sm:py-6">
        {/* Summary Cards - Mobile Redesigned (2 cards), Desktop (3 cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
            <CardContent className="p-4 sm:p-5 flex flex-col items-center justify-center sm:block text-center sm:text-left h-full">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-2 sm:gap-2.5 sm:mb-4 mb-3">
                <div className="p-2 sm:p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors flex-shrink-0">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                </div>
                <p className="text-xs sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
              </div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{counts.totalGoals}</p>
            </CardContent>
          </Card>
          <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
            <CardContent className="p-4 sm:p-5 flex flex-col items-center justify-center sm:block text-center sm:text-left h-full">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-2 sm:gap-2.5 sm:mb-4 mb-3">
                <div className="p-2 sm:p-2 rounded-lg bg-green-500/10 border border-green-500/20 group-hover:bg-green-500/15 transition-colors flex-shrink-0">
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                </div>
                <p className="text-xs sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</p>
              </div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{counts.activeGoals}</p>
            </CardContent>
          </Card>
          {/* Paused Card - Hidden on mobile, visible on desktop */}
          <Card className="hidden sm:block border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
            <CardContent className="p-4 sm:p-5 flex flex-col items-center sm:block text-center sm:text-left">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-2 sm:gap-2.5 sm:mb-4 mb-3">
                <div className="p-2 sm:p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/15 transition-colors">
                  <Pause className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                </div>
                <p className="text-xs sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paused</p>
              </div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{counts.pausedGoals}</p>
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
            {allGoals.map((goal, index) => {
              const isActive = goal.active;
              const goalNumber = index + 1;
              
              // Color palette for different goals
              const colorPalette = [
                { border: 'border-blue-500/20', bg: 'from-blue-500/5', to: 'to-blue-400/3', icon: 'bg-blue-500/10', iconBorder: 'border-blue-500/25', iconText: 'text-blue-500', numberBg: 'bg-blue-500/10', numberBorder: 'border-blue-500/30', numberText: 'text-blue-600' },
                { border: 'border-purple-500/20', bg: 'from-purple-500/5', to: 'to-purple-400/3', icon: 'bg-purple-500/10', iconBorder: 'border-purple-500/25', iconText: 'text-purple-500', numberBg: 'bg-purple-500/10', numberBorder: 'border-purple-500/30', numberText: 'text-purple-600' },
                { border: 'border-green-500/20', bg: 'from-green-500/5', to: 'to-green-400/3', icon: 'bg-green-500/10', iconBorder: 'border-green-500/25', iconText: 'text-green-500', numberBg: 'bg-green-500/10', numberBorder: 'border-green-500/30', numberText: 'text-green-600' },
                { border: 'border-pink-500/20', bg: 'from-pink-500/5', to: 'to-pink-400/3', icon: 'bg-pink-500/10', iconBorder: 'border-pink-500/25', iconText: 'text-pink-500', numberBg: 'bg-pink-500/10', numberBorder: 'border-pink-500/30', numberText: 'text-pink-600' },
                { border: 'border-cyan-500/20', bg: 'from-cyan-500/5', to: 'to-cyan-400/3', icon: 'bg-cyan-500/10', iconBorder: 'border-cyan-500/25', iconText: 'text-cyan-500', numberBg: 'bg-cyan-500/10', numberBorder: 'border-cyan-500/30', numberText: 'text-cyan-600' },
                { border: 'border-amber-500/20', bg: 'from-amber-500/5', to: 'to-amber-400/3', icon: 'bg-amber-500/10', iconBorder: 'border-amber-500/25', iconText: 'text-amber-500', numberBg: 'bg-amber-500/10', numberBorder: 'border-amber-500/30', numberText: 'text-amber-600' },
                { border: 'border-indigo-500/20', bg: 'from-indigo-500/5', to: 'to-indigo-400/3', icon: 'bg-indigo-500/10', iconBorder: 'border-indigo-500/25', iconText: 'text-indigo-500', numberBg: 'bg-indigo-500/10', numberBorder: 'border-indigo-500/30', numberText: 'text-indigo-600' },
                { border: 'border-teal-500/20', bg: 'from-teal-500/5', to: 'to-teal-400/3', icon: 'bg-teal-500/10', iconBorder: 'border-teal-500/25', iconText: 'text-teal-500', numberBg: 'bg-teal-500/10', numberBorder: 'border-teal-500/30', numberText: 'text-teal-600' },
              ];
              const colors = colorPalette[index % colorPalette.length];
              
              return (
                <Card key={goal.id} className={cn(
                  "border border-border/30 bg-background hover:border-border/50 hover:shadow-md transition-all duration-300 overflow-hidden relative group",
                  !isActive && "opacity-60"
                )}>
                  <CardContent className="p-3 sm:p-5 relative">
                    {/* Mobile-First Design */}
                    <div className="flex flex-col gap-4">
                      {/* Header Section - Number Badge + Title + Status */}
                      <div className="flex items-start gap-2.5 sm:gap-3">
                        {/* Number Badge - Smaller on mobile */}
                        <div className={cn(
                          "flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center",
                          colors.numberBg,
                          colors.numberBorder
                        )}>
                          <span className={cn(colors.numberText, "font-bold text-xs sm:text-sm")}>#{goalNumber}</span>
                        </div>
                        
                        {/* Title and Badges */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm sm:text-lg leading-tight break-words mb-1.5 sm:mb-2 line-clamp-2">
                            {goal.title || "Untitled Goal"}
                          </h3>
                          
                          {/* Badges Row - Mobile Optimized */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            {goal.isMainGoal && (
                              <Badge variant="outline" className="bg-muted text-foreground border-border/50 text-xs h-5 px-2 font-normal">
                                Primary
                              </Badge>
                            )}
                            <Badge 
                              variant={isActive ? "default" : "secondary"} 
                              className={cn(
                                "gap-1.5 text-xs h-5 px-2.5 font-medium shadow-sm",
                                isActive && "bg-foreground text-background border-0"
                              )}
                            >
                              {isActive ? (
                                <>
                                  <Play className="h-3 w-3" /> Active
                                </>
                              ) : (
                                <>
                                  <Pause className="h-3 w-3" /> Paused
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Description - Mobile Optimized */}
                      {goal.description && goal.description.trim() && (
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap line-clamp-2">
                          {goal.description}
                        </p>
                      )}

                      {/* Metadata Section - Personality/Tone Badge - Mobile Compact */}
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs h-5 sm:h-6 px-2 sm:px-2.5 bg-muted/50 border-border/40 max-w-full">
                          {goal.mode === "personality" && <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />}
                          {goal.mode === "tone" && <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />}
                          {goal.mode === "custom" && <Settings className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />}
                          <span className="truncate max-w-[120px] sm:max-w-none">{getModeValue(goal) || "N/A"}</span>
                        </Badge>
                      </div>

                      {/* Schedule Info - Mobile Compact */}
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span>{(goal.schedules || []).filter(s => s.active).length} active schedule{(goal.schedules || []).filter(s => s.active).length !== 1 ? 's' : ''}</span>
                      </div>

                      {/* Action Buttons - Mobile Optimized */}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 border-t border-border/30">
                        {/* Primary Actions Row - Equal width on mobile */}
                        <div className="flex items-stretch gap-2 sm:gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleViewHistory(goal);
                            }}
                            className="flex-1 flex-col sm:flex-row sm:justify-center h-auto py-2.5 sm:py-2.5 px-2 sm:px-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 touch-manipulation relative z-10 min-h-[44px]"
                          >
                            <History className="h-3.5 w-3.5 sm:h-4 sm:w-4 mb-0.5 sm:mb-0 sm:mr-1.5 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium">History</span>
                          </Button>
                          {/* Pause/Play Button - Restored for mobile */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleActive(goal);
                            }}
                            disabled={loading}
                            className="flex-1 flex-col sm:flex-row sm:justify-center h-auto py-2.5 sm:py-2.5 px-2 sm:px-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 touch-manipulation relative z-10 min-h-[44px]"
                          >
                            {loading ? (
                              <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mb-0.5 sm:mb-0 sm:mr-1.5 animate-spin flex-shrink-0" />
                            ) : isActive ? (
                              <>
                                <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4 mb-0.5 sm:mb-0 sm:mr-1.5 flex-shrink-0" />
                                <span className="text-[10px] sm:text-xs font-medium">Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 mb-0.5 sm:mb-0 sm:mr-1.5 flex-shrink-0" />
                                <span className="text-[10px] sm:text-xs font-medium">Start</span>
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenModal(goal);
                            }}
                            className="flex-1 flex-col sm:flex-row sm:justify-center h-auto py-2.5 sm:py-2.5 px-2 sm:px-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 touch-manipulation relative z-10 min-h-[44px]"
                          >
                            <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mb-0.5 sm:mb-0 sm:mr-1.5 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium">Edit</span>
                          </Button>
                        </div>
                        
                        {/* Delete Action - Mobile Optimized */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(goal.id);
                          }}
                          disabled={loading}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 h-11 sm:h-9 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs sm:text-sm touch-manipulation relative z-10 min-h-[44px]"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="text-[10px] sm:text-xs font-medium">Delete</span>
                        </Button>
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
        <DialogContent from="top" showCloseButton={true} className="w-[95vw] sm:w-full max-w-3xl h-[90vh] sm:h-[80vh] p-0 bg-background border-border shadow-xl flex flex-col sm:rounded-xl overflow-hidden">
          <div className="flex-shrink-0 sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-4 border-b border-border/40">
            <DialogHeader className="p-0 space-y-1 text-left pr-8">
              <DialogTitle className="text-lg font-bold tracking-tight truncate">
                Message History
              </DialogTitle>
              {selectedGoalHistory && (
                <p className="text-sm text-muted-foreground truncate">
                  {selectedGoalHistory.title}
                </p>
              )}
            </DialogHeader>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {historyLoading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <div>Loading history...</div>
            </div>
          ) : goalHistory.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium text-foreground">No messages sent yet</p>
              <p className="text-sm text-muted-foreground">Messages will appear here once sent.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {goalHistory.map((msg) => (
                <Card key={msg.id} className={cn("w-full", msg.status === "sent" ? "" : "opacity-80")}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={msg.status === "sent" ? "default" : msg.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                            {msg.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground break-words">
                            {formatDateTimeForTimezone(msg.scheduled_for, selectedGoalHistory?.schedules?.[0]?.timezone || "UTC", { includeDate: true, includeTime: true })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="bg-muted/40 p-3 rounded-md border border-border/50 min-h-[60px]">
                        {msg.generated_subject && (
                          <p className="font-semibold text-sm mb-1 break-words">{msg.generated_subject}</p>
                        )}
                        
                        {msg.generated_body ? (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {msg.generated_body}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                            <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            {msg.status === 'pending' ? 'Content will be generated on schedule' : 
                             msg.status === 'skipped' ? 'Message was skipped' : 
                             msg.status === 'failed' ? 'Generation failed' : 'No content available'}
                          </p>
                        )}
                      </div>
                      
                      {msg.error_message && (
                        <Alert variant="destructive" className="py-2">
                          <X className="h-3 w-3 sm:h-4 sm:w-4" />
                          <AlertDescription className="text-xs">
                            {msg.error_message}
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {msg.sent_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          <span>
                            Sent: {formatDateTimeForTimezone(msg.sent_at, selectedGoalHistory?.schedules?.[0]?.timezone || "UTC", { includeDate: true, includeTime: true })}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
});

import { useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Clock, Pause, Play, SkipForward, Plus, X, Timer } from "lucide-react";
import { toast } from "sonner";
import { TIMEZONES } from "@/utils/timezones";
import { safeSelectValue } from "@/utils/safeRender";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function ScheduleManager({ user, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState(() => {
    const userSchedule = user.schedule || {};
    return {
      frequency: typeof userSchedule.frequency === 'string' ? userSchedule.frequency : 'daily',
      times: Array.isArray(userSchedule.times) ? userSchedule.times : (userSchedule.time ? [userSchedule.time] : ['09:00']),
      timezone: typeof userSchedule.timezone === 'string' ? userSchedule.timezone : (() => {
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          return typeof tz === 'string' ? tz : "UTC";
        } catch {
          return "UTC";
        }
      })(),
      paused: typeof userSchedule.paused === 'boolean' ? userSchedule.paused : false,
      skip_next: typeof userSchedule.skip_next === 'boolean' ? userSchedule.skip_next : false,
      custom_days: Array.isArray(userSchedule.custom_days) ? userSchedule.custom_days : [],
      custom_interval: typeof userSchedule.custom_interval === 'number' ? userSchedule.custom_interval : 1,
      monthly_dates: Array.isArray(userSchedule.monthly_dates) ? userSchedule.monthly_dates : [],
      send_time_windows: Array.isArray(userSchedule.send_time_windows) ? userSchedule.send_time_windows : []
    };
  });

  const handleUpdateSchedule = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/users/${user.email}`, {
        schedule: schedule
      });
      toast.success("Schedule updated!");
      
      // Refresh user data
      const response = await axios.get(`${API}/users/${user.email}`);
      onUpdate(response.data);
    } catch (error) {
      toast.error("Failed to update schedule");
    } finally {
      setLoading(false);
    }
  };

  const handlePauseResume = async () => {
    setLoading(true);
    try {
      const endpoint = schedule.paused 
        ? `${API}/users/${user.email}/schedule/resume`
        : `${API}/users/${user.email}/schedule/pause`;
      
      await axios.post(endpoint);
      toast.success(schedule.paused ? "Schedule resumed!" : "Schedule paused!");
      
      // Refresh user data
      const response = await axios.get(`${API}/users/${user.email}`);
      onUpdate(response.data);
      setSchedule(response.data.schedule);
    } catch (error) {
      toast.error("Failed to update schedule");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipNext = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/users/${user.email}/schedule/skip-next`);
      toast.success("Next email will be skipped");
      
      // Refresh user data
      const response = await axios.get(`${API}/users/${user.email}`);
      onUpdate(response.data);
      setSchedule(response.data.schedule);
    } catch (error) {
      toast.error("Failed to skip next email");
    } finally {
      setLoading(false);
    }
  };

  const handleAddTimeWindow = () => {
    if (schedule.send_time_windows.length >= 5) {
      toast.error("Maximum 5 time windows allowed");
      return;
    }
    setSchedule({
      ...schedule,
      send_time_windows: [
        ...schedule.send_time_windows,
        { start_time: "09:00", end_time: "17:00", timezone: schedule.timezone || "UTC", max_sends: 1 }
      ]
    });
  };

  const handleRemoveTimeWindow = (index) => {
    setSchedule({
      ...schedule,
      send_time_windows: schedule.send_time_windows.filter((_, i) => i !== index)
    });
  };

  const handleUpdateTimeWindow = (index, field, value) => {
    const newWindows = [...schedule.send_time_windows];
    newWindows[index] = { ...newWindows[index], [field]: value };
    setSchedule({ ...schedule, send_time_windows: newWindows });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Schedule Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Indicator */}
        <div className={`p-4 rounded-lg ${schedule.paused ? 'bg-yellow-50' : 'bg-green-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{schedule.paused ? 'Paused' : 'Active'}</p>
              <p className="text-sm text-muted-foreground">
                {schedule.paused ? 'No emails will be sent' : 'Emails are being sent'}
              </p>
            </div>
            <div className={`h-3 w-3 rounded-full ${schedule.paused ? 'bg-yellow-500' : 'bg-green-500'}`} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button 
            variant={schedule.paused ? "default" : "outline"} 
            className="flex-1"
            onClick={handlePauseResume}
            disabled={loading}
            data-testid="pause-resume-btn"
          >
            {schedule.paused ? (
              <>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            )}
          </Button>
          <Button 
            variant="outline"
            onClick={handleSkipNext}
            disabled={loading || schedule.paused || schedule.skip_next}
            data-testid="skip-next-btn"
          >
            <SkipForward className="h-4 w-4 mr-2" />
            {schedule.skip_next ? 'Will Skip' : 'Skip Next'}
          </Button>
        </div>

        {/* Frequency */}
        <div>
          <Label>Frequency</Label>
          <Select 
            value={safeSelectValue(schedule.frequency, 'daily')} 
            onValueChange={(value) => setSchedule({...schedule, frequency: value})}
          >
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

        {/* Time */}
        <div>
          <Label>Time</Label>
          <Input
            type="time"
            value={Array.isArray(schedule.times) && schedule.times.length > 0 ? schedule.times[0] : '09:00'}
            onChange={(e) => setSchedule({...schedule, times: [e.target.value]})}
            className="mt-2"
          />
        </div>

        {/* Timezone */}
        <div>
          <Label>Timezone</Label>
          <Select 
            value={safeSelectValue(schedule.timezone, (() => {
              try {
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                return typeof tz === 'string' ? tz : "UTC";
              } catch {
                return "UTC";
              }
            })())} 
            onValueChange={(value) => setSchedule({...schedule, timezone: value})}
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

        {/* Send Time Windows */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Send Time Windows (optional, max 5)</Label>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={handleAddTimeWindow}
              disabled={schedule.send_time_windows.length >= 5}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Time Window
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Define specific time ranges when emails can be sent. If set, only sends during these windows.
          </p>
          <div className="space-y-3">
            {schedule.send_time_windows.map((window, index) => (
              <Card key={index} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start Time</Label>
                      <Input
                        type="time"
                        value={window.start_time}
                        onChange={(e) => handleUpdateTimeWindow(index, "start_time", e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End Time</Label>
                      <Input
                        type="time"
                        value={window.end_time}
                        onChange={(e) => handleUpdateTimeWindow(index, "end_time", e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Timezone</Label>
                      <Select
                        value={window.timezone}
                        onValueChange={(value) => handleUpdateTimeWindow(index, "timezone", value)}
                      >
                        <SelectTrigger className="h-8">
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
                      <Label className="text-xs">Max Sends in Window</Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        value={window.max_sends || 1}
                        onChange={(e) => handleUpdateTimeWindow(index, "max_sends", parseInt(e.target.value) || 1)}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveTimeWindow(index)}
                    className="ml-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
            {schedule.send_time_windows.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No time windows set. Emails will be sent at scheduled times without time restrictions.
              </p>
            )}
          </div>
        </div>

        {/* Weekly Schedule (if weekly) */}
        {schedule.frequency === "weekly" && (
          <div>
            <Label>Days of Week</Label>
            <div className="grid grid-cols-7 gap-2 mt-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                const dayLower = day.toLowerCase();
                const isSelected = schedule.custom_days?.includes(dayLower);
                return (
                  <Button
                    key={day}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const currentDays = schedule.custom_days || [];
                      const newDays = isSelected
                        ? currentDays.filter(d => d !== dayLower)
                        : [...currentDays, dayLower];
                      setSchedule({...schedule, custom_days: newDays});
                    }}
                  >
                    {day}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Save Button */}
        <Button 
          onClick={handleUpdateSchedule} 
          disabled={loading}
          className="w-full"
          data-testid="save-schedule-btn"
        >
          {loading ? "Saving..." : "Save Schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}

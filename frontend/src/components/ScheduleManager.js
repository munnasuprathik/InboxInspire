import { useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Clock, Pause, Play, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { TIMEZONES } from "@/utils/timezones";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function ScheduleManager({ user, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState(user.schedule);

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
            value={schedule.frequency} 
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
            value={schedule.times[0]}
            onChange={(e) => setSchedule({...schedule, times: [e.target.value]})}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Timezone: {schedule.timezone}
          </p>
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

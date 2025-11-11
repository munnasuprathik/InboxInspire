import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";

export function StreakCalendar({ streakCount = 0, totalMessages = 0, lastEmailSent }) {
  const [calendarData, setCalendarData] = useState([]);

  useEffect(() => {
    generateCalendarData();
  }, [streakCount, totalMessages, lastEmailSent]);

  const generateCalendarData = () => {
    const today = new Date();
    const weeks = 12; // Show last 12 weeks
    const data = [];

    for (let week = weeks - 1; week >= 0; week--) {
      const weekData = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (week * 7 + (6 - day)));
        
        // Determine if this day had activity
        let level = 0;
        if (lastEmailSent) {
          const lastSent = new Date(lastEmailSent);
          const daysSince = Math.floor((today - date) / (1000 * 60 * 60 * 24));
          
          // If within streak count, mark as active
          if (daysSince <= streakCount && daysSince >= 0) {
            level = 4; // High activity
          }
        }

        weekData.push({
          date: date.toISOString().split('T')[0],
          level,
          dayOfWeek: day,
          isToday: date.toDateString() === today.toDateString()
        });
      }
      data.push(weekData);
    }

    setCalendarData(data);
  };

  const getLevelColor = (level) => {
    if (level === 0) return "bg-gray-100";
    if (level === 1) return "bg-green-200";
    if (level === 2) return "bg-green-300";
    if (level === 3) return "bg-green-400";
    return "bg-green-500";
  };

  const getDayLabel = (dayIndex) => {
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return days[dayIndex];
  };

  const getMonthLabels = () => {
    const months = [];
    const today = new Date();
    
    for (let i = 2; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      months.push(date.toLocaleString('default', { month: 'short' }));
    }
    
    return months;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Your Motivation Streak
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stats */}
        <div className="flex items-center gap-6 mb-6">
          <div>
            <div className="text-3xl font-bold text-orange-500">{streakCount}</div>
            <div className="text-sm text-muted-foreground">day streak</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{totalMessages}</div>
            <div className="text-sm text-muted-foreground">total messages</div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="space-y-4">
          {/* Month labels */}
          <div className="flex gap-1 text-xs text-muted-foreground pl-6">
            {getMonthLabels().map((month, i) => (
              <div key={i} className="flex-1 text-left">{month}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-1">
            {/* Day labels */}
            <div className="flex flex-col gap-1 justify-between text-xs text-muted-foreground pr-2">
              {[1, 3, 5].map((day) => (
                <div key={day} style={{ height: '14px', lineHeight: '14px' }}>
                  {getDayLabel(day)}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="flex gap-1 flex-1">
              {calendarData.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      className={`w-3 h-3 rounded-sm ${getLevelColor(day.level)} ${
                        day.isToday ? 'ring-2 ring-blue-500' : ''
                      } transition-colors hover:ring-2 hover:ring-gray-400 cursor-pointer`}
                      title={`${day.date}${day.level > 0 ? ' - Message received' : ''}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`w-3 h-3 rounded-sm ${getLevelColor(level)}`}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        {/* Motivation message */}
        {streakCount > 0 && (
          <div className="mt-4 p-3 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg text-center">
            <p className="text-sm font-medium">
              {streakCount >= 30 && "🔥 Amazing! You're on fire! 30+ day streak!"}
              {streakCount >= 14 && streakCount < 30 && "🎯 Great job! Two weeks strong!"}
              {streakCount >= 7 && streakCount < 14 && "💪 One week down! Keep it up!"}
              {streakCount > 0 && streakCount < 7 && "🌟 Great start! Keep the momentum going!"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function StreakCalendar({ streakCount = 0, totalMessages = 0, lastEmailSent }) {
  const [calendarData, setCalendarData] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    generateCalendarData();
  }, [streakCount, totalMessages, lastEmailSent, currentMonth]);

  const generateCalendarData = () => {
    const data = [];
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Get first day of month and total days in month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Calculate total weeks needed
    const totalCells = Math.ceil((daysInMonth + startDayOfWeek) / 7) * 7;
    const weeks = totalCells / 7;
    
    const today = new Date();
    
    for (let week = 0; week < weeks; week++) {
      const weekData = [];
      for (let day = 0; day < 7; day++) {
        const cellIndex = week * 7 + day;
        const dayNum = cellIndex - startDayOfWeek + 1;
        
        if (dayNum < 1 || dayNum > daysInMonth) {
          // Empty cell
          weekData.push({
            date: null,
            level: -1,
            dayOfWeek: day,
            isToday: false,
            isEmpty: true
          });
        } else {
          const date = new Date(year, month, dayNum);
          
          // Determine if this day had activity
          let level = 0;
          if (lastEmailSent) {
            const lastSent = new Date(lastEmailSent);
            const daysSince = Math.floor((today - date) / (1000 * 60 * 60 * 24));
            
            // If within streak count and not in future, mark as active
            if (daysSince <= streakCount && daysSince >= 0 && date <= today) {
              level = 4; // High activity
            }
          }
          
          weekData.push({
            date: date.toISOString().split('T')[0],
            level,
            dayOfWeek: day,
            isToday: date.toDateString() === today.toDateString(),
            isEmpty: false,
            dayNum
          });
        }
      }
      data.push(weekData);
    }
    
    setCalendarData(data);
  };

  const getLevelColor = (level) => {
    if (level === -1) return "bg-transparent"; // Empty cells
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

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    const today = new Date();
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    // Don't go beyond current month
    if (nextMonth <= today) {
      setCurrentMonth(nextMonth);
    }
  };

  const goToCurrentMonth = () => {
    setCurrentMonth(new Date());
  };

  const isCurrentMonth = () => {
    const today = new Date();
    return currentMonth.getMonth() === today.getMonth() && 
           currentMonth.getFullYear() === today.getFullYear();
  };

  const getMonthYear = () => {
    return currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold">Your Motivation Streak</CardTitle>
            {streakCount > 0 && (
              <span className="text-sm font-medium text-orange-600">
                🔥 {streakCount} day{streakCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToPreviousMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {getMonthYear()}
            </span>
            {!isCurrentMonth() && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={goToCurrentMonth}
              >
                Today
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToNextMonth}
              disabled={isCurrentMonth()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Calendar Grid - GitHub Style */}
        <div className="space-y-2">
          {/* Day labels */}
          <div className="flex items-start gap-2">
            <div className="w-8 flex flex-col gap-1 text-[10px] text-muted-foreground">
              <div style={{ height: '14px' }}>Mon</div>
              <div style={{ height: '14px' }}></div>
              <div style={{ height: '14px' }}>Wed</div>
              <div style={{ height: '14px' }}></div>
              <div style={{ height: '14px' }}>Fri</div>
            </div>
            
            {/* Weeks */}
            <div className="flex gap-1 flex-1">
              {calendarData.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      className={`w-[14px] h-[14px] rounded-sm ${getLevelColor(day.level)} ${
                        day.isToday ? 'ring-1 ring-blue-500' : ''
                      } ${day.isEmpty ? '' : 'cursor-pointer transition-all hover:ring-2 hover:ring-gray-400'}`}
                      title={day.isEmpty ? '' : `${day.date}${day.level > 0 ? ' - Message received' : ' - No activity'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend and stats */}
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <div>{totalMessages} messages</div>
            <div className="flex items-center gap-1">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`w-[10px] h-[10px] rounded-sm ${getLevelColor(level)}`}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import React from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/animate-ui/components/radix/dialog";
import { ChevronLeft, ChevronRight, Mail, Calendar } from "lucide-react";
import { differenceInCalendarDays, startOfDay, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const StreakCalendar = React.memo(function StreakCalendar({
  streakCount = 0,
  totalMessages = 0,
  lastEmailSent,
  messageHistory = [],
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}) {
  const [calendarData, setCalendarData] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateMessages, setSelectedDateMessages] = useState([]);

  useEffect(() => {
    generateCalendarData();
  }, [streakCount, totalMessages, lastEmailSent, currentMonth, messageHistory, timezone]);

  const generateCalendarData = () => {
    const today = startOfDay(toZonedTime(new Date(), timezone));
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const daysInMonth = lastDay.getUTCDate();

    const activityMap = new Map();
    const messagesByDate = new Map(); // Store messages for each date
    
    messageHistory.forEach((entry) => {
      if (!entry.sent_at) return;
      const entryDate = new Date(entry.sent_at);
      const zonedDate = startOfDay(toZonedTime(entryDate, timezone));
      const key = zonedDate.toISOString().split("T")[0];
      activityMap.set(key, (activityMap.get(key) || 0) + 1);
      
      // Store messages for this date
      if (!messagesByDate.has(key)) {
        messagesByDate.set(key, []);
      }
      messagesByDate.get(key).push(entry);
    });

    const days = [];

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const utcDate = new Date(Date.UTC(year, month, dayNum));
      const zonedDate = toZonedTime(utcDate, timezone);
      const key = zonedDate.toISOString().split("T")[0];
      const messageCount = activityMap.get(key) || 0;

      let level = 0;
      if (messageCount > 0) {
        level = Math.min(4, messageCount);
      } else if (lastEmailSent) {
        const lastSent = startOfDay(toZonedTime(lastEmailSent, timezone));
        const daysSince = differenceInCalendarDays(today, zonedDate);
        if (daysSince >= 0 && daysSince < streakCount) {
          if (daysSince <= 3) level = 4;
          else if (daysSince <= 7) level = 3;
          else if (daysSince <= 14) level = 2;
          else level = 1;
        }
      }

      days.push({
        date: key,
        dayNum,
        level,
        isToday: zonedDate.toDateString() === today.toDateString(),
        messageCount,
        messages: messagesByDate.get(key) || [], // Store messages for this date
      });
    }

    setCalendarData(days);
  };

  const getLevelColor = (level) => {
    if (level === 0) return "bg-muted/30 hover:bg-muted/50";
    if (level === 1) return "bg-orange-200 hover:bg-orange-300";
    if (level === 2) return "bg-orange-300 hover:bg-orange-400";
    if (level === 3) return "bg-orange-400 hover:bg-orange-500";
    return "bg-orange-500 hover:bg-orange-600";
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    const today = new Date();
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    if (nextMonth <= today) {
      setCurrentMonth(nextMonth);
    }
  };

  const isCurrentMonth = () => {
    const today = new Date();
    return currentMonth.getMonth() === today.getMonth() && 
           currentMonth.getFullYear() === today.getFullYear();
  };

  const getMonthYear = () => {
    return currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const handleDateClick = (day) => {
    if (day.messageCount > 0) {
      setSelectedDate(day.date);
      setSelectedDateMessages(day.messages);
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return format(date, "MMMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="overflow-hidden border border-border/30 hover:border-border/50 transition-all duration-300 bg-card/50 backdrop-blur-sm">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* Title */}
        <div className="text-center">
          <h2 className="flex items-center justify-center gap-0 sm:gap-2 text-lg sm:text-xl font-bold text-foreground">
            <Calendar className="hidden sm:block h-5 w-5 text-primary" />
            Your Motivation Streak
          </h2>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={goToPreviousMonth}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground hover:text-foreground/70 transition-colors" />
          </button>
          <span className="text-sm sm:text-base font-semibold text-foreground min-w-[140px] sm:min-w-[160px] text-center flex-shrink-0">
            {getMonthYear()}
          </span>
          <button
            onClick={goToNextMonth}
            disabled={isCurrentMonth()}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors flex-shrink-0 ${
              isCurrentMonth() 
                ? 'cursor-not-allowed opacity-30' 
                : 'hover:bg-muted/50'
            }`}
            aria-label="Next month"
          >
            <ChevronRight className={`h-5 w-5 ${
              isCurrentMonth() 
                ? 'text-muted-foreground/30' 
                : 'text-muted-foreground hover:text-foreground/70'
            }`} />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="flex flex-wrap gap-[6px] justify-center max-w-3xl mx-auto">
          {calendarData.map((day, index) => (
            <div
              key={index}
              onClick={() => handleDateClick(day)}
              className={`w-10 h-10 rounded-md flex items-center justify-center text-xs font-medium transition-all duration-300 ${day.messageCount > 0 ? 'cursor-pointer' : 'cursor-default'} ${getLevelColor(day.level)} ${
                day.isToday 
                  ? 'ring-2 ring-primary/50 ring-offset-2 shadow-md scale-105' 
                  : 'shadow-sm hover:shadow-md hover:scale-105'
              }`}
              title={
                day.messageCount > 0 
                  ? `${formatDate(day.date)} - ${day.messageCount} email${day.messageCount !== 1 ? 's' : ''} sent (Click to view)` 
                  : `${formatDate(day.date)} - No activity`
              }
            >
              <span className={day.level > 0 ? 'text-white' : 'text-muted-foreground'}>
                {day.dayNum}
              </span>
            </div>
          ))}
        </div>

        {/* Date Details Dialog */}
        <Dialog open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
          <DialogContent from="top" showCloseButton={true} className="w-[95vw] max-w-md sm:max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Mail className="h-5 w-5 text-primary" />
                <span>Emails sent on {selectedDate ? formatDate(selectedDate) : ''}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {selectedDateMessages.length > 0 ? (
                <>
                  <div className="text-sm text-muted-foreground mb-4">
                    <strong>{selectedDateMessages.length}</strong> email{selectedDateMessages.length !== 1 ? 's' : ''} sent on this day
                  </div>
                  {selectedDateMessages.map((message, idx) => (
                    <Card key={message.id || idx} className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">
                            {message.sent_at ? format(new Date(message.sent_at), "h:mm a") : 'Time unknown'}
                          </div>
                          {message.personality && (
                            <div className="text-xs font-medium text-primary">
                              {message.personality.value || message.personality}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-3">
                          {message.message || message.subject || 'No message content'}
                        </p>
                        {message.streak_at_time && (
                          <div className="text-xs text-muted-foreground">
                            Streak at time: Day {message.streak_at_time}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">No emails found for this date</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Stats */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-800">{totalMessages}</span> messages
          </p>
        </div>

        {/* Color Legend */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`w-4 h-4 rounded ${getLevelColor(level).split(' ')[0]}`}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </Card>
  );
});

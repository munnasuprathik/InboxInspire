import React, { useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Trophy, Flame, Calendar, TrendingUp } from "lucide-react";
import { celebrateStreakMilestone } from "@/utils/hapticFeedback";

const MILESTONE_DATES = [7, 14, 30, 50, 100, 200, 365];

export const StreakMilestones = React.memo(function StreakMilestones({ streakCount, lastEmailSent }) {
  const previousStreakRef = useRef(streakCount || 0);
  // Detect milestone crossings and trigger haptic feedback
  useEffect(() => {
    const currentStreak = streakCount || 0;
    const previousStreak = previousStreakRef.current;
    
    // Check if we just crossed a milestone
    if (currentStreak > previousStreak) {
      const previousAchieved = MILESTONE_DATES.filter(m => m <= previousStreak);
      const currentAchieved = MILESTONE_DATES.filter(m => m <= currentStreak);
      
      // If we have new achievements, trigger celebration
      if (currentAchieved.length > previousAchieved.length) {
        // Small delay to ensure UI is updated
        setTimeout(() => {
          celebrateStreakMilestone();
        }, 300);
      }
    }
    
    // Update ref for next comparison
    previousStreakRef.current = currentStreak;
  }, [streakCount]);

  const milestones = useMemo(() => {
    const currentStreak = streakCount || 0;
    const upcoming = MILESTONE_DATES.filter(m => m > currentStreak);
    const achieved = MILESTONE_DATES.filter(m => m <= currentStreak);
    
    // Calculate next milestone
    const nextMilestone = upcoming.length > 0 ? upcoming[0] : null;
    const daysUntilNext = nextMilestone ? nextMilestone - currentStreak : null;
    
    // Calculate estimated date for next milestone
    let estimatedDate = null;
    if (nextMilestone && lastEmailSent) {
      const lastDate = new Date(lastEmailSent);
      const daysToAdd = daysUntilNext;
      estimatedDate = new Date(lastDate);
      estimatedDate.setDate(estimatedDate.getDate() + daysToAdd);
    }
    
    return {
      currentStreak,
      nextMilestone,
      daysUntilNext,
      estimatedDate,
      upcoming: upcoming.slice(0, 5), // Show next 5 milestones
      achieved: achieved.slice(-3), // Show last 3 achieved
      allAchieved: achieved.length === MILESTONE_DATES.length
    };
  }, [streakCount, lastEmailSent]);

  const getMilestoneIcon = (days) => {
    if (days >= 365) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (days >= 100) return <Flame className="h-5 w-5 text-primary" />;
    if (days >= 30) return <Target className="h-5 w-5 text-blue-500" />;
    return <Calendar className="h-5 w-5 text-green-500" />;
  };

  const getMilestoneLabel = (days) => {
    if (days >= 365) return 'Legend';
    if (days >= 200) return 'Master';
    if (days >= 100) return 'Champion';
    if (days >= 50) return 'Warrior';
    if (days >= 30) return 'Veteran';
    if (days >= 14) return 'Dedicated';
    return 'Starter';
  };

  return (
    <div className="space-y-4">
      {/* Current Streak & Next Milestone */}
      <Card className="border border-border/30 hover:border-border/50 transition-all duration-300 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center gap-0 sm:gap-2 text-lg">
            <div className="hidden sm:block p-2.5 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 shadow-sm">
              <TrendingUp className="h-5 w-5 text-primary drop-shadow-sm" />
            </div>
            <span className="gradient-text-primary">Streak Milestones</span>
          </CardTitle>
          <CardDescription>
            Track your progress and upcoming achievements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 relative z-10">
          {/* Next Milestone */}
          {milestones.nextMilestone && (
            <div className="p-5 bg-gradient-to-br from-primary/8 via-primary/5 to-accent/5 rounded-xl border-2 border-primary/20 hover:border-primary/40 transition-all duration-300 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="flex items-start justify-between mb-2 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="relative p-2.5 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm group-hover:shadow-md transition-all duration-300">
                      {getMilestoneIcon(milestones.nextMilestone)}
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {milestones.nextMilestone} Day Milestone
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getMilestoneLabel(milestones.nextMilestone)} Achievement
                    </p>
                  </div>
                </div>
                <Badge variant="default" className="bg-gradient-to-r from-primary to-primary/90 shadow-md shadow-primary/20">
                  {milestones.daysUntilNext} days to go
                </Badge>
              </div>
              {milestones.estimatedDate && (
                <p className="text-xs text-muted-foreground mt-3 pl-3 ml-1 border-l-2 border-primary/30 relative z-10">
                  Estimated date: <span className="font-medium">{milestones.estimatedDate.toLocaleDateString()}</span>
                </p>
              )}
            </div>
          )}

          {milestones.allAchieved && (
            <div className="p-6 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-orange-500/10 rounded-xl border-2 border-yellow-500/30 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/10 via-transparent to-orange-400/10 animate-pulse" />
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto bg-gradient-to-br from-yellow-400/20 to-amber-500/20 rounded-full flex items-center justify-center mb-3 shadow-lg">
                  <Trophy className="h-7 w-7 text-yellow-600 drop-shadow-sm" />
                </div>
                <p className="font-bold text-yellow-700 text-lg mb-1">Congratulations!</p>
                <p className="text-sm text-yellow-600/90">You've achieved all milestones!</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Achieved Milestones */}
      {milestones.achieved.length > 0 && (
        <Card className="border border-border/30 hover:border-border/50 transition-all duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-emerald-500/5 opacity-0 hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-lg font-semibold">Recently Achieved</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="space-y-3">
              {milestones.achieved.map((days) => (
                <div
                  key={days}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500/8 via-emerald-500/5 to-green-500/8 rounded-xl border-2 border-green-500/20 hover:border-green-500/40 transition-all duration-300 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-green-400/0 via-green-400/5 to-green-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/20 rounded-lg blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative p-2.5 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm group-hover:shadow-md transition-all duration-300">
                        {getMilestoneIcon(days)}
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{days} Day Milestone</p>
                      <p className="text-xs text-muted-foreground">{getMilestoneLabel(days)}</p>
                    </div>
                  </div>
                  <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white border-0 shadow-md shadow-green-500/20">Achieved</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Milestones */}
      {milestones.upcoming.length > 0 && (
        <Card className="border border-border/30 hover:border-border/50 transition-all duration-300 opacity-90 hover:opacity-100 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 opacity-0 hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-lg text-muted-foreground font-medium">Upcoming Milestones</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="space-y-3">
              {milestones.upcoming.map((days) => {
                const daysToGo = days - milestones.currentStreak;
                return (
                  <div
                    key={days}
                    className="flex items-center justify-between p-4 bg-muted/40 backdrop-blur-sm rounded-xl border-2 border-border/50 hover:border-primary/20 transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-background/60 border border-border/40 grayscale opacity-60 group-hover:opacity-80 group-hover:grayscale-0 transition-all duration-300">
                        {getMilestoneIcon(days)}
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">{days} Day Milestone</p>
                        <p className="text-xs text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
                          {getMilestoneLabel(days)} {daysToGo} days to go
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-muted-foreground bg-background/60 border-border/60 group-hover:border-primary/30 transition-all">
                      Locked
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});


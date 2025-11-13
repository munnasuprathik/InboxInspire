import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Trophy, Flame, Calendar, TrendingUp } from "lucide-react";

const MILESTONE_DATES = [7, 14, 30, 50, 100, 200, 365];

export const StreakMilestones = React.memo(function StreakMilestones({ streakCount, lastEmailSent }) {
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
    if (days >= 100) return <Flame className="h-5 w-5 text-orange-500" />;
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            Streak Milestones
          </CardTitle>
          <CardDescription>
            Track your progress and upcoming achievements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Next Milestone */}
          {milestones.nextMilestone && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getMilestoneIcon(milestones.nextMilestone)}
                  <div>
                    <p className="font-semibold text-blue-900">
                      {milestones.nextMilestone} Day Milestone
                    </p>
                    <p className="text-xs text-blue-700">
                      {getMilestoneLabel(milestones.nextMilestone)} Achievement
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                  {milestones.daysUntilNext} days to go
                </Badge>
              </div>
              {milestones.estimatedDate && (
                <p className="text-xs text-muted-foreground mt-2">
                  Estimated date: {milestones.estimatedDate.toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {milestones.allAchieved && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
              <Trophy className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
              <p className="font-semibold text-yellow-900">Congratulations!</p>
              <p className="text-sm text-yellow-700">You've achieved all milestones!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Achieved Milestones */}
      {milestones.achieved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recently Achieved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {milestones.achieved.map((days) => (
                <div
                  key={days}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                >
                  <div className="flex items-center gap-3">
                    {getMilestoneIcon(days)}
                    <div>
                      <p className="font-semibold text-green-900">{days} Day Milestone</p>
                      <p className="text-xs text-green-700">{getMilestoneLabel(days)}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-600">Achieved</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Milestones */}
      {milestones.upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {milestones.upcoming.map((days) => {
                const daysToGo = days - milestones.currentStreak;
                return (
                  <div
                    key={days}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 opacity-75"
                  >
                    <div className="flex items-center gap-3">
                      {getMilestoneIcon(days)}
                      <div>
                        <p className="font-semibold text-gray-700">{days} Day Milestone</p>
                        <p className="text-xs text-gray-600">
                          {getMilestoneLabel(days)} • {daysToGo} days to go
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-gray-100 text-gray-600">
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


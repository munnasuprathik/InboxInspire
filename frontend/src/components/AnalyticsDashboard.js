import { useState, useEffect, useCallback, useMemo } from "react";
import React from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, TrendingUp, Star, BarChart3, RefreshCw, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { retryWithBackoff } from "@/utils/retry";
import { cn } from "@/lib/utils";

// Use centralized API configuration
import API_CONFIG from '@/config/api';
const API = API_CONFIG.API_BASE;

export const AnalyticsDashboard = React.memo(function AnalyticsDashboard({ email, user, refreshKey = 0, onNewAchievements }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [achievements, setAchievements] = useState({ unlocked: [], locked: [] });

  const fetchAnalytics = useCallback(async (showLoading = true) => {
    if (showLoading) {
    setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const response = await retryWithBackoff(async () => {
        return await axios.get(`${API}/users/${email}/analytics`);
      });
      setAnalytics(response.data);
      setLastRefresh(new Date());
      
      // Check for new achievements and notify parent
      if (response.data.new_achievements && response.data.new_achievements.length > 0 && onNewAchievements) {
        // Use detailed achievements if available, otherwise use IDs
        const achievementData = response.data.new_achievements_details || response.data.new_achievements;
        onNewAchievements(response.data.new_achievements, response.data);
      }
      
      // Fetch achievements for highest achievement card
      try {
        const achievementsResponse = await axios.get(`${API}/users/${email}/achievements`);
        setAchievements(achievementsResponse.data);
      } catch (error) {
        // Silently fail - achievements are optional
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [email, onNewAchievements]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics, refreshKey]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnalytics(false); // Silent refresh
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchAnalytics]);


  // Early returns AFTER all hooks
  if (loading) {
    return <SkeletonLoader variant="card" count={4} />;
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero Streak Card - Enhanced with Color */}
      <Card 
        data-testid="streak-card" 
        className="border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-amber-500/3 to-transparent shadow-sm hover:shadow-md hover:border-orange-500/30 transition-all duration-300 overflow-hidden relative group"
      >
        {/* Subtle background elements */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/8 via-amber-500/4 to-transparent opacity-50 group-hover:opacity-70 transition-opacity duration-300" />
        
        <CardContent className="p-6 sm:p-8 relative">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/15 border border-orange-500/25 group-hover:from-orange-500/25 group-hover:to-amber-500/20 transition-all duration-300 shadow-sm shadow-orange-500/10 flex-shrink-0">
                <Flame className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-semibold text-orange-600/80 dark:text-orange-400/80 uppercase tracking-wider mb-1">Current Streak</h3>
                <p className="text-xs text-muted-foreground font-normal leading-relaxed">Consecutive days of motivation</p>
              </div>
            </div>
          </div>
          
          {/* Streak Number Display */}
          <div className="flex items-end gap-3 mb-8">
            <div className="relative">
              <p className="text-6xl sm:text-7xl font-bold tracking-tighter leading-none bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 bg-clip-text text-transparent">
                {analytics.streak_count}
              </p>
              {/* Pulse indicator - positioned at top-right */}
              <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-orange-500 animate-pulse shadow-lg shadow-orange-500/50 z-10" />
              <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-orange-500/30 animate-ping z-10" />
            </div>
            <p className="text-base font-medium text-orange-600/70 dark:text-orange-400/70 mb-0">days</p>
          </div>
          
          {/* Milestone Progress */}
          <div className="pt-5 border-t border-orange-500/15">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-orange-600/70 dark:text-orange-400/70 font-medium">Next milestone</span>
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                {analytics.streak_count < 7 ? 7 : analytics.streak_count < 30 ? 30 : analytics.streak_count < 100 ? 100 : '∞'} days
              </span>
            </div>
            <div className="w-full h-2 bg-orange-500/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500 rounded-full transition-all duration-700 ease-out shadow-sm shadow-orange-500/30"
                style={{ 
                  width: `${Math.min(100, analytics.streak_count < 7 
                    ? (analytics.streak_count / 7) * 100 
                    : analytics.streak_count < 30 
                    ? ((analytics.streak_count - 7) / 23) * 100 
                    : analytics.streak_count < 100
                    ? ((analytics.streak_count - 30) / 70) * 100
                    : 100)}%` 
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics - Enhanced with Visual Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Messages</p>
              </div>
            </div>
            <div className="mb-3">
              <p className="text-3xl font-bold tracking-tight text-foreground mb-1">
                {analytics.total_messages}
              </p>
              <p className="text-xs text-muted-foreground font-normal">Total received</p>
            </div>
            {/* Visual progress bar */}
            <div className="w-full h-1 bg-muted/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (analytics.total_messages / 100) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/15 transition-colors">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500/30" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rating</p>
              </div>
              {analytics.avg_rating && (
                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold",
                  analytics.avg_rating >= 4 ? "bg-green-500/10 text-green-600" :
                  analytics.avg_rating >= 3 ? "bg-yellow-500/10 text-yellow-600" :
                  "bg-red-500/10 text-red-600"
                )}>
                  {analytics.avg_rating >= 4 ? <ArrowUp className="h-3 w-3" /> : 
                   analytics.avg_rating >= 3 ? <Minus className="h-3 w-3" /> : 
                   <ArrowDown className="h-3 w-3" />}
                </div>
              )}
            </div>
            <div className="mb-3">
              <p className="text-3xl font-bold tracking-tight text-foreground mb-1">
                {analytics.avg_rating ? `${analytics.avg_rating.toFixed(1)}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground font-normal">Average score</p>
            </div>
            {/* Star rating visualization */}
            {analytics.avg_rating && (
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={cn(
                      "h-3 w-3 transition-colors",
                      star <= Math.round(analytics.avg_rating)
                        ? "text-amber-500 fill-amber-500"
                        : "text-muted-foreground/30"
                    )}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/30 hover:border-border/50 hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm group">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/15 transition-colors">
                  <BarChart3 className="h-4 w-4 text-purple-500" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Engagement</p>
              </div>
            </div>
            <div className="mb-3">
              <p className="text-3xl font-bold tracking-tight text-foreground mb-1">
                {analytics.engagement_rate}%
              </p>
              <p className="text-xs text-muted-foreground font-normal">Feedback rate</p>
            </div>
            {/* Circular progress visualization */}
            <div className="relative w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  analytics.engagement_rate >= 70 ? "bg-gradient-to-r from-green-500 to-green-400" :
                  analytics.engagement_rate >= 40 ? "bg-gradient-to-r from-yellow-500 to-yellow-400" :
                  "bg-gradient-to-r from-purple-500 to-purple-400"
                )}
                style={{ width: `${analytics.engagement_rate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personality Stats - Refined */}
      {analytics.favorite_personality && (
        <Card className="border border-border/50 hover:border-border transition-all duration-200 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Favorite Inspiration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/30">
              <div>
                <p className="text-lg font-semibold tracking-tight text-foreground">
                  {analytics.favorite_personality}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-normal">Highest rated</p>
              </div>
              <div className="p-2.5 rounded-lg bg-background/80 border border-border/30">
                <Star className="h-5 w-5 text-primary fill-primary/20" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personality Breakdown - Enhanced with Visual Bars */}
      {Object.keys(analytics.personality_stats).length > 0 && (
        <Card className="border border-border/50 hover:border-border hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Performance by Personality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {Object.entries(analytics.personality_stats)
                .sort(([, a], [, b]) => b.avg_rating - a.avg_rating)
                .map(([name, stats], index) => {
                  const ratingPercent = (stats.avg_rating / 5) * 100;
                  return (
                    <div 
                      key={name} 
                      className="flex items-center justify-between p-3.5 rounded-lg border border-border/30 hover:bg-muted/30 hover:border-border/50 transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-normal">
                            {stats.count} {stats.count === 1 ? 'message' : 'messages'}
                          </p>
                          {/* Visual rating bar */}
                          <div className="mt-2 w-full h-1 bg-muted/30 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                ratingPercent >= 80 ? "bg-gradient-to-r from-green-500 to-green-400" :
                                ratingPercent >= 60 ? "bg-gradient-to-r from-blue-500 to-blue-400" :
                                ratingPercent >= 40 ? "bg-gradient-to-r from-yellow-500 to-yellow-400" :
                                "bg-gradient-to-r from-orange-500 to-orange-400"
                              )}
                              style={{ width: `${ratingPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/5 border border-primary/10">
                          <Star className="h-4 w-4 text-primary fill-primary/30 flex-shrink-0" />
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {stats.avg_rating.toFixed(1)}
                          </span>
                        </div>
                      </div>
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
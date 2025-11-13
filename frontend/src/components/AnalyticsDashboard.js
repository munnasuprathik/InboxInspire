import { useState, useEffect, useCallback } from "react";
import React from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, TrendingUp, Star, BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { retryWithBackoff } from "@/utils/retry";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const AnalyticsDashboard = React.memo(function AnalyticsDashboard({ email, refreshKey = 0, onNewAchievements }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

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

  if (loading) {
    return <SkeletonLoader variant="card" count={4} />;
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAnalytics(false)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Your Motivation Streak - Prominent at Top */}
      <Card data-testid="streak-card" className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 shadow-lg">
          <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-orange-900">
            <Flame className="h-5 w-5 text-orange-500 animate-pulse" />
            Your Motivation Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-5xl font-bold text-orange-600">{analytics.streak_count}</p>
            <p className="text-lg text-orange-700 font-medium">days</p>
          </div>
          <p className="text-sm text-orange-600 mt-2 font-medium">🔥 Keep the fire burning!</p>
          <p className="text-xs text-muted-foreground mt-1">Consecutive days of motivation</p>
          </CardContent>
        </Card>

      {/* Other Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

        <Card data-testid="total-messages-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.total_messages}</p>
            <p className="text-xs text-muted-foreground mt-1">received so far</p>
          </CardContent>
        </Card>

        <Card data-testid="avg-rating-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              Average Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {analytics.avg_rating ? `${analytics.avg_rating}/5` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">across all messages</p>
          </CardContent>
        </Card>

        <Card data-testid="engagement-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-500" />
              Engagement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.engagement_rate}%</p>
            <p className="text-xs text-muted-foreground mt-1">feedback rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Personality Stats */}
      {analytics.favorite_personality && (
        <Card>
          <CardHeader>
            <CardTitle>Your Favorite Inspiration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
              <div>
                <p className="text-xl font-bold">{analytics.favorite_personality}</p>
                <p className="text-sm text-muted-foreground">Highest rated personality</p>
              </div>
              <Star className="h-8 w-8 text-yellow-400 fill-yellow-400" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personality Breakdown */}
      {Object.keys(analytics.personality_stats).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Personality Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.personality_stats).map(([name, stats]) => (
                <div key={name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{stats.count} messages</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">{stats.avg_rating.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
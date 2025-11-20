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
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";

// Use centralized API configuration
import API_CONFIG from '@/config/api';
const API = API_CONFIG.API_BASE;

export const AnalyticsDashboard = React.memo(function AnalyticsDashboard({ email, user, refreshKey = 0, onNewAchievements }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [achievements, setAchievements] = useState({ unlocked: [], locked: [] });
  const [messageHistory, setMessageHistory] = useState([]);

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
      
      // Fetch message history for charts
      try {
        const historyResponse = await axios.get(`${API}/users/${email}/message-history?limit=100`);
        setMessageHistory(historyResponse.data.messages || []);
      } catch (error) {
        // Silently fail - message history is optional
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

  // Prepare chart data with enhanced analytics
  const chartData = useMemo(() => {
    if (!messageHistory || messageHistory.length === 0) return { 
      activityData: [], 
      ratingData: [], 
      personalityData: [],
      weeklyTrend: [],
      engagementTrend: []
    };

    // 1. Message Activity Over Time (Last 30 days) - Enhanced with trends
    const activityMap = new Map();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    messageHistory.forEach((msg) => {
      if (msg.sent_at) {
        const date = new Date(msg.sent_at);
        if (date >= thirtyDaysAgo) {
          const dateKey = date.toISOString().split('T')[0];
          activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1);
        }
      }
    });

    const activityData = [];
    let previousCount = 0;
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const messages = activityMap.get(dateKey) || 0;
      const trend = messages > previousCount ? 'up' : messages < previousCount ? 'down' : 'same';
      activityData.push({
        date: dayName,
        fullDate: dateKey,
        messages,
        trend
      });
      previousCount = messages;
    }

    // Calculate average for reference line
    const avgMessages = activityData.reduce((sum, d) => sum + d.messages, 0) / activityData.length;

    // 2. Rating Distribution - Enhanced with percentages
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRatings = 0;
    messageHistory.forEach((msg) => {
      if (msg.rating && msg.rating >= 1 && msg.rating <= 5) {
        ratingCounts[msg.rating]++;
        totalRatings++;
      }
    });

    const ratingData = Object.entries(ratingCounts).map(([rating, count]) => ({
      rating: `${rating}★`,
      count,
      percentage: totalRatings > 0 ? ((count / totalRatings) * 100).toFixed(1) : 0
    }));

    // 3. Personality Performance - Enhanced with message count
    const personalityMap = new Map();
    messageHistory.forEach((msg) => {
      if (msg.personality) {
        const personalityName = msg.personality.value || msg.personality;
        if (!personalityMap.has(personalityName)) {
          personalityMap.set(personalityName, { total: 0, sum: 0, count: 0, ratings: [] });
        }
        const stats = personalityMap.get(personalityName);
        stats.total++;
        if (msg.rating) {
          stats.sum += msg.rating;
          stats.count++;
          stats.ratings.push(msg.rating);
        }
      }
    });

    const personalityData = Array.from(personalityMap.entries())
      .map(([name, stats]) => ({
        name: name.length > 20 ? name.substring(0, 20) + '...' : name,
        fullName: name,
        rating: stats.count > 0 ? parseFloat((stats.sum / stats.count).toFixed(1)) : 0,
        messages: stats.total,
        ratingCount: stats.count
      }))
      .sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
      .slice(0, 6); // Top 6

    // 4. Weekly Trend (Last 4 weeks)
    const weeklyMap = new Map();
    messageHistory.forEach((msg) => {
      if (msg.sent_at) {
        const date = new Date(msg.sent_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        const weekKey = weekStart.toISOString().split('T')[0];
        weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + 1);
      }
    });

    const weeklyTrend = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + (i * 7)));
      const weekKey = weekStart.toISOString().split('T')[0];
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weeklyTrend.push({
        week: `Week ${4 - i}`,
        start: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        messages: weeklyMap.get(weekKey) || 0
      });
    }

    // 5. Engagement Trend (Messages with ratings over time)
    const engagementMap = new Map();
    messageHistory.forEach((msg) => {
      if (msg.sent_at && msg.rating) {
        const date = new Date(msg.sent_at);
        if (date >= thirtyDaysAgo) {
          const dateKey = date.toISOString().split('T')[0];
          if (!engagementMap.has(dateKey)) {
            engagementMap.set(dateKey, { rated: 0, total: 0 });
          }
          const stats = engagementMap.get(dateKey);
          stats.rated++;
          stats.total++;
        }
      } else if (msg.sent_at) {
        const date = new Date(msg.sent_at);
        if (date >= thirtyDaysAgo) {
          const dateKey = date.toISOString().split('T')[0];
          if (!engagementMap.has(dateKey)) {
            engagementMap.set(dateKey, { rated: 0, total: 0 });
          }
          engagementMap.get(dateKey).total++;
        }
      }
    });

    const engagementTrend = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const stats = engagementMap.get(dateKey) || { rated: 0, total: 0 };
      engagementTrend.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        engagement: stats.total > 0 ? ((stats.rated / stats.total) * 100).toFixed(0) : 0
      });
    }

    return { 
      activityData, 
      ratingData, 
      personalityData,
      weeklyTrend,
      engagementTrend,
      avgMessages
    };
  }, [messageHistory]);


  // Early returns AFTER all hooks
  if (loading) {
    return <SkeletonLoader variant="card" count={4} />;
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Analytics Streak Card - Minimal Design */}
      <Card 
        data-testid="streak-card" 
        className="border border-border"
      >
        <CardContent className="p-6">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Current Streak</p>
            <p className="text-4xl font-semibold text-foreground mb-4">
              {analytics.streak_count}
              <span className="text-lg text-muted-foreground ml-2">days</span>
            </p>
            {/* Minimalistic Progress Line */}
            {(() => {
              const streak = analytics.streak_count || 0;
              let nextMilestone = 7;
              if (streak >= 7 && streak < 30) nextMilestone = 30;
              else if (streak >= 30 && streak < 100) nextMilestone = 100;
              else if (streak >= 100 && streak < 365) nextMilestone = 365;
              else if (streak >= 365) nextMilestone = streak + 100;
              
              const progress = streak >= nextMilestone ? 100 : (streak / nextMilestone) * 100;
              
              return (
                <div className="mt-4">
                  <div className="w-full h-0.5 bg-muted/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-foreground rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics - Enhanced with Visual Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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

      {/* Charts Section - Enhanced Dynamic Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Chart 1: Message Activity Over Time - Enhanced */}
        <Card className="border border-border/50 hover:border-border hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-foreground">Daily Activity Trend</CardTitle>
              {chartData.activityData.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Avg: {chartData.avgMessages?.toFixed(1) || 0}/day</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {chartData.activityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220} className="sm:h-[240px]">
                <AreaChart data={chartData.activityData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.3}/>
                      <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    className="sm:angle-0 sm:textAnchor-middle sm:height-auto"
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                    className="sm:w-auto"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '8px 12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value, name) => [value, 'Messages']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="messages" 
                    stroke="#3b82f6" 
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorMessages)"
                    dot={{ fill: '#3b82f6', r: 3, strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] sm:h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                No activity data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Rating Distribution - Enhanced */}
        <Card className="border border-border/50 hover:border-border hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-foreground">Rating Distribution</CardTitle>
              {chartData.ratingData.some(d => d.count > 0) && (
                <div className="text-xs text-muted-foreground">
                  {chartData.ratingData.reduce((sum, d) => sum + d.count, 0)} total ratings
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {chartData.ratingData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={220} className="sm:h-[240px]">
                <BarChart data={chartData.ratingData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis 
                    dataKey="rating" 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                    className="sm:w-auto"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '8px 12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value, name, props) => [
                      `${value} (${props.payload.percentage}%)`,
                      'Count'
                    ]}
                  />
                  <Bar 
                    dataKey="count" 
                    radius={[6, 6, 0, 0]}
                  >
                    {chartData.ratingData.map((entry, index) => {
                      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
                      return <Cell key={`cell-${index}`} fill={colors[index]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] sm:h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                No ratings available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart 3: Weekly Trend & Engagement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Weekly Message Trend */}
        {chartData.weeklyTrend.length > 0 && (
          <Card className="border border-border/50 hover:border-border hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardTitle className="text-sm font-semibold text-foreground">Weekly Message Trend</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <ResponsiveContainer width="100%" height={200} className="sm:h-[220px]">
                <BarChart data={chartData.weeklyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis 
                    dataKey="week" 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '8px 12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value, name, props) => [
                      `${value} messages`,
                      props.payload.start
                    ]}
                  />
                  <Bar 
                    dataKey="messages" 
                    fill="#8b5cf6"
                    radius={[6, 6, 0, 0]}
                  >
                    {chartData.weeklyTrend.map((entry, index) => {
                      const colors = ['#8b5cf6', '#a855f7', '#c084fc', '#d8b4fe'];
                      return <Cell key={`cell-${index}`} fill={colors[index] || '#8b5cf6'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Engagement Trend */}
        {chartData.engagementTrend.length > 0 && (
          <Card className="border border-border/50 hover:border-border hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardTitle className="text-sm font-semibold text-foreground">Engagement Rate Trend</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <ResponsiveContainer width="100%" height={200} className="sm:h-[220px]">
                <LineChart data={chartData.engagementTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    className="sm:angle-0 sm:textAnchor-middle sm:height-auto"
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '8px 12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value) => [`${value}%`, 'Engagement']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="engagement" 
                    stroke="#22c55e" 
                    strokeWidth={2.5}
                    dot={{ fill: '#22c55e', r: 3, strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, stroke: '#22c55e', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Chart 4: Personality Performance Comparison - Enhanced */}
      {chartData.personalityData.length > 0 && (
        <Card className="border border-border/50 hover:border-border hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-foreground">Top Personalities Performance</CardTitle>
              <div className="text-xs text-muted-foreground">
                Ranked by average rating
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <ResponsiveContainer width="100%" height={250} className="sm:h-[280px]">
              <BarChart data={chartData.personalityData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                <XAxis 
                  type="number"
                  domain={[0, 5]}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                  <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  width={80}
                  axisLine={false}
                  tickLine={false}
                  className="sm:w-[120px]"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    padding: '8px 12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value, name, props) => [
                    `${value}★ (${props.payload.messages} messages, ${props.payload.ratingCount} ratings)`,
                    'Avg Rating'
                  ]}
                  labelFormatter={(label) => `Personality: ${label}`}
                />
                <Bar 
                  dataKey="rating" 
                  radius={[0, 8, 8, 0]}
                >
                  {chartData.personalityData.map((entry, index) => {
                    const colors = ['#8b5cf6', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff', '#f3e8ff'];
                    return <Cell key={`cell-${index}`} fill={colors[index] || '#8b5cf6'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}


      {/* Personality Breakdown - Enhanced with Visual Bars */}
      {Object.keys(analytics.personality_stats).length > 0 && (
        <Card className="border border-border/50 hover:border-border hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <CardTitle className="text-sm font-semibold text-foreground">Performance by Personality</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
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
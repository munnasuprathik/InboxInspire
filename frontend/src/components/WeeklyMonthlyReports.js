import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@/components/animate-ui/components/headless/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingUp, Mail, Target, Award, Download, Loader2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { exportAnalytics } from "@/utils/exportData";

// Use centralized API configuration
import API_CONFIG from '@/config/api';
const API = API_CONFIG.API_BASE;

export const WeeklyMonthlyReports = React.memo(function WeeklyMonthlyReports({ email, user, refreshKey }) {
  const [weeklyData, setWeeklyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchWeeklyReport = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/users/${email}/analytics/weekly?weeks=4`);
      setWeeklyData(response.data);
    } catch (error) {
      console.error('Failed to fetch weekly report:', error);
      toast.error('Failed to load weekly report');
    }
  }, [email]);

  const fetchMonthlyReport = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/users/${email}/analytics/monthly?months=6`);
      setMonthlyData(response.data);
    } catch (error) {
      console.error('Failed to fetch monthly report:', error);
      toast.error('Failed to load monthly report');
    }
  }, [email]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchWeeklyReport(), fetchMonthlyReport()]);
      setLoading(false);
    };
    fetchData();
  }, [email, refreshKey, fetchWeeklyReport, fetchMonthlyReport]);

  // Auto-refresh every 60 seconds (less frequent since it's historical data)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWeeklyReport();
      fetchMonthlyReport();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [fetchWeeklyReport, fetchMonthlyReport]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/30 hover:border-border/50 transition-all duration-300">
      <CardHeader className="pb-3 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-0 sm:gap-2 text-lg sm:text-xl">
              <div className="hidden sm:flex p-2 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20">
                <Calendar className="h-5 w-5 text-indigo-500" />
              </div>
              Weekly & Monthly Reports
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              Activity summaries and insights
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const analytics = {
                longest_streak: user?.streak_count || 0,
                total_achievements: 0,
                unlocked_achievements: 0,
                best_day: weeklyData?.best_day || 'N/A',
                avg_messages_per_week: weeklyData?.avg_messages_per_week || 0
              };
              exportAnalytics(user, analytics);
            }}
            className="w-full sm:w-auto shadow-sm"
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="sm:inline">Export</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <TabGroup defaultValue="weekly" className="w-full">
          <TabList className="grid w-full grid-cols-2 gap-2 sm:gap-3 [&>*]:min-h-[44px] sm:[&>*]:min-h-0 [&>*]:touch-manipulation">
            <Tab value="weekly" className="text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-all duration-200 border border-border/50 data-[selected]:bg-background data-[selected]:border-primary data-[selected]:text-foreground data-[selected]:shadow-sm data-[not-selected]:bg-muted/30 data-[not-selected]:text-muted-foreground hover:bg-muted/50 flex items-center justify-center">
              Weekly Report
            </Tab>
            <Tab value="monthly" className="text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-all duration-200 border border-border/50 data-[selected]:bg-background data-[selected]:border-primary data-[selected]:text-foreground data-[selected]:shadow-sm data-[not-selected]:bg-muted/30 data-[not-selected]:text-muted-foreground hover:bg-muted/50 flex items-center justify-center">
              Monthly Report
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel value="weekly" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            {weeklyData ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/20 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total Messages</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{weeklyData.total_messages || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{weeklyData.period || 'Last 4 weeks'}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10 hover:border-green-500/20 transition-colors">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Avg Rating</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {weeklyData.avg_rating ? weeklyData.avg_rating.toFixed(1) : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {weeklyData.total_feedback || 0} feedback{weeklyData.total_feedback !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/20 transition-colors">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                      <Target className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Current Streak</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {weeklyData.streak_count || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Days in a row</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                  <h4 className="font-semibold text-sm sm:text-base mb-2">Period Summary</h4>
                  <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                    <p>Start: {weeklyData.start_date ? new Date(weeklyData.start_date).toLocaleDateString() : 'N/A'}</p>
                    <p>End: {weeklyData.end_date ? new Date(weeklyData.end_date).toLocaleDateString() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">No weekly data available</p>
            )}
            </TabPanel>

            <TabPanel value="monthly" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            {monthlyData ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:border-blue-500/20 transition-colors">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                      <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total Messages</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{monthlyData.total_messages || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{monthlyData.period || 'Last 6 months'}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/20 transition-colors">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                      <Target className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Current Streak</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {monthlyData.streak_count || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Days in a row</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                  <h4 className="font-semibold text-sm sm:text-base mb-2">Period Summary</h4>
                  <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                    <p>Start: {monthlyData.start_date ? new Date(monthlyData.start_date).toLocaleDateString() : 'N/A'}</p>
                    <p>End: {monthlyData.end_date ? new Date(monthlyData.end_date).toLocaleDateString() : 'N/A'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">No monthly data available</p>
            )}
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </CardContent>
    </Card>
  );
});


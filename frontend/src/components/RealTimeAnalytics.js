import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Zap, Clock, TrendingUp, Eye } from 'lucide-react';
import axios from 'axios';
import { formatDateTimeForTimezone } from "@/utils/timezoneFormatting";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ADMIN_TIMEZONE = "Asia/Kolkata";

export function RealTimeAnalytics({ adminToken }) {
  const [realtimeData, setRealtimeData] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [apiPerformance, setApiPerformance] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const headers = { Authorization: `Bearer ${adminToken}` };

  const fetchData = async () => {
    try {
      const [realtimeRes, logsRes, perfRes, sessionsRes] = await Promise.all([
        axios.get(`${API}/analytics/realtime?minutes=5`, { headers }),
        axios.get(`${API}/analytics/activity-logs?limit=20`, { headers }),
        axios.get(`${API}/analytics/api-performance?hours=1`, { headers }),
        axios.get(`${API}/analytics/active-sessions`, { headers })
      ]);

      setRealtimeData(realtimeRes.data);
      setActivityLogs(logsRes.data.logs);
      setApiPerformance(perfRes.data);
      setActiveSessions(sessionsRes.data.active_sessions);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch realtime data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    
    return () => clearInterval(interval);
  }, [adminToken]);

  const getActionColor = (actionType) => {
    const colors = {
      login_requested: 'bg-blue-100 text-blue-800',
      profile_update: 'bg-green-100 text-green-800',
      email_sent: 'bg-purple-100 text-purple-800',
      user_action: 'bg-indigo-100 text-indigo-800',
      admin_action: 'bg-red-100 text-red-800',
      system_event: 'bg-gray-100 text-gray-800',
    };
    return colors[actionType] || 'bg-gray-100 text-gray-800';
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    // Use IST timezone for all timestamps
    return formatDateTimeForTimezone(date, ADMIN_TIMEZONE, { includeZone: false });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity className="h-6 w-6 text-indigo-600" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Real-Time Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Last updated: {formatTimestamp(lastUpdate)}
            </p>
          </div>
        </div>
      </div>

      {/* Real-Time Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              Active Users (5min)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {realtimeData?.active_users_count || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {realtimeData?.recent_activities?.length || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-600" />
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">
              {realtimeData?.api_stats?.avg_response_time?.toFixed(0) || 0}ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4 text-purple-600" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {activeSessions.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Stream */}
      <Card>
        <CardHeader>
          <CardTitle>Live Activity Stream</CardTitle>
          <CardDescription>Real-time user actions and system events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activityLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No recent activity
              </p>
            ) : (
              activityLogs.map((log, index) => (
                <div
                  key={log.id || index}
                  className="flex items-start justify-between p-3 border rounded-lg hover:bg-slate-50 transition animate-fadeIn"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getActionColor(log.action_type)}>
                        {log.action_type}
                      </Badge>
                      {log.user_email && (
                        <span className="text-sm font-medium">{log.user_email}</span>
                      )}
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {JSON.stringify(log.details).substring(0, 100)}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(log.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Performance */}
      {apiPerformance?.api_stats && apiPerformance.api_stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>API Performance (Last Hour)</CardTitle>
            <CardDescription>Most called endpoints and their performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {apiPerformance.api_stats.slice(0, 10).map((stat, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{stat._id}</p>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Calls: {stat.total_calls}</span>
                      <span>Avg: {stat.avg_response_time.toFixed(0)}ms</span>
                      <span className={stat.error_count > 0 ? 'text-red-600' : ''}>
                        Errors: {stat.error_count}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          stat.avg_response_time < 100
                            ? 'bg-green-500'
                            : stat.avg_response_time < 500
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min((stat.avg_response_time / 1000) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active User Sessions</CardTitle>
            <CardDescription>Currently active users (last 30 min)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeSessions.slice(0, 10).map((session, index) => (
                <div
                  key={session.id || index}
                  className="flex items-center justify-between p-2 border rounded text-sm"
                >
                  <div>
                    <p className="font-medium">{session.user_email || 'Anonymous'}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.total_actions} actions • {session.pages_visited} pages
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(session.session_start)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

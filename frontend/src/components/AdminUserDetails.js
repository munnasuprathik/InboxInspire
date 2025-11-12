import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Mail, Star, Activity, Clock, TrendingUp, User, Calendar, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { formatDateTimeForTimezone, getDisplayTimezone } from "@/utils/timezoneFormatting";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function AdminUserDetails({ email, adminToken, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (email && adminToken) {
      fetchUserDetails();
    }
  }, [email, adminToken]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${adminToken}` };
      const response = await axios.get(`${API}/admin/users/${encodeURIComponent(email)}/details`, { headers });
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch user details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
          <p className="text-center text-muted-foreground">Failed to load user details</p>
          <Button onClick={onClose} className="mt-4 w-full">Close</Button>
        </div>
      </div>
    );
  }

  const { user, messages, feedbacks, email_logs, activities, analytics, history } = data;
  const timezone = user?.schedule?.timezone;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">User Details</h2>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b px-6">
          <div className="flex gap-4 overflow-x-auto">
            {['overview', 'messages', 'feedback', 'logs', 'activities', 'history'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 border-b-2 font-medium text-sm transition ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-muted-foreground hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* User Info */}
              <Card>
                <CardHeader>
                  <CardTitle>User Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{user?.name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{user?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge className={user?.active ? 'bg-green-500' : 'bg-gray-400'}>
                        {user?.schedule?.paused ? 'Paused' : user?.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Streak</p>
                      <p className="font-medium">{user?.streak_count || 0} days</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Messages</p>
                      <p className="font-medium">{user?.total_messages_received || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {user?.created_at
                          ? formatDateTimeForTimezone(user.created_at, timezone, { includeZone: true })
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {user?.goals && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Goals</p>
                      <p className="text-sm">{user.goals}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Analytics */}
              {analytics && (
                <Card>
                  <CardHeader>
                    <CardTitle>Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Rating</p>
                        <p className="text-2xl font-bold text-yellow-600">{analytics.avg_rating || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Engagement</p>
                        <p className="text-2xl font-bold text-green-600">{analytics.engagement_rate || 0}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Messages</p>
                        <p className="text-2xl font-bold">{analytics.total_messages || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Favorite Personality</p>
                        <p className="text-lg font-medium">{analytics.favorite_personality || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="space-y-3">
              {messages && messages.length > 0 ? (
                messages.map((msg) => (
                  <Card key={msg.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge>{msg.personality?.value || 'Unknown'}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTimeForTimezone(msg.sent_at, timezone, { includeZone: true })}
                            </span>
                          </div>
                          <p className="text-sm line-clamp-3">{msg.message}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No messages found</p>
              )}
            </div>
          )}

          {activeTab === 'feedback' && (
            <div className="space-y-3">
              {feedbacks && feedbacks.length > 0 ? (
                feedbacks.map((fb) => (
                  <Card key={fb.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < fb.rating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                            <Badge>{fb.personality?.value || 'Unknown'}</Badge>
                          </div>
                          {fb.feedback_text && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Feedback Message:</p>
                              <p className="text-sm bg-gray-50 p-2 rounded border">{fb.feedback_text}</p>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeForTimezone(fb.created_at, timezone, { includeZone: true })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No feedback found</p>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3">
              {email_logs && email_logs.length > 0 ? (
                email_logs.map((log) => (
                  <Card key={log.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}>
                              {log.status}
                            </Badge>
                            <p className="text-sm font-medium">{log.subject}</p>
                          </div>
                          {log.error_message && (
                            <p className="text-xs text-red-600">Error: {log.error_message}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeForTimezone(log.sent_at || log.local_sent_at, timezone, { includeZone: true })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No logs found</p>
              )}
            </div>
          )}

          {activeTab === 'activities' && (
            <div className="space-y-3">
              {activities && activities.length > 0 ? (
                activities.map((activity) => (
                  <Card key={activity.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge>{activity.action_type}</Badge>
                            <Badge variant="outline">{activity.action_category}</Badge>
                          </div>
                          {activity.details && Object.keys(activity.details).length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {JSON.stringify(activity.details).substring(0, 150)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeForTimezone(activity.timestamp, timezone, { includeZone: true })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No activities found</p>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {history && Object.keys(history).length > 0 ? (
                Object.entries(history).map(([key, value]) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle className="text-lg">{key.replace('_', ' ').toUpperCase()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs overflow-x-auto bg-slate-50 p-3 rounded">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No history found</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


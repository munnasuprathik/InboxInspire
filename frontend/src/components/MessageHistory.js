import { useState, useEffect, useMemo, useCallback } from "react";
import React from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { Input } from "@/components/ui/input";
import { Star, MessageSquare, Loader2, User, Clock, Search, X, Heart, Download, Reply, CheckCircle2, Filter, Calendar, Grid3x3, List, Archive } from "lucide-react";
import { SwipeableMessageCard } from "./SwipeableMessageCard";
import { exportMessageHistory } from "@/utils/exportData";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/animate-ui/components/radix/dialog";
import { formatDateTimeForTimezone } from "@/utils/timezoneFormatting";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { retryWithBackoff } from "@/utils/retry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Use centralized API configuration
import API_CONFIG from '@/config/api';
const API = API_CONFIG.API_BASE;

// Log API config for debugging
if (process.env.NODE_ENV === 'development') {
  console.log('MessageHistory API:', API);
}

export const MessageHistory = React.memo(function MessageHistory({ email, timezone, refreshKey = 0, onFeedbackSubmitted }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filterRating, setFilterRating] = useState(null);
  const [favoriteMessages, setFavoriteMessages] = useState([]);
  const [stats, setStats] = useState({ sent_count: 0, reply_count: 0 });
  const [viewMode, setViewMode] = useState('swipe'); // 'list' | 'swipe' - Default to swipe for better UX
  const [archivedMessages, setArchivedMessages] = useState([]);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check if API is configured
      if (!API || API === '/api') {
        console.error('API not configured. Backend URL:', API_CONFIG.BACKEND_URL);
        toast.error("Backend API not configured. Please check your environment variables.");
        setLoading(false);
        return;
      }
      
      const response = await retryWithBackoff(async () => {
        // URL encode email to handle special characters
        const encodedEmail = encodeURIComponent(email);
        return await axios.get(`${API}/users/${encodedEmail}/message-history`, {
          timeout: 10000,
        });
      });
      setMessages(response.data.messages || []);
      setStats({
        sent_count: response.data.sent_count || 0,
        reply_count: response.data.reply_count || 0
      });
    } catch (error) {
      console.error('Fetch messages error:', error);
      if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
        toast.error(`Cannot connect to backend at ${API_CONFIG.BACKEND_URL}. Is the server running?`);
      } else {
        toast.error(error.response?.data?.detail || "Failed to load messages");
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  const fetchFavorites = useCallback(async () => {
    try {
      // URL encode email to handle special characters
      const encodedEmail = encodeURIComponent(email);
      const user = await axios.get(`${API}/users/${encodedEmail}`);
      setFavoriteMessages(user.data.favorite_messages || []);
    } catch (error) {
      // Silently fail - favorites are optional
      console.error('Failed to fetch favorites:', error);
    }
  }, [email]);

  useEffect(() => {
    fetchMessages();
    fetchFavorites();
  }, [email, refreshKey, fetchMessages, fetchFavorites]);

  // Note: Auto-refresh is handled by parent component to prevent multiple overlapping refreshes

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleFavorite = async (messageId) => {
    try {
      // Check if API is configured
      if (!API || API === '/api') {
        const backendUrl = API_CONFIG.BACKEND_URL || 'http://localhost:8000';
        toast.error(`Backend API not configured. Expected: ${backendUrl}/api`);
        throw new Error("API not configured");
      }

      // URL encode email and messageId to handle special characters
      const encodedEmail = encodeURIComponent(email);
      const encodedMessageId = encodeURIComponent(messageId);
      const apiUrl = `${API}/users/${encodedEmail}/messages/${encodedMessageId}/favorite`;
      
      console.log('Calling favorite API:', apiUrl);
      console.log('Email:', email, 'MessageId:', messageId);

      const response = await axios.post(
        apiUrl,
        {},
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status < 500, // Don't throw on 4xx errors
        }
      );
      
      // Check for error response
      if (response.status >= 400) {
        throw new Error(response.data?.detail || `Server returned ${response.status}`);
      }
      
      const isFavorite = response.data.is_favorite;
      
      setFavoriteMessages(prev => {
        if (isFavorite) {
          // Add to favorites if not already there
          if (!prev.includes(messageId)) {
            return [...prev, messageId];
          }
          return prev;
        } else {
          // Remove from favorites
          return prev.filter(id => id !== messageId);
        }
      });
      
      toast.success(isFavorite ? "Added to favorites" : "Removed from favorites");
      return response.data; // Return the response so the card can use it
    } catch (error) {
      console.error("Favorite error details:", {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
        url: apiUrl,
        email: email,
        messageId: messageId
      });
      
      // Better error messages
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        toast.error("Request timed out. Please check your connection and ensure the backend is running.");
      } else if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
        const backendUrl = API_CONFIG.BACKEND_URL || 'http://localhost:8000';
        console.error('Network Error Details:', {
          backendUrl,
          apiUrl,
          errorCode: error.code,
          errorMessage: error.message,
          stack: error.stack
        });
        toast.error(
          `Cannot connect to backend at ${backendUrl}. ` +
          "Please check: 1) Backend is running, 2) CORS is configured, 3) URL is correct. " +
          "Check browser console for details.",
          { duration: 10000 }
        );
      } else if (error.response) {
        // Server responded with error
        const errorDetail = error.response?.data?.detail || error.response?.data?.message || `Status ${error.response.status}`;
        toast.error(`Failed to update favorite: ${errorDetail}`);
        console.error('Server error response:', error.response.data);
      } else {
        toast.error(`Failed to update favorite: ${error.message || 'Unknown error'}`);
      }
      
      throw error; // Re-throw so the card can handle the error
    }
  };

  const handleArchive = (messageId) => {
    setArchivedMessages(prev => [...prev, messageId]);
    toast.success("Message archived");
  };

  const handleUnarchive = (messageId) => {
    setArchivedMessages(prev => prev.filter(id => id !== messageId));
    toast.success("Message unarchived");
  };

  // Group messages with their replies
  const groupedMessages = useMemo(() => {
    const sentMessages = messages.filter(m => m.type === "sent");
    const replyMessages = messages.filter(m => m.type === "reply");
    
    const repliesMap = new Map();
    replyMessages.forEach(reply => {
      const linkedMessageId = reply.linked_message_id;
      if (linkedMessageId) {
        if (!repliesMap.has(linkedMessageId)) {
          repliesMap.set(linkedMessageId, []);
        }
        repliesMap.get(linkedMessageId).push(reply);
      } else {
        const replyTime = new Date(reply.sent_at);
        const matchingMessage = sentMessages
          .filter(m => {
            const msgTime = new Date(m.sent_at);
            return msgTime < replyTime;
          })
          .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
        
        if (matchingMessage) {
          if (!repliesMap.has(matchingMessage.id)) {
            repliesMap.set(matchingMessage.id, []);
          }
          repliesMap.get(matchingMessage.id).push(reply);
        }
      }
    });
    
    repliesMap.forEach((replies, msgId) => {
      replies.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    });
    
    const grouped = sentMessages.map(msg => ({
      ...msg,
      replies: (repliesMap.get(msg.id) || []).sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
    })).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    
    return grouped;
  }, [messages]);

  // Filter and search messages
  const filteredMessages = useMemo(() => {
    return groupedMessages.filter((group) => {
      const message = group;
      const matchesSearch = !debouncedSearchQuery || 
        message.message?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        message.personality?.value?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        message.subject?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (message.replies?.some(r => r.message?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())));
      
      const matchesRating = filterRating === null || message.rating === filterRating;
      const notArchived = !archivedMessages.includes(message.id);
      
      return matchesSearch && matchesRating && notArchived;
    });
  }, [groupedMessages, debouncedSearchQuery, filterRating, archivedMessages]);

  // Group messages by date
  const messagesByDate = useMemo(() => {
    const groups = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);

    filteredMessages.forEach((message) => {
      const msgDate = new Date(message.sent_at);
      const msgDateOnly = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
      
      let groupKey;
      if (msgDateOnly.getTime() === today.getTime()) {
        groupKey = 'Today';
      } else if (msgDateOnly.getTime() === yesterday.getTime()) {
        groupKey = 'Yesterday';
      } else if (msgDate >= thisWeek) {
        groupKey = 'This Week';
      } else if (msgDate >= thisMonth) {
        groupKey = 'This Month';
      } else {
        groupKey = msgDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(message);
    });

    // Sort groups by date (most recent first)
    const sortedGroups = Object.entries(groups).sort((a, b) => {
      const order = ['Today', 'Yesterday', 'This Week', 'This Month'];
      const aIndex = order.indexOf(a[0]);
      const bIndex = order.indexOf(b[0]);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return new Date(b[1][0].sent_at) - new Date(a[1][0].sent_at);
    });

    return sortedGroups;
  }, [filteredMessages]);

  const submitFeedback = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setSubmitting(true);
    try {
      // URL encode email to handle special characters
      const encodedEmail = encodeURIComponent(email);
      await axios.post(`${API}/users/${encodedEmail}/feedback`, {
        message_id: selectedMessage?.id,
        rating,
        feedback_text: feedbackText,
        personality: selectedMessage?.personality,
      });
      toast.success("Thank you for your feedback!");
      setSelectedMessage(null);
      setRating(0);
      setFeedbackText("");
      fetchMessages();
      if (typeof onFeedbackSubmitted === "function") {
        onFeedbackSubmitted();
      }
    } catch (error) {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonLoader variant="card" count={3} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card className="border border-border/30 bg-card/50 backdrop-blur-sm">
        <CardContent className="py-20 text-center">
          <div className="flex flex-col items-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/30 flex items-center justify-center mb-5">
              <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">No messages yet</h3>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Your first motivational message is coming soon! Make sure your schedule is active in Settings.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards - Compact Design with Visual Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-2">
          <Card className="border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-400/3 hover:border-blue-500/30 hover:shadow-md transition-all duration-300 group">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors">
                    <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                  </div>
                  <p className="text-xs font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase tracking-wider">Total Messages</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-3xl font-bold tracking-tight text-foreground">{stats.sent_count}</p>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-blue-500/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (stats.sent_count / 100) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">All time</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-green-500/20 bg-gradient-to-br from-green-500/5 to-green-400/3 hover:border-green-500/30 hover:shadow-md transition-all duration-300 group">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-green-500/10 border border-green-500/20 group-hover:bg-green-500/15 transition-colors">
                    <Reply className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                  </div>
                  <p className="text-xs font-semibold text-green-600/70 dark:text-green-400/70 uppercase tracking-wider">Replies</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-3xl font-bold tracking-tight text-foreground">{stats.reply_count}</p>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-green-500/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${stats.sent_count > 0 ? Math.min(100, (stats.reply_count / stats.sent_count) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {stats.sent_count > 0 ? `${Math.round((stats.reply_count / stats.sent_count) * 100)}% rate` : 'No replies'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-purple-400/3 hover:border-purple-500/30 hover:shadow-md transition-all duration-300 group">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/15 transition-colors">
                    <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
                  </div>
                  <p className="text-xs font-semibold text-purple-600/70 dark:text-purple-400/70 uppercase tracking-wider">Showing</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-3xl font-bold tracking-tight text-foreground">{filteredMessages.length}</p>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-purple-500/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${messages.length > 0 ? Math.min(100, (filteredMessages.length / messages.length) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {filteredMessages.length === messages.length ? 'All' : 'Filtered'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      {/* Archived Messages Section */}
      {archivedMessages.length > 0 && (
        <Card className="border border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-red-500/5">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-semibold text-foreground">Archived Messages</p>
                  <p className="text-sm text-muted-foreground">{archivedMessages.length} message{archivedMessages.length !== 1 ? 's' : ''} archived</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setArchivedMessages([])}
                className="h-9"
              >
                Clear All
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {messages.filter(m => archivedMessages.includes(m.id)).map((message) => (
                <div
                  key={message.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {message.personality?.value || "Unknown"} - {formatDateTimeForTimezone(message.sent_at, timezone)}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                      {message.message?.substring(0, 100)}...
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnarchive(message.id)}
                    className="ml-2 h-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      <Card className="border border-border/30 hover:border-border/50 transition-all duration-300">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                placeholder="Search messages, personalities, or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground/70 transition-colors"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              )}
            </div>

            {/* Rating Filter */}
            <Select value={filterRating?.toString() || "all"} onValueChange={(value) => setFilterRating(value === "all" ? null : Number(value))}>
              <SelectTrigger className="w-full sm:w-[180px] h-10">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Star className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <SelectValue placeholder="Filter by rating" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4">4 Stars</SelectItem>
                <SelectItem value="3">3 Stars</SelectItem>
                <SelectItem value="2">2 Stars</SelectItem>
                <SelectItem value="1">1 Star</SelectItem>
                <SelectItem value="0">Unrated</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode Toggle - Enhanced */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex items-center gap-2 border-2 border-border/60 rounded-lg p-1 bg-muted/50 backdrop-blur-sm shadow-sm">
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-2 text-sm font-medium",
                    viewMode === 'list'
                      ? "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground/70 hover:bg-background/50"
                  )}
                  title="List View"
                >
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  onClick={() => setViewMode('swipe')}
                  className={cn(
                    "px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-2 text-sm font-medium relative",
                    viewMode === 'swipe'
                      ? "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground/70 hover:bg-background/50"
                  )}
                  title="Swipe View - Swipe right to favorite, left to archive"
                >
                  <Grid3x3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Swipe</span>
                  {viewMode === 'swipe' && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                </button>
              </div>
              {viewMode === 'swipe' && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-primary/5 px-2 py-1 rounded-md border border-primary/20">
                  <Heart className="h-3 w-3 text-green-500" />
                  <span className="hidden sm:inline">Swipe right</span>
                  <span className="sm:hidden">→</span>
                  <span className="hidden sm:inline">•</span>
                  <Archive className="h-3 w-3 text-orange-500" />
                  <span className="hidden sm:inline">Swipe left</span>
                  <span className="sm:hidden">←</span>
                </div>
              )}
            </div>

            {/* Export Button */}
            <Button
              variant="outline"
              onClick={() => exportMessageHistory(messages)}
              className="h-11 sm:h-10 shrink-0 touch-manipulation"
            >
              <Download className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Messages List */}
      {filteredMessages.length === 0 && messages.length > 0 ? (
        <Card className="border border-border/30 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/30 flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-base font-semibold mb-1.5 text-foreground">No messages found</p>
              <p className="text-sm text-muted-foreground leading-relaxed">Try adjusting your search or filter criteria.</p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'swipe' ? (
        /* Swipeable Cards View */
        <div className="space-y-6">
          {/* Swipe View Header Banner */}
          <Card className="border-2 border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
                    <Grid3x3 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Swipe Mode Active</h3>
                    <p className="text-sm text-muted-foreground">Drag cards left or right to interact</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-9"
                >
                  <List className="h-4 w-4 mr-2" />
                  Switch to List
                </Button>
              </div>
            </CardContent>
          </Card>

          {messagesByDate.map(([dateGroup, messages]) => (
            <div key={dateGroup} className="space-y-6">
              {/* Date Group Header */}
              <div className="flex items-center gap-2 sm:gap-3 sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2 -mt-2">
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 flex-shrink-0">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{dateGroup}</span>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">{messages.length}</Badge>
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
              
              {/* Swipeable Cards Stack */}
              <div className="space-y-6 max-w-2xl mx-auto relative px-4">
                {messages.length === 0 ? (
                  <Card className="border border-border/30 bg-card/50 backdrop-blur-sm">
                    <CardContent className="py-20 text-center">
                      <div className="flex flex-col items-center">
                        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border/30 flex items-center justify-center mb-5">
                          <Grid3x3 className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2 text-foreground">No messages to swipe</h3>
                        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                          All messages in this group have been archived or filtered out.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  messages.map((message, index) => {
                    const hasReplies = message.replies && message.replies.length > 0;
                    const isFavorite = favoriteMessages.includes(message.id);
                    const remainingCount = messages.length - index;
                    
                    return (
                      <div key={message.id} className="relative">
                        {/* Card Counter */}
                        {index === 0 && messages.length > 1 && (
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-20">
                            <Badge variant="outline" className="bg-background/90 backdrop-blur-sm border-primary/30">
                              {remainingCount} more
                            </Badge>
                          </div>
                        )}
                        
                        <SwipeableMessageCard
                          key={message.id}
                          message={message}
                          isFavorite={isFavorite}
                          onFavorite={async (messageId) => {
                            try {
                              await toggleFavorite(messageId);
                              // Refresh favorites after toggling
                              await fetchFavorites();
                            } catch (error) {
                              // Error already handled in toggleFavorite
                            }
                          }}
                          onArchive={handleArchive}
                          timezone={timezone}
                          hasReplies={hasReplies}
                          onRate={(msg) => {
                            setSelectedMessage(msg);
                            setRating(msg.rating || 0);
                            setFeedbackText("");
                          }}
                          onViewReplies={(msg) => {
                            // Could open a dialog or expand to show replies
                            toast.info(`${msg.replies?.length || 0} replies available`);
                          }}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-6">
          {messagesByDate.map(([dateGroup, messages]) => (
            <div key={dateGroup} className="space-y-4">
              {/* Date Group Header */}
              <div className="flex items-center gap-2 sm:gap-3 sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2 -mt-2">
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 flex-shrink-0">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{dateGroup}</span>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">{messages.length}</Badge>
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
              
              {/* Messages in this date group */}
              {messages.map((message) => {
            const hasReplies = message.replies && message.replies.length > 0;
            const isFavorite = favoriteMessages.includes(message.id);
            
            return (
              <div key={message.id} className="space-y-3">
                {/* Main Message Card */}
                <Card 
                  data-testid="message-history-item" 
                  className={cn(
                    "group hover:shadow-md transition-all duration-300 border border-border/30 hover:border-border/50",
                    hasReplies && "border-2 border-border/40"
                  )}
                >
                  <CardHeader className="pb-3 sm:pb-4">
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 mb-2.5 sm:mb-3">
                          <div className="p-1.5 sm:p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors flex-shrink-0">
                            <User className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg font-semibold mb-1 leading-tight">
                              {message.personality?.value || "Unknown Personality"}
                            </CardTitle>
                            <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-muted-foreground">
                              <Clock className="h-4 w-4 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">{formatDateTimeForTimezone(message.sent_at, timezone)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mt-1">
                          {hasReplies && (
                            <Badge variant="outline" className="gap-1 sm:gap-1.5 text-xs items-center">
                              <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                              <span>{message.replies.length === 1 ? 'Replied' : `${message.replies.length} replies`}</span>
                            </Badge>
                          )}
                          {message.used_fallback && (
                            <Badge variant="outline" className="text-xs">Backup</Badge>
                          )}
                          {message.rating && (
                            <div className="flex items-center gap-0.5 sm:gap-1">
                              {[...Array(message.rating)].map((_, i) => (
                                <Star key={i} className="h-3 w-3 sm:h-4 sm:w-4 fill-foreground text-foreground flex-shrink-0" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleFavorite(message.id)}
                          className="h-9 w-9 sm:h-9 sm:w-9 touch-manipulation"
                        >
                          <Heart
                            className={cn(
                              "h-4 w-4 sm:h-5 sm:w-5 transition-colors",
                              isFavorite ? "fill-foreground text-foreground" : "text-muted-foreground hover:text-foreground/70"
                            )}
                          />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 sm:space-y-4 pt-0">
                    {/* Message Content */}
                    <div className="rounded-lg p-3 sm:p-4 bg-muted/50 border border-border">
                      <p className="message-content text-sm leading-relaxed whitespace-pre-wrap text-foreground break-words">
                        {message.message}
                      </p>
                    </div>

                    {/* Rate Button */}
                    <Dialog open={selectedMessage?.id === message.id} onOpenChange={(open) => !open && setSelectedMessage(null)}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedMessage(message);
                            setRating(message.rating || 0);
                            setFeedbackText("");
                          }}
                          data-testid="rate-message-btn"
                          className="w-full sm:w-auto h-11 sm:h-9 touch-manipulation"
                        >
                          <Star className={cn("h-4 w-4 sm:h-5 sm:w-5", message.rating && "fill-foreground text-foreground")} />
                          {message.rating ? 'Update Rating' : 'Rate This Message'}
                        </Button>
                      </DialogTrigger>
                      <DialogContent from="top" showCloseButton={true} className="w-[95vw] max-w-md sm:max-w-[500px] p-5 sm:p-6 max-h-[90vh] overflow-y-auto rounded-2xl">
                        <DialogHeader className="pb-2">
                          <DialogTitle className="text-xl sm:text-2xl text-center">Rate This Message</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 pt-2">
                          <div className="text-center">
                            <label className="text-base font-medium mb-4 block text-muted-foreground">How inspiring was this message?</label>
                            <div className="flex gap-1.5 justify-center touch-none py-2 flex-nowrap w-full overflow-x-hidden">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => setRating(star)}
                                  className="transition-transform hover:scale-110 active:scale-100 p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full flex-shrink-0"
                                  type="button"
                                >
                                  <Star 
                                    className={cn(
                                      "h-8 w-8 sm:h-10 sm:w-10 transition-colors duration-200",
                                      star <= rating 
                                        ? 'fill-amber-400 text-amber-400' 
                                        : 'text-muted-foreground/20 hover:text-amber-400/50'
                                    )}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium block">Additional Feedback (Optional)</label>
                            <Textarea
                              placeholder="What did you like or what could be improved?"
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              rows={4}
                              className="resize-none text-base min-h-[120px] p-3"
                            />
                          </div>
                          <Button 
                            onClick={submitFeedback} 
                            disabled={submitting || rating === 0}
                            className="w-full h-12 sm:h-11 text-base font-medium shadow-sm mt-2 touch-manipulation"
                          >
                            {submitting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Submitting...
                              </>
                            ) : (
                              'Submit Feedback'
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
                
                {/* Replies Section */}
                {hasReplies && (
                  <div className="ml-0 sm:ml-8 space-y-3 pl-0 sm:pl-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                      <Reply className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                        {message.replies.length === 1 ? 'Your Reply' : 'Your Replies'}
                      </span>
                    </div>
                    {message.replies.map((reply) => (
                      <Card 
                        key={reply.id}
                        className="bg-muted/30 border-border hover:shadow-md transition-shadow"
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <div className="p-1.5 rounded-lg bg-muted flex-shrink-0">
                                <Reply className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-xs sm:text-sm font-semibold">Your Reply</CardTitle>
                                <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground mt-0.5">
                                  <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                                  <span className="truncate">{formatDateTimeForTimezone(reply.sent_at, timezone)}</span>
                                </div>
                              </div>
                            </div>
                            {reply.reply_sentiment && (
                              <Badge variant="outline" className="text-xs">
                                {reply.reply_sentiment}
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="rounded-lg p-3 bg-background border border-border">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                              {reply.message}
                            </p>
                          </div>
                          
                          {/* Insights */}
                          {(reply.extracted_wins?.length > 0 || reply.extracted_struggles?.length > 0) && (
                            <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                              <p className="text-xs font-semibold text-foreground mb-2">Insights</p>
                              {reply.extracted_wins?.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-xs font-medium text-foreground mb-1">Wins</p>
                                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                                    {reply.extracted_wins.map((win, idx) => (
                                      <li key={idx}>{win}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {reply.extracted_struggles?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-foreground mb-1">Struggles</p>
                                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                                    {reply.extracted_struggles.map((struggle, idx) => (
                                      <li key={idx}>{struggle}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

import { useState, useEffect, useMemo, useCallback } from "react";
import React from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, MessageSquare, Loader2, User, Clock, Search, X, Heart, Download } from "lucide-react";
import { exportMessageHistory } from "@/utils/exportData";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDateTimeForTimezone } from "@/utils/timezoneFormatting";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { retryWithBackoff } from "@/utils/retry";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await retryWithBackoff(async () => {
        return await axios.get(`${API}/users/${email}/message-history`);
      });
      const sorted = [...response.data.messages].sort(
        (a, b) => new Date(b.sent_at) - new Date(a.sent_at),
      );
      setMessages(sorted);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const fetchFavorites = useCallback(async () => {
    try {
      const user = await axios.get(`${API}/users/${email}`);
      setFavoriteMessages(user.data.favorite_messages || []);
    } catch (error) {
      // Silently fail - favorites are optional
    }
  }, [email]);

  useEffect(() => {
    fetchMessages();
    fetchFavorites();
  }, [email, refreshKey, fetchMessages, fetchFavorites]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages();
      fetchFavorites();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchMessages, fetchFavorites]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleFavorite = async (messageId) => {
    try {
      const response = await axios.post(`${API}/users/${email}/messages/${messageId}/favorite`);
      setFavoriteMessages(prev => {
        if (response.data.is_favorite) {
          return [...prev, messageId];
        } else {
          return prev.filter(id => id !== messageId);
        }
      });
      toast.success(response.data.is_favorite ? "Added to favorites" : "Removed from favorites");
    } catch (error) {
      toast.error("Failed to update favorite");
    }
  };

  // Filter and search messages - MUST be called before any early returns
  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      const matchesSearch = !debouncedSearchQuery || 
        message.message?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        message.personality?.value?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        message.subject?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      
      const matchesRating = filterRating === null || message.rating === filterRating;
      
      return matchesSearch && matchesRating;
    });
  }, [messages, debouncedSearchQuery, filterRating]);

  const submitFeedback = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/users/${email}/feedback`, {
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
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#6B4EFF] mb-3" />
            <p className="text-sm text-muted-foreground">Loading your message history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="flex flex-col items-center">
            <MessageSquare className="h-16 w-16 text-slate-300 mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">No messages yet</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Your first motivational message is coming soon! Make sure your schedule is active in Settings.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold">Your Message History</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {filteredMessages.length} of {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportMessageHistory(messages)}
            className="flex-shrink-0"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={filterRating || ""}
            onChange={(e) => setFilterRating(e.target.value ? Number(e.target.value) : null)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="">All Ratings</option>
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
            <option value="0">Unrated</option>
          </select>
        </div>
      </div>
      {filteredMessages.length === 0 && messages.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No messages match your search criteria.</p>
          </CardContent>
        </Card>
      ) : (
        filteredMessages.map((message) => (
        <Card key={message.id} data-testid="message-history-item" className="hover:shadow-md transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <User className="h-4 w-4 text-[#6B4EFF] flex-shrink-0" />
                  <CardTitle className="text-base sm:text-lg truncate min-w-0">From {message.personality?.value || "Unknown"}</CardTitle>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatDateTimeForTimezone(message.sent_at, timezone)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleFavorite(message.id)}
                  className="h-8 w-8 p-0"
                >
                  <Heart
                    className={`h-4 w-4 ${
                      favoriteMessages.includes(message.id)
                        ? "fill-red-500 text-red-500"
                        : "text-gray-400"
                    }`}
                  />
                </Button>
                {message.used_fallback && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    Backup
                  </span>
                )}
                {message.rating && (
                  <div className="flex items-center gap-1">
                    {[...Array(message.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border-l-2 border-[#6B4EFF]">
              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
                {message.message}
              </p>
            </div>
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
                  className="w-full sm:w-auto min-h-[44px]"
                >
                  <Star className="h-4 w-4 mr-2" />
                  {message.rating ? 'Update Rating' : 'Rate This Message'}
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:w-full p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl">Rate This Message</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 sm:space-y-6 pt-3 sm:pt-4">
                  <div>
                    <label className="text-sm sm:text-base font-medium mb-3 sm:mb-2 block">How inspiring was this message?</label>
                    <div className="flex gap-2 sm:gap-3 justify-center sm:justify-start">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className="transition-transform hover:scale-110 active:scale-95 touch-manipulation min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                          data-testid={`star-${star}`}
                        >
                          <Star 
                            className={`h-10 w-10 sm:h-8 sm:w-8 ${
                              star <= rating 
                                ? 'fill-yellow-400 text-yellow-400' 
                                : 'text-gray-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm sm:text-base font-medium mb-2 block">Additional Feedback (Optional)</label>
                    <Textarea
                      placeholder="What did you like or what could be improved?"
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      rows={4}
                      className="min-h-[100px] sm:min-h-[80px]"
                    />
                  </div>
                  <Button 
                    onClick={submitFeedback} 
                    disabled={submitting || rating === 0}
                    className="w-full min-h-[44px] sm:min-h-0 bg-[#6B4EFF] hover:bg-[#5B3EEF] active:bg-[#4B2EDF]"
                    data-testid="submit-feedback-btn"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                        <span className="sm:inline">Submitting...</span>
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
      )))}
    </div>
  );
});
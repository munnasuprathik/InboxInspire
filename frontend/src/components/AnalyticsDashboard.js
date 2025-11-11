import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, TrendingUp, Star, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function AnalyticsDashboard({ email, refreshKey = 0 }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API}/users/${email}/analytics`);
        setAnalytics(response.data);
      } catch (error) {
        toast.error("Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };

    try {
      fetchAnalytics();
    } catch (error) {
      // error display handled in fetchAnalytics
    }
  }, [email, refreshKey]);

  if (loading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="streak-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Current Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.streak_count}</p>
            <p className="text-xs text-muted-foreground mt-1">consecutive days</p>
          </CardContent>
        </Card>

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
}
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, Sparkles, X, CheckCircle, Flame, Zap, Star, Target, Award, Mail, BookOpen, Book } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const getAchievementIcon = (iconName) => {
  const iconMap = {
    "Sprout": CheckCircle,
    "Flame": Flame,
    "Zap": Zap,
    "Trophy": Trophy,
    "Mail": Mail,
    "BookOpen": BookOpen,
    "Book": Book,
    "Star": Star,
    "Target": Target,
    "Award": Award,
  };
  const IconComponent = iconMap[iconName] || Trophy;
  return <IconComponent className="h-12 w-12" />;
};

export function AchievementCelebration({ achievements, open, onClose, onViewAchievements }) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (open && achievements && achievements.length > 0) {
      setShowConfetti(true);
      // Hide confetti after animation
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [open, achievements]);

  if (!achievements || achievements.length === 0) {
    return null;
  }

  const isMultiple = achievements.length > 1;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md border-2 border-yellow-400 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50">
        {/* Confetti Effect */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              >
                <Sparkles className="h-4 w-4 text-yellow-500" />
              </div>
            ))}
          </div>
        )}

        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Trophy className="h-16 w-16 text-yellow-500 animate-bounce" />
              <Sparkles className="h-8 w-8 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
            </div>
          </div>
          <DialogTitle className="text-3xl font-bold text-yellow-900">
            🎉 Achievement{isMultiple ? 's' : ''} Unlocked! 🎉
          </DialogTitle>
          <DialogDescription className="text-base text-yellow-700 font-medium">
            {isMultiple 
              ? `Congratulations! You've unlocked ${achievements.length} new achievements!`
              : "Congratulations! You've earned a new achievement!"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {achievements.map((achievement, index) => (
            <Card
              key={achievement.id || index}
              className="border-2 border-yellow-400 bg-gradient-to-br from-yellow-100 to-amber-100 shadow-lg"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-yellow-200 rounded-full">
                    {getAchievementIcon(achievement.icon_name || "Trophy")}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-yellow-900 mb-1">
                      {achievement.name || "Achievement Unlocked!"}
                    </h3>
                    <p className="text-sm text-yellow-700 mb-2">
                      {achievement.description || "Keep up the great work!"}
                    </p>
                    {achievement.category && (
                      <span className="inline-block px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded-full">
                        {achievement.category}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button
            onClick={onViewAchievements}
            className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold"
          >
            <Trophy className="h-4 w-4 mr-2" />
            View All Achievements
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


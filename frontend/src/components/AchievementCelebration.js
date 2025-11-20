import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/animate-ui/components/radix/dialog";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { Trophy, Sparkles, X, CheckCircle, Flame, Zap, Star, Target, Award, Mail, BookOpen, Book } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { celebrateAchievement } from "@/utils/hapticFeedback";

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
      // Trigger haptic-like feedback (confetti + screen shake)
      celebrateAchievement();
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
      <DialogContent from="top" showCloseButton={true} className="sm:max-w-md border-2 border-primary/30 bg-card/95 backdrop-blur-xl shadow-2xl">
        {/* Premium Confetti Effect */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {[...Array(80)].map((_, i) => (
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
                <Sparkles className="h-5 w-5 text-yellow-500 drop-shadow-lg" style={{
                  filter: `drop-shadow(0 0 4px rgba(234, 179, 8, 0.6))`,
                }} />
              </div>
            ))}
          </div>
        )}

        <DialogHeader className="text-center relative">
          {/* Premium Background Glow */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-orange-500/10 rounded-2xl blur-3xl" />
          
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Animated Glow Ring */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 opacity-20 blur-xl animate-pulse" />
              <div className="relative p-4 bg-gradient-to-br from-yellow-400/20 to-amber-500/20 rounded-full border-2 border-yellow-400/30 backdrop-blur-sm">
                <Trophy className="h-16 w-16 text-yellow-500 drop-shadow-lg animate-bounce" style={{
                  filter: `drop-shadow(0 0 8px rgba(234, 179, 8, 0.5))`,
                }} />
              </div>
              <Sparkles className="h-10 w-10 text-yellow-400 absolute -top-1 -right-1 animate-pulse drop-shadow-lg" style={{
                filter: `drop-shadow(0 0 6px rgba(234, 179, 8, 0.6))`,
              }} />
            </div>
          </div>
          <DialogTitle className="text-3xl font-bold gradient-text-gold mb-2">
            Achievement{isMultiple ? 's' : ''} Unlocked!
          </DialogTitle>
          <DialogDescription className="text-base text-foreground/80 font-medium">
            {isMultiple 
              ? `Congratulations! You've unlocked ${achievements.length} new achievements!`
              : "Congratulations! You've earned a new achievement!"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {achievements.map((achievement, index) => (
            <Card
              key={achievement.id || index}
              className="border-2 border-yellow-400/40 bg-gradient-to-br from-yellow-50/90 via-amber-50/90 to-orange-50/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:border-yellow-400/60 transition-all duration-300 relative overflow-hidden group"
            >
              {/* Shimmer Effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              
              <CardContent className="p-5 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full blur-md opacity-30 animate-pulse" />
                    <div className="relative p-3.5 bg-gradient-to-br from-yellow-200 to-amber-200 rounded-full border-2 border-yellow-300/50 shadow-lg">
                      {getAchievementIcon(achievement.icon_name || "Trophy")}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-yellow-900 mb-1.5 leading-tight">
                      {achievement.name || "Achievement Unlocked!"}
                    </h3>
                    <p className="text-sm text-yellow-800/90 mb-3 leading-relaxed">
                      {achievement.description || "Keep up the great work!"}
                    </p>
                    {achievement.category && (
                      <span className="inline-block px-3 py-1.5 bg-gradient-to-r from-yellow-200 to-amber-200 text-yellow-900 text-xs font-semibold rounded-full border border-yellow-300/50 shadow-sm">
                        {achievement.category}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button
            onClick={onViewAchievements}
            className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl"
          >
            <Trophy className="h-4 w-4" />
            View All Achievements
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-2 hover:bg-accent/50"
          >
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


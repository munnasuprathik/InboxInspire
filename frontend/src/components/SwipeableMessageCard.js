import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Archive, X, Clock, User, Star, Reply, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeForTimezone } from "@/utils/timezoneFormatting";

const SWIPE_THRESHOLD = 100; // Minimum distance to trigger action
const ROTATION_FACTOR = 0.1; // Rotation per pixel moved

export function SwipeableMessageCard({ 
  message, 
  isFavorite, 
  onFavorite, 
  onArchive,
  timezone,
  hasReplies,
  onRate,
  onViewReplies
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [swipeDirection, setSwipeDirection] = useState(null); // 'left' | 'right' | null
  const cardRef = useRef(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [localFavorite, setLocalFavorite] = useState(isFavorite); // Local state for immediate UI update

  // Sync local favorite state with prop (only when it actually changes)
  useEffect(() => {
    setLocalFavorite(prev => {
      // Only update if the prop value is different from current state
      if (prev !== isFavorite) {
        return isFavorite;
      }
      return prev; // Return previous value to prevent unnecessary re-renders
    });
  }, [isFavorite]);

  // Reset position when message changes
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setSwipeDirection(null);
    setIsDragging(false);
    setIsAnimating(false);
  }, [message.id]);

  const handleStart = (clientX, clientY) => {
    if (isAnimating) return;
    setIsDragging(true);
    setStartPos({ x: clientX, y: clientY });
  };

  const handleMove = (clientX, clientY) => {
    if (!isDragging || isAnimating) return;

    const deltaX = clientX - startPos.x;
    const deltaY = clientY - startPos.y;

    // Only allow horizontal swiping (ignore if vertical movement is dominant)
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    setPosition({ x: deltaX, y: deltaY * 0.2 }); // Reduce vertical movement

    // Determine swipe direction
    if (deltaX > 50) {
      setSwipeDirection('right');
    } else if (deltaX < -50) {
      setSwipeDirection('left');
    } else {
      setSwipeDirection(null);
    }
  };

  const handleEnd = () => {
    if (!isDragging || isAnimating) return;

    const currentX = position.x;
    const absX = Math.abs(currentX);
    
    // Capture the direction before any state updates
    const swipedRight = currentX > 0;
    const swipedLeft = currentX < 0;
    
    if (absX > SWIPE_THRESHOLD) {
      setIsAnimating(true);
      setIsDragging(false);
      
      // Trigger action immediately
      if (swipedRight && onFavorite) {
        // Optimistically update local state
        setLocalFavorite(!localFavorite);
        
        // Show brief animation to right, then snap back
        setPosition({ x: 150, y: position.y });
        setTimeout(async () => {
          // Call favorite action
          try {
            const favoritePromise = onFavorite(message.id);
            if (favoritePromise && typeof favoritePromise.then === 'function') {
              favoritePromise.then((result) => {
                // Update local state based on result
                if (result && typeof result === 'object' && 'is_favorite' in result) {
                  setLocalFavorite(result.is_favorite);
                }
                // After favorite action, snap back to center (card stays visible)
                setPosition({ x: 0, y: 0 });
                setSwipeDirection(null);
                setTimeout(() => {
                  setIsAnimating(false);
                }, 200);
              }).catch((error) => {
                console.error('Favorite action error:', error);
                // On error, revert local state and snap back
                setLocalFavorite(isFavorite);
                setPosition({ x: 0, y: 0 });
                setSwipeDirection(null);
                setTimeout(() => {
                  setIsAnimating(false);
                }, 200);
              });
            } else {
              // If not a promise, just snap back
              setPosition({ x: 0, y: 0 });
              setSwipeDirection(null);
              setTimeout(() => {
                setIsAnimating(false);
              }, 200);
            }
          } catch (error) {
            console.error('Favorite action exception:', error);
            // Revert on error
            setLocalFavorite(isFavorite);
            setPosition({ x: 0, y: 0 });
            setSwipeDirection(null);
            setTimeout(() => {
              setIsAnimating(false);
            }, 200);
          }
        }, 100);
      } else if (swipedLeft && onArchive) {
        // Archive: animate off screen and remove
        const finalX = -window.innerWidth;
        setPosition({ x: finalX, y: position.y });
        setTimeout(() => {
          onArchive(message.id);
        }, 300);
      }
    } else {
      // Snap back to center
      setIsAnimating(true);
      setPosition({ x: 0, y: 0 });
      setSwipeDirection(null);
      setTimeout(() => {
        setIsAnimating(false);
        setIsDragging(false);
      }, 300);
    }
  };

  // Touch events
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // Mouse events (for desktop)
  const handleMouseDown = (e) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Global mouse events
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, position, startPos]);

  const rotation = position.x * ROTATION_FACTOR;
  const opacity = 1 - Math.abs(position.x) / (window.innerWidth * 0.5);

  // Calculate background colors based on swipe direction
  const getBackgroundColor = () => {
    if (swipeDirection === 'right') {
      return 'from-green-500/20 to-emerald-500/10';
    } else if (swipeDirection === 'left') {
      return 'from-orange-500/20 to-red-500/10';
    }
    return 'from-transparent to-transparent';
  };

  return (
    <div className="relative w-full h-auto" style={{ perspective: '1000px', minHeight: '350px' }}>
      {/* Background Action Indicators */}
      <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none z-0 overflow-hidden rounded-xl">
        {/* Favorite Indicator (Right) */}
        <div
          className={cn(
            "flex items-center gap-2 transition-all duration-300",
            swipeDirection === 'right' && Math.abs(position.x) > 50
              ? "opacity-100 scale-110"
              : "opacity-0 scale-90"
          )}
        >
          <div className="p-3 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/40 backdrop-blur-sm">
            <Heart className="h-8 w-8 text-green-600 fill-green-600" />
          </div>
          <span className="text-lg font-bold text-green-600">Favorite</span>
        </div>

        {/* Archive Indicator (Left) */}
        <div
          className={cn(
            "flex items-center gap-2 transition-all duration-300",
            swipeDirection === 'left' && Math.abs(position.x) > 50
              ? "opacity-100 scale-110"
              : "opacity-0 scale-90"
          )}
        >
          <span className="text-lg font-bold text-orange-600">Archive</span>
          <div className="p-3 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-orange-500/40 backdrop-blur-sm">
            <Archive className="h-8 w-8 text-orange-600 fill-orange-600" />
          </div>
        </div>
      </div>

      {/* Swipeable Card */}
      <div
        ref={cardRef}
        className={cn(
          "relative z-10 cursor-grab active:cursor-grabbing transition-transform duration-200",
          isAnimating && "transition-all duration-300 ease-out",
          "touch-none select-none" // Prevent text selection during swipe
        )}
        style={{
          transform: `translateX(${position.x}px) translateY(${position.y}px) rotate(${rotation}deg)`,
          opacity: Math.max(0.3, opacity),
          willChange: isDragging ? 'transform' : 'auto',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <Card
          className={cn(
            "border-2 border-border/30 bg-card/95 backdrop-blur-xl",
            "hover:shadow-2xl transition-all duration-300",
            "relative overflow-hidden",
            "shadow-lg",
            swipeDirection === 'right' && "border-green-500/60 shadow-xl shadow-green-500/30 ring-2 ring-green-500/20",
            swipeDirection === 'left' && "border-orange-500/60 shadow-xl shadow-orange-500/30 ring-2 ring-orange-500/20",
            getBackgroundColor() !== 'from-transparent to-transparent' && `bg-gradient-to-br ${getBackgroundColor()}`,
            hasReplies && "border-primary/30",
            !isDragging && "hover:scale-[1.02]"
          )}
        >
          {/* Drag Indicator */}
          {!isDragging && position.x === 0 && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm">
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: '0s' }} />
                <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
              <span className="text-xs font-medium text-primary/80 hidden sm:inline">Drag</span>
            </div>
          )}
          {/* Premium Shimmer Effect */}
          {isDragging && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent premium-shimmer pointer-events-none" />
          )}
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
                      <span>{message.replies?.length === 1 ? 'Replied' : `${message.replies?.length} replies`}</span>
                    </Badge>
                  )}
                  {message.used_fallback && (
                    <Badge variant="outline" className="text-xs">Backup</Badge>
                  )}
                  {message.rating && (
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      {[...Array(message.rating)].map((_, i) => (
                        <Star key={i} className="h-3 w-3 sm:h-4 sm:w-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                      ))}
                    </div>
                  )}
                  {localFavorite && (
                    <Badge variant="default" className="gap-1 text-xs bg-gradient-to-r from-green-600 to-emerald-600">
                      <Heart className="h-2.5 w-2.5 fill-white text-white" />
                      <span>Favorite</span>
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 sm:space-y-4 pt-0">
            {/* Message Content */}
            <div className="rounded-lg p-3 sm:p-4 bg-muted/50 border border-border">
              <p className="message-content text-sm leading-relaxed whitespace-pre-wrap text-foreground break-words line-clamp-4">
                {message.message}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRate && onRate(message);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-border/60 bg-gradient-to-r from-background/90 to-background/80 backdrop-blur-sm hover:from-accent/50 hover:to-accent/40 hover:border-primary/40 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
              >
                <Star className={cn("h-4 w-4 transition-colors", message.rating && "fill-amber-400 text-amber-400")} />
                {message.rating ? 'Update Rating' : 'Rate'}
              </button>
              {hasReplies && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewReplies && onViewReplies(message);
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-border/60 bg-gradient-to-r from-background/90 to-background/80 backdrop-blur-sm hover:from-accent/50 hover:to-accent/40 hover:border-primary/40 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
                >
                  <Reply className="h-4 w-4" />
                  <span className="hidden sm:inline">Replies</span>
                </button>
              )}
            </div>
            
            {/* Swipe Hint */}
            {!isDragging && position.x === 0 && (
              <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-center gap-3 text-xs text-muted-foreground/50">
                <div className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-green-500/60" />
                  <span className="hidden sm:inline">Swipe right</span>
                </div>
                <span className="text-muted-foreground/30">•</span>
                <div className="flex items-center gap-1.5">
                  <Archive className="h-4 w-4 text-orange-500/60" />
                  <span className="hidden sm:inline">Swipe left</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


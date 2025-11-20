import React, { useState } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  Trophy, 
  History, 
  Settings,
  Menu,
  X,
  User,
  LogOut,
  Mail,
  Sparkles,
  Flame,
  Home
} from "lucide-react";
import { LiquidButton as Button } from "@/components/animate-ui/components/buttons/liquid";
import { DynamicGradient } from "@/components/DynamicGradient";
import { cn } from "@/lib/utils";

/**
 * Dashboard Layout Component
 * Based on shadcn dashboard-01 design pattern
 * Integrates existing components while maintaining their order
 */
export function DashboardLayout({ 
  user, 
  onLogout, 
  activeTab = "overview",
  onTabChange,
  onAddGoal,
  children 
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: "Overview", value: "overview", icon: BarChart3 },
    { name: "Analytics", value: "analytics", icon: TrendingUp },
    { name: "Achievements", value: "achievements", icon: Trophy },
    { name: "History", value: "history", icon: History },
    { name: "Settings", value: "settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Dynamic Time-Based Gradient Background */}
      <DynamicGradient />
      
      {/* Premium Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>
      
      {/* Sidebar - Desktop (Minimal, just logo and user) */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-20 lg:flex-col">
        <div className="flex grow flex-col gap-y-6 overflow-y-auto border-r border-border/40 bg-background/60 backdrop-blur-xl shadow-lg px-3 pb-6">
          <div className="flex h-16 shrink-0 items-center justify-center pt-5">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300">
                <Sparkles className="h-5 w-5 text-primary drop-shadow-sm" />
              </div>
            </div>
          </div>
          <div className="mt-auto pt-4 border-t border-border/40">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center flex-shrink-0 border border-border/30 overflow-hidden">
                {user?.image_url ? (
                  <img 
                    src={user.image_url} 
                    alt={user.name || "User"} 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                className="h-10 w-10 text-muted-foreground hover:text-foreground"
                data-testid="logout-btn"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
        </div>
      )}

      {/* Mobile sidebar - Simplified */}
      <aside
        className={cn(
          "fixed inset-y-0 z-50 lg:hidden",
          "w-72 max-w-[85vw] bg-background/95 backdrop-blur-md border-r border-border/40",
          "transform transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex grow flex-col gap-y-6 overflow-y-auto px-5 pb-4">
          <div className="flex h-16 shrink-0 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <span className="text-lg font-semibold text-foreground">Tend</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="h-11 w-11 sm:h-9 sm:w-9 touch-manipulation"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="mt-auto pt-4 border-t border-border/40">
            <div className="flex items-center gap-x-3 px-2 py-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 border border-border/30 overflow-hidden">
                {user?.image_url ? (
                  <img 
                    src={user.image_url} 
                    alt={user.name || "User"} 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate font-normal">{user?.email || ""}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={onLogout}
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-20">
        {/* Top header with navigation - Glassmorphism 2.0 */}
        <div className="sticky top-0 z-40 border-b border-border/20 bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-background/40 before:to-transparent before:pointer-events-none">
          {/* Mobile header - Premium Style */}
          <div className="flex h-14 shrink-0 items-center justify-between px-4 lg:hidden bg-background/80 backdrop-blur-sm border-b border-border/20">
            {/* Left: Logo (Instagram style text) */}
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-foreground tracking-tight font-sans">Tend</span>
              <div className="h-1.5 w-1.5 rounded-full bg-primary/80 mb-3" /> {/* Subtle accent dot */}
            </div>
            
            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {/* Add Goal Button */}
              {onAddGoal && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onAddGoal}
                  className="h-10 w-10 sm:h-9 sm:w-9 rounded-lg hover:bg-transparent active:scale-95 transition-all duration-200 touch-manipulation border-0 flex items-center justify-center p-0"
                  title="Add New Goal"
                >
                  <div className="relative w-6 h-6 sm:w-5 sm:h-5 flex items-center justify-center">
                    {/* Square background - dark muted blue/gray */}
                    <div className="absolute inset-0 bg-slate-700 dark:bg-slate-600 rounded-md"></div>
                    {/* White horizontal line - centered */}
                    <div className="absolute w-3 h-[2px] bg-white rounded-full"></div>
                    {/* White vertical line - centered */}
                    <div className="absolute h-3 w-[2px] bg-white rounded-full"></div>
                  </div>
                </Button>
              )}
              
              {/* Logout Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                className="h-10 w-10 sm:h-9 sm:w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-all duration-200 touch-manipulation border border-transparent hover:border-destructive/20"
                title="Logout"
              >
                <LogOut className="h-5 w-5 stroke-[2.5]" />
              </Button>
            </div>
          </div>

          {/* Unified Tab Navigation - Desktop Only - Glassmorphism 2.0 */}
          <div className="hidden lg:block px-10 py-2.5 border-t border-border/20 bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 shadow-sm relative before:absolute before:inset-0 before:bg-gradient-to-b before:from-background/30 before:to-transparent before:pointer-events-none">
            <div className="mx-auto max-w-7xl">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => onTabChange && onTabChange(item.value)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 relative group",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      <Icon className={cn(
                        "h-4 w-4 shrink-0 transition-all duration-200",
                        isActive 
                          ? "text-primary" 
                          : "group-hover:scale-105"
                      )} />
                      <span className={cn(
                        "transition-all duration-200",
                        isActive && "font-semibold"
                      )}>{item.name}</span>
                      {isActive && (
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Main content area - Adjusted for bottom nav on mobile */}
        <main className="py-4 sm:py-8 px-4 sm:px-6 lg:px-10 pb-20 sm:pb-24 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            {/* Content */}
            <div className="space-y-6 sm:space-y-8">
              {children}
            </div>
          </div>
        </main>

        {/* Mobile Bottom Dock Navigation - Glassmorphism 2.0 */}
        <div className="fixed bottom-0 inset-x-0 z-50 lg:hidden pb-safe-area-inset-bottom bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 border-t border-border/20 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] before:absolute before:inset-0 before:bg-gradient-to-t before:from-background/40 before:to-transparent before:pointer-events-none">
          <div className="flex items-center justify-around h-16 px-2 sm:px-6 max-w-md mx-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              
              // Special case for Settings/Profile - Instagram style circle when active
              if (item.value === "settings") {
                 return (
                   <button
                    key={item.value}
                    onClick={() => onTabChange && onTabChange(item.value)}
                    className={cn(
                      "flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-lg transition-all duration-200 active:scale-[0.97] touch-manipulation relative group",
                      isActive 
                        ? "" 
                        : "hover:bg-muted/30"
                    )}
                  >
                    <div className="relative flex items-center justify-center">
                      {/* Instagram style circle when active */}
                      {isActive && (
                        <div className="absolute rounded-full border-2 border-primary" style={{ 
                          width: '32px', 
                          height: '32px',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)'
                        }} />
                      )}
                      <div className={cn(
                        "h-6 w-6 sm:h-[26px] sm:w-[26px] rounded-full overflow-hidden transition-all duration-200 flex items-center justify-center relative z-10",
                        !isActive && "ring-0.5 ring-border/30 group-hover:ring-border/50"
                      )}>
                        {user?.image_url ? (
                          <img src={user.image_url} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-6 w-6 sm:h-[26px] sm:w-[26px] text-muted-foreground" />
                        )}
                      </div>
                      {/* Small active indicator */}
                      {isActive && (
                        <div className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-primary z-10" />
                      )}
                    </div>
                  </button>
                 )
              }

              return (
                <button
                  key={item.value}
                  onClick={() => onTabChange && onTabChange(item.value)}
                  className={cn(
                    "flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-lg transition-all duration-200 active:scale-[0.97] touch-manipulation relative group",
                    isActive 
                      ? "" 
                      : "hover:bg-muted/30"
                  )}
                >
                  <div className="relative flex items-center justify-center">
                    {/* Use Home icon for Overview on mobile, original icon on desktop */}
                    {item.value === "overview" ? (
                      <Home 
                        className={cn(
                          "h-6 w-6 sm:h-[26px] sm:w-[26px] transition-all duration-200", 
                          isActive 
                            ? "text-primary" 
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                        strokeWidth={isActive ? 2.5 : 1.75}
                      />
                    ) : (
                      <Icon 
                        className={cn(
                          "h-6 w-6 sm:h-[26px] sm:w-[26px] transition-all duration-200", 
                          isActive 
                            ? "text-primary" 
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                        strokeWidth={isActive ? 2.5 : 1.75}
                      />
                    )}
                    
                    {/* Small & Neat Active Indicator */}
                    {isActive && (
                      <div className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-primary" />
                    )}
                    
                    {/* Notification dot for Overview */}
                    {item.name === "Overview" && !isActive && (
                       <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                         <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 border border-background"></span>
                       </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


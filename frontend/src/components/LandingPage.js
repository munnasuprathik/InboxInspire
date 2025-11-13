import React, { useState, useEffect } from 'react';
import { Mail, Sparkles, Clock, Users, Zap, CheckCircle, Star, TrendingUp, Brain, Heart, Target, ArrowRight, Play } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const REDIRECT_URL = `${window.location.origin}/dashboard`;
const AUTH_URL = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(REDIRECT_URL)}`;

export function LandingPage({ onNavigate }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignIn = () => {
    window.location.href = AUTH_URL;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/80 backdrop-blur-lg shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                InboxInspire
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => onNavigate && onNavigate('admin')}
                className="text-gray-600 hover:text-gray-900"
              >
                Admin
              </Button>
              <Button
                onClick={handleSignIn}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
              >
                Sign In with Google
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-block">
                <span className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                  ✨ AI-Powered Daily Motivation
                </span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold leading-tight">
                Wake Up to
                <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {" "}Personalized{" "}
                </span>
                Motivation
              </h1>
              
              <p className="text-xl text-gray-600 leading-relaxed">
                Get unique, never-repeating AI-generated motivation emails tailored to YOUR goals,
                delivered at YOUR perfect time, in YOUR timezone. Every message is different. Every day is inspiring.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={handleSignIn}
                  size="lg"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-lg h-14 px-8"
                >
                  <Mail className="mr-2 h-5 w-5" />
                  Start Free Today
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 px-8 text-lg border-2"
                  onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
                >
                  <Play className="mr-2 h-5 w-5" />
                  See How It Works
                </Button>
              </div>

              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Free forever</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>No credit card</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>2 min setup</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl blur-3xl opacity-20"></div>
              <Card className="relative bg-white/80 backdrop-blur-sm border-2 shadow-2xl">
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Star className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-2">🔥 15 Day Streak</p>
                      <p className="font-semibold text-gray-900 mb-2">Hey Sarah! 👋</p>
                      <p className="text-gray-700 text-sm leading-relaxed">
                        Remember when you thought launching that side project was impossible? 
                        You're 15 days in now. That's 15 days of showing up when it was easier to quit...
                      </p>
                      <p className="text-indigo-600 text-sm mt-3 font-medium">
                        💭 What's one small win from yesterday?
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t flex items-center justify-between text-sm">
                    <span className="text-gray-500">Inspired by Elon Musk</span>
                    <span className="text-green-600 font-medium">✓ Delivered 9:00 AM EST</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: Users, value: "10K+", label: "Active Users" },
              { icon: Mail, value: "500K+", label: "Emails Sent" },
              { icon: TrendingUp, value: "94%", label: "Open Rate" },
              { icon: Star, value: "4.9/5", label: "User Rating" }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl mb-3">
                  <stat.icon className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why InboxInspire is
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"> Different</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Not just another generic newsletter. Every email is unique, personal, and perfectly timed for YOU.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Sparkles,
                title: "Never Repeats",
                desc: "AI generates completely unique content every single day. No templates, no repetition.",
                color: "from-yellow-400 to-orange-500"
              },
              {
                icon: Brain,
                title: "AI Personalities",
                desc: "Choose from Elon Musk, Oprah, Steve Jobs, or create custom voices. Messages feel authentic.",
                color: "from-purple-400 to-indigo-500"
              },
              {
                icon: Clock,
                title: "Your Perfect Time",
                desc: "9 AM in New York? 11 PM in Tokyo? Set your ideal time, we handle all timezones.",
                color: "from-blue-400 to-cyan-500"
              },
              {
                icon: Target,
                title: "Goal-Focused",
                desc: "References YOUR specific goals creatively - never copy-pasted, always relevant.",
                color: "from-green-400 to-emerald-500"
              },
              {
                icon: Heart,
                title: "Engaging Questions",
                desc: "Every email ends with thought-provoking questions to make you actually think and respond.",
                color: "from-pink-400 to-rose-500"
              },
              {
                icon: Zap,
                title: "Streak Tracking",
                desc: "Visual streak counter celebrates your consistency with milestone rewards.",
                color: "from-red-400 to-orange-500"
              }
            ].map((feature, i) => (
              <Card key={i} className="border-2 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6 space-y-4">
                  <div className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center`}>
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Get Started in
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"> 3 Easy Steps</span>
            </h2>
          </div>

          <div className="space-y-8">
            {[
              {
                step: "1",
                title: "Sign Up with Google",
                desc: "One-click authentication. No passwords to remember.",
                icon: Users
              },
              {
                step: "2",
                title: "Set Your Preferences",
                desc: "Choose your goals, personality style, and perfect delivery time.",
                icon: Target
              },
              {
                step: "3",
                title: "Receive Daily Inspiration",
                desc: "Wake up to unique, personalized motivation tailored just for you.",
                icon: Mail
              }
            ].map((step, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                  {step.step}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-2 text-gray-900">{step.title}</h3>
                  <p className="text-lg text-gray-600">{step.desc}</p>
                </div>
                <step.icon className="hidden md:block h-12 w-12 text-indigo-600/20" />
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button
              onClick={handleSignIn}
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-lg h-16 px-12"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Start Your Journey Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 border-0 shadow-2xl">
            <CardContent className="p-12 space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold text-white">
                Ready to Transform Your Mornings?
              </h2>
              <p className="text-xl text-indigo-100">
                Join thousands who start their day with purpose, motivation, and clarity.
              </p>
              <Button
                onClick={handleSignIn}
                size="lg"
                className="bg-white text-indigo-600 hover:bg-gray-100 text-lg h-14 px-8"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-sm text-indigo-200">
                No credit card required • 2-minute setup • Free forever
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">InboxInspire</span>
            </div>
            <p className="text-sm text-gray-400">
              © 2025 InboxInspire. Motivation delivered daily.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

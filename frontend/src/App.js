import { useState } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { CheckCircle, Mail, Sparkles, Clock, User } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FAMOUS_PERSONALITIES = [
  "Elon Musk", "Steve Jobs", "A.P.J. Abdul Kalam", "Oprah Winfrey",
  "Nelson Mandela", "Maya Angelou", "Tony Robbins", "Brené Brown",
  "Simon Sinek", "Michelle Obama"
];

const TONE_OPTIONS = [
  "Funny & Uplifting", "Friendly & Warm", "Roasting (Tough Love)",
  "Serious & Direct", "Philosophical & Deep", "Energetic & Enthusiastic",
  "Calm & Meditative", "Poetic & Artistic"
];

function App() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: "",
    goals: "",
    personalityType: "famous",
    personalityValue: "",
    customPersonality: "",
    frequency: "daily",
    time: "09:00"
  });
  const [previewMessage, setPreviewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmitStep1 = (e) => {
    e.preventDefault();
    if (!formData.email || !formData.goals) {
      toast.error("Please fill in all fields");
      return;
    }
    setStep(2);
  };

  const handleSubmitStep2 = (e) => {
    e.preventDefault();
    if (!formData.personalityValue && !formData.customPersonality) {
      toast.error("Please select or enter a personality/tone");
      return;
    }
    setStep(3);
  };

  const handleGeneratePreview = async () => {
    setLoading(true);
    try {
      const personality = {
        type: formData.personalityType,
        value: formData.personalityType === "custom" ? formData.customPersonality : formData.personalityValue
      };

      const response = await axios.post(`${API}/generate-message`, {
        goals: formData.goals,
        personality
      });

      setPreviewMessage(response.data.message);
      toast.success("Preview generated!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate preview");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const personality = {
        type: formData.personalityType,
        value: formData.personalityType === "custom" ? formData.customPersonality : formData.personalityValue
      };

      const schedule = {
        frequency: formData.frequency,
        time: formData.time
      };

      await axios.post(`${API}/users`, {
        email: formData.email,
        goals: formData.goals,
        personality,
        schedule
      });

      // Send test email
      if (previewMessage) {
        await axios.post(`${API}/send-test-email`, {
          email: formData.email,
          message: previewMessage
        });
      }

      setCompleted(true);
      toast.success("You're all set! Check your inbox.");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to complete setup");
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Toaster position="top-center" />
        <Card className="max-w-lg w-full text-center" data-testid="success-card">
          <CardContent className="pt-12 pb-8">
            <div className="flex justify-center mb-6">
              <div className="h-20 w-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold mb-4">You're All Set!</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Your first motivational message is on its way to <span className="font-semibold">{formData.email}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              You'll receive inspiration {formData.frequency} at {formData.time}
            </p>
            <Button 
              className="mt-8" 
              onClick={() => window.location.reload()}
              data-testid="create-another-btn"
            >
              Create Another Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <Toaster position="top-center" />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 mt-8">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Mail className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            InboxInspire
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Get personalized motivational messages from your favorite personalities, delivered straight to your inbox
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-12" data-testid="progress-indicator">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                step >= s 
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md' 
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`h-1 w-12 md:w-24 mx-2 transition-all ${
                step > s ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gray-200'
              }`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Email & Goals */}
        {step === 1 && (
          <Card className="shadow-xl" data-testid="step-1-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-500" />
                Let's Get Started
              </CardTitle>
              <CardDescription>Tell us about yourself and your goals</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitStep1} className="space-y-6">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="mt-2"
                    data-testid="email-input"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="goals">Your Goals & Ideas</Label>
                  <Textarea
                    id="goals"
                    placeholder="What are you working towards? What inspires you?"
                    value={formData.goals}
                    onChange={(e) => setFormData({...formData, goals: e.target.value})}
                    className="mt-2 min-h-32"
                    data-testid="goals-input"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="step-1-next-btn">
                  Continue
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Personality Selection */}
        {step === 2 && (
          <Card className="shadow-xl" data-testid="step-2-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                Choose Your Inspiration Style
              </CardTitle>
              <CardDescription>Select who or what style should inspire you</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitStep2} className="space-y-6">
                <RadioGroup 
                  value={formData.personalityType} 
                  onValueChange={(value) => setFormData({...formData, personalityType: value, personalityValue: "", customPersonality: ""})}
                  data-testid="personality-type-radio"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="famous" id="famous" data-testid="famous-radio" />
                    <Label htmlFor="famous" className="font-normal cursor-pointer">Famous Personality</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="tone" id="tone" data-testid="tone-radio" />
                    <Label htmlFor="tone" className="font-normal cursor-pointer">Tone/Style</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="custom" data-testid="custom-radio" />
                    <Label htmlFor="custom" className="font-normal cursor-pointer">Custom Description</Label>
                  </div>
                </RadioGroup>

                {formData.personalityType === "famous" && (
                  <div>
                    <Label>Select a Personality</Label>
                    <Select value={formData.personalityValue} onValueChange={(value) => setFormData({...formData, personalityValue: value})}>
                      <SelectTrigger className="mt-2" data-testid="famous-select">
                        <SelectValue placeholder="Choose a personality" />
                      </SelectTrigger>
                      <SelectContent>
                        {FAMOUS_PERSONALITIES.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.personalityType === "tone" && (
                  <div>
                    <Label>Select a Tone</Label>
                    <Select value={formData.personalityValue} onValueChange={(value) => setFormData({...formData, personalityValue: value})}>
                      <SelectTrigger className="mt-2" data-testid="tone-select">
                        <SelectValue placeholder="Choose a tone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.personalityType === "custom" && (
                  <div>
                    <Label htmlFor="custom-desc">Describe Your Preferred Style</Label>
                    <Textarea
                      id="custom-desc"
                      placeholder="E.g., 'I want messages that are short, punchy, and focus on daily actions' or 'Make it like a wise mentor who tells stories'"
                      value={formData.customPersonality}
                      onChange={(e) => setFormData({...formData, customPersonality: e.target.value})}
                      className="mt-2 min-h-24"
                      data-testid="custom-desc-input"
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1" data-testid="step-2-back-btn">
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" data-testid="step-2-next-btn">
                    Continue
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Schedule & Preview */}
        {step === 3 && (
          <Card className="shadow-xl" data-testid="step-3-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-500" />
                Schedule Your Inspiration
              </CardTitle>
              <CardDescription>Choose when you want to receive your messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Frequency</Label>
                <Select value={formData.frequency} onValueChange={(value) => setFormData({...formData, frequency: value})}>
                  <SelectTrigger className="mt-2" data-testid="frequency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="time">Preferred Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({...formData, time: e.target.value})}
                  className="mt-2"
                  data-testid="time-input"
                />
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Preview Your Message</h3>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={handleGeneratePreview}
                    disabled={loading}
                    data-testid="generate-preview-btn"
                  >
                    {loading ? "Generating..." : "Generate Preview"}
                  </Button>
                </div>
                {previewMessage && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg" data-testid="preview-message">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{previewMessage}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1" data-testid="step-3-back-btn">
                  Back
                </Button>
                <Button 
                  onClick={handleFinalSubmit} 
                  disabled={loading}
                  className="flex-1"
                  data-testid="finish-btn"
                >
                  {loading ? "Setting Up..." : "Finish & Subscribe"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default App;
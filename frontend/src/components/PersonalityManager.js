import { useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FAMOUS_PERSONALITIES = [
  "Elon Musk", "Steve Jobs", "A.P.J. Abdul Kalam", "Oprah Winfrey",
  "Nelson Mandela", "Maya Angelou", "Tony Robbins", "Brené Brown",
  "Simon Sinek", "Michelle Obama", "Warren Buffett", "Richard Branson"
];

const TONE_OPTIONS = [
  "Funny & Uplifting", "Friendly & Warm", "Roasting (Tough Love)",
  "Serious & Direct", "Philosophical & Deep", "Energetic & Enthusiastic",
  "Calm & Meditative", "Poetic & Artistic"
];

export function PersonalityManager({ user, onUpdate }) {
  const [addingNew, setAddingNew] = useState(false);
  const [newPersonality, setNewPersonality] = useState({
    type: "famous",
    value: "",
    customValue: ""
  });
  const [loading, setLoading] = useState(false);

  const handleAddPersonality = async () => {
    if (!newPersonality.value && !newPersonality.customValue) {
      toast.error("Please select or enter a personality");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/users/${user.email}/personalities`, {
        type: newPersonality.type,
        value: newPersonality.type === "custom" ? newPersonality.customValue : newPersonality.value,
        active: true
      });

      toast.success("Personality added!");
      setAddingNew(false);
      setNewPersonality({ type: "famous", value: "", customValue: "" });
      
      // Refresh user data
      const response = await axios.get(`${API}/users/${user.email}`);
      onUpdate(response.data);
    } catch (error) {
      toast.error("Failed to add personality");
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePersonality = async (personalityId) => {
    if (user.personalities.length <= 1) {
      toast.error("You must have at least one personality");
      return;
    }

    setLoading(true);
    try {
      await axios.delete(`${API}/users/${user.email}/personalities/${personalityId}`);
      toast.success("Personality removed");
      
      // Refresh user data
      const response = await axios.get(`${API}/users/${user.email}`);
      onUpdate(response.data);
    } catch (error) {
      toast.error("Failed to remove personality");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Your Personalities</CardTitle>
          <Dialog open={addingNew} onOpenChange={setAddingNew}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="add-personality-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Personality</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <RadioGroup 
                  value={newPersonality.type} 
                  onValueChange={(value) => setNewPersonality({...newPersonality, type: value, value: "", customValue: ""})}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="famous" id="new-famous" />
                    <Label htmlFor="new-famous" className="font-normal cursor-pointer">Famous Personality</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="tone" id="new-tone" />
                    <Label htmlFor="new-tone" className="font-normal cursor-pointer">Tone/Style</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="new-custom" />
                    <Label htmlFor="new-custom" className="font-normal cursor-pointer">Custom</Label>
                  </div>
                </RadioGroup>

                {newPersonality.type === "famous" && (
                  <Select value={newPersonality.value} onValueChange={(value) => setNewPersonality({...newPersonality, value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a personality" />
                    </SelectTrigger>
                    <SelectContent>
                      {FAMOUS_PERSONALITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {newPersonality.type === "tone" && (
                  <Select value={newPersonality.value} onValueChange={(value) => setNewPersonality({...newPersonality, value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a tone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {newPersonality.type === "custom" && (
                  <Textarea
                    placeholder="Describe your custom style..."
                    value={newPersonality.customValue}
                    onChange={(e) => setNewPersonality({...newPersonality, customValue: e.target.value})}
                    rows={3}
                  />
                )}

                <Button onClick={handleAddPersonality} disabled={loading} className="w-full">
                  {loading ? "Adding..." : "Add Personality"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Personality List */}
        <div className="space-y-2">
          {user.personalities.map((personality, index) => (
            <div 
              key={personality.id} 
              className="flex items-center justify-between p-4 border rounded-lg"
              data-testid="personality-item"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold">
                  {index + 1}
                </div>
                <div>
                  <p className="font-semibold">{personality.value}</p>
                  <p className="text-xs text-muted-foreground capitalize">{personality.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {index === user.current_personality_index && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Next</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePersonality(personality.id)}
                  disabled={loading || user.personalities.length <= 1}
                  data-testid="remove-personality-btn"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

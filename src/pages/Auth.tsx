import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { MessageCircle, Sparkles, UserRound } from "lucide-react";
import { signInWithUsername, signUpWithUsername } from "@/lib/auth-helpers";
import { Prefs } from "@/lib/local-prefs";
import { useAuth } from "@/hooks/useAuth";

// Sanitize username to letters/digits/underscore only (safe for our email mapping)
const sanitizeUsername = (raw: string) =>
  raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);

const randomUsername = () => `guest_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export default function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // login
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginAge, setLoginAge] = useState("");

  // signup
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [signupAge, setSignupAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "unspecified">("unspecified");

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ageNum = parseInt(loginAge, 10);
    if (loginAge && (!Number.isFinite(ageNum) || ageNum < 8 || ageNum > 120))
      return toast.error("الرجاء إدخال عمر صحيح");
    setLoading(true);
    const { data, error } = await signInWithUsername(loginUser, loginPass);
    setLoading(false);
    if (error) toast.error("اسم المستخدم أو كلمة المرور غير صحيحة");
    else {
      if (data.user && ageNum) Prefs.setAge(data.user.id, ageNum);
      toast.success("مرحباً بعودتك!");
      navigate("/");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    let uname = sanitizeUsername(username);
    if (!uname) uname = randomUsername();
    if (uname.length < 3) return toast.error("اسم المستخدم قصير جداً (٣ أحرف على الأقل)");
    if (password.length < 6) return toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    const ageNum = parseInt(signupAge, 10);
    if (!Number.isFinite(ageNum) || ageNum < 8 || ageNum > 120)
      return toast.error("الرجاء إدخال عمر صحيح");
    setLoading(true);
    const { data, error } = await signUpWithUsername(uname, password, displayName || uname, gender, ageNum);
    setLoading(false);
    if (error) {
      if (error.message.includes("already")) toast.error("اسم المستخدم مسجّل مسبقاً");
      else toast.error(error.message);
    } else {
      if (data.user) Prefs.setAge(data.user.id, ageNum);
      toast.success("تم إنشاء الحساب بنجاح!");
      navigate("/");
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    const uname = randomUsername();
    const pass = `${uname}_${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await signUpWithUsername(uname, pass, `زائر-${uname.slice(-4)}`, "unspecified");
    setLoading(false);
    if (error) toast.error("تعذّر الدخول كزائر، حاول مجدداً");
    else { toast.success("مرحباً أيها الزائر!"); navigate("/"); }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in-slide">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow mb-4">
            <MessageCircle className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">دردشة</h1>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
            <Sparkles className="h-4 w-4" /> مجتمع الدردشة العربي
          </p>
        </div>

        <Card className="p-6 shadow-soft border-border/50">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
              <TabsTrigger value="signup">حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>اسم المستخدم</Label>
                  <Input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} required dir="ltr" className="text-right" />
                </div>
                <div className="space-y-2">
                  <Label>كلمة المرور</Label>
                  <Input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>العمر <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
                  <Input type="number" min={8} max={120} value={loginAge} onChange={(e) => setLoginAge(e.target.value)} placeholder="مثال: 25" />
                </div>
                <Button type="submit" className="w-full gradient-primary border-0 shadow-glow" disabled={loading}>
                  {loading ? "جارٍ الدخول..." : "دخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label>اسم المستخدم <span className="text-xs text-muted-foreground">(اختياري - سيُولّد تلقائياً)</span></Label>
                  <Input value={username} onChange={(e) => setUsername(sanitizeUsername(e.target.value))} dir="ltr" className="text-right" placeholder="حروف إنجليزية وأرقام فقط" />
                </div>
                <div className="space-y-2">
                  <Label>الاسم المعروض</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="اسمك في الدردشة" />
                </div>
                <div className="space-y-2">
                  <Label>كلمة المرور</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>الجنس</Label>
                  <RadioGroup value={gender} onValueChange={(v) => setGender(v as any)} className="flex gap-4">
                    <div className="flex items-center gap-2"><RadioGroupItem value="male" id="m" /><Label htmlFor="m">ذكر</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="female" id="f" /><Label htmlFor="f">أنثى</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="unspecified" id="u" /><Label htmlFor="u">غير محدد</Label></div>
                  </RadioGroup>
                </div>
                <Button type="submit" className="w-full gradient-primary border-0 shadow-glow" disabled={loading}>
                  {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <div className="relative my-3">
              <Separator />
              <span className="absolute inset-0 -top-2.5 mx-auto w-fit bg-card px-2 text-xs text-muted-foreground">أو</span>
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" disabled={loading} onClick={handleGuest}>
              <UserRound className="h-4 w-4" /> دخول كزائر
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

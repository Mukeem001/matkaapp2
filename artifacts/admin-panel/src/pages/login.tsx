import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { mutate: doLogin, isPending } = useAdminLogin();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginForm) => {
    doLogin(
      { data },
      {
        onSuccess: (res) => {
          toast({ title: "Welcome back!", description: "Successfully logged in." });
          login(res.token);
        },
        onError: (err: any) => {
          toast({ 
            title: "Login failed", 
            description: err?.response?.data?.error || "Invalid credentials", 
            variant: "destructive" 
          });
        }
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex flex-1 relative bg-muted items-center justify-center overflow-hidden">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Abstract Background" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/10 mix-blend-multiply" />
      </div>
      
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:w-[480px] xl:w-[560px]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-sm lg:w-96"
        >
          <div className="mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 mb-6">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 object-contain filter invert" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground">Welcome back</h2>
            <p className="mt-2 text-muted-foreground text-sm">Sign in to your admin dashboard.</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="admin@matka.com"
                className="h-11 rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary focus:ring-primary/20 transition-all"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input 
                id="password" 
                type="password" 
                className="h-11 rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary focus:ring-primary/20 transition-all"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-base font-semibold btn-primary-gradient rounded-xl mt-4" 
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign in to Dashboard"}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

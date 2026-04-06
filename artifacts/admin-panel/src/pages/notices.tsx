import { useState } from "react";
import { useGetNotices, useCreateNotice, useDeleteNotice, getGetNoticesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Trash2, Plus, Megaphone } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://matka-api-server.onrender.com";

const noticeSchema = z.object({
  title: z.string().min(1, "Title required"),
  content: z.string().min(1, "Content required"),
  isActive: z.boolean().default(true),
  recipientType: z.enum(["broadcast", "userId", "userName"]).default("broadcast"),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export default function Notices() {
  const { data: notices, isLoading } = useGetNotices();
  const { mutate: create, isPending } = useCreateNotice();
  const { mutate: del } = useDeleteNotice();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof noticeSchema>>({
    resolver: zodResolver(noticeSchema),
    defaultValues: { 
      title: "", 
      content: "", 
      isActive: true,
      recipientType: "broadcast",
      userId: "",
      userName: ""
    }
  });

  const recipientType = form.watch("recipientType");

  const onSubmit = async (data: z.infer<typeof noticeSchema>) => {
    try {
      const token = localStorage.getItem("token") || "";
      let endpoint = "/api/notices";
      
      if (data.recipientType === "broadcast") {
        endpoint = "/api/notices/broadcast";
      } else if (data.recipientType === "userId") {
        endpoint = `/api/notices/user/${data.userId}`;
      } else if (data.recipientType === "userName") {
        endpoint = `/api/notices/user/name/${encodeURIComponent(data.userName || "")}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: data.title,
          content: data.content,
          isActive: data.isActive,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = "Failed to create notice";
        
        if (contentType?.includes("application/json")) {
          try {
            const error = await response.json();
            errorMessage = error.error || error.message || errorMessage;
          } catch {
            errorMessage = `Server error (${response.status}): ${response.statusText}`;
          }
        } else {
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      toast({ 
        title: data.recipientType === "broadcast" 
          ? "Broadcast notice published to all users!" 
          : `Notice sent to ${data.recipientType === "userId" ? `user ID ${data.userId}` : `user ${data.userName}`}!` 
      });
      queryClient.invalidateQueries({ queryKey: getGetNoticesQueryKey() });
      setDialogOpen(false);
      form.reset({ recipientType: "broadcast", userId: "", userName: "" });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to create notice",
        variant: "destructive"
      });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this notice?")) return;
    del({ id }, {
      onSuccess: () => {
        toast({ title: "Notice deleted" });
        queryClient.invalidateQueries({ queryKey: getGetNoticesQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">App Notices</h2>
          <p className="text-muted-foreground mt-1">Publish announcements to user app screens.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary-gradient gap-2">
              <Plus className="w-4 h-4" /> New Notice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Publish New Notice</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Send To</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => form.setValue("recipientType", "broadcast")}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                      recipientType === "broadcast"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    📢 All Users
                  </button>
                  <button
                    type="button"
                    onClick={() => form.setValue("recipientType", "userId")}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                      recipientType === "userId"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    👤 User ID
                  </button>
                  <button
                    type="button"
                    onClick={() => form.setValue("recipientType", "userName")}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                      recipientType === "userName"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    📝 Username
                  </button>
                </div>
              </div>

              {recipientType === "userId" && (
                <div className="space-y-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <Label className="text-sm">User ID</Label>
                  <Input
                    type="number"
                    {...form.register("userId")}
                    placeholder="e.g. 5"
                    className="rounded-lg"
                  />
                </div>
              )}

              {recipientType === "userName" && (
                <div className="space-y-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <Label className="text-sm">Username</Label>
                  <Input
                    {...form.register("userName")}
                    placeholder="e.g. mukeem"
                    className="rounded-lg"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} className="rounded-xl" placeholder="e.g. Holiday Update" />
              </div>
              <div className="space-y-2">
                <Label>Message Content</Label>
                <Textarea {...form.register("content")} className="rounded-xl min-h-[100px]" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/30">
                <Label className="cursor-pointer">Active Status</Label>
                <Switch checked={form.watch("isActive")} onCheckedChange={(c) => form.setValue("isActive", c)} />
              </div>
              <Button type="submit" className="w-full btn-primary-gradient mt-2" disabled={isPending}>
                {isPending ? "Publishing..." : "Publish"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse rounded-2xl" />
        ) : notices?.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-2xl border border-border/50 border-dashed">
            <Megaphone className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No active notices.</p>
          </div>
        ) : !Array.isArray(notices) ? null : (notices as any[]).map((notice) => (
          <Card key={notice.id} className="overflow-hidden border-border/50 shadow-sm relative group">
            <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${notice.isActive ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            <CardContent className="p-6 pl-8 flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-bold text-lg">{notice.title}</h3>
                  {!notice.isActive && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Inactive</span>}
                  {notice.userId && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">User #{notice.userId}</span>}
                  {!notice.userId && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Broadcast</span>}
                </div>
                <p className="text-muted-foreground">{notice.content}</p>
                <p className="text-xs text-muted-foreground/60 mt-3 font-medium uppercase tracking-wider">
                  Published {format(new Date(notice.createdAt), 'PPP')}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(notice.id)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

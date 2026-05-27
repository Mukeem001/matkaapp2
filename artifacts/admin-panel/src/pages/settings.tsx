import { useEffect, useState } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, Building, QrCode, Download, Trash2, Plus, FileUp, Key, AlertCircle } from "lucide-react";

// Admin panel base URL
// NOTE: For local development you should set VITE_API_URL=http://localhost:3000
// If it's not set, we default to local backend.
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const settingsSchema = z.object({
  appName: z.string().min(1),
  supportPhone: z.string().optional(),
  upiId: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  qrCodeUrl: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const credentialsSchema = z.object({
  newUsername: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").optional().or(z.literal("")),
  confirmPassword: z.string().optional().or(z.literal("")),
}).refine((data) => {
  if (data.newPassword && !data.confirmPassword) return false;
  if (!data.newPassword && data.confirmPassword) return false;
  return true;
}, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine((data) => {
  if (data.newPassword && data.confirmPassword) {
    return data.newPassword === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type CredentialsForm = z.infer<typeof credentialsSchema>;

interface UpiMethod {
  id: number;
  name: string;
  upiId: string;
  displayName?: string;
  isActive: string;
  createdAt: string;
}

interface ApkFile {
  id: number;
  filename: string;
  filepath: string;
  filesize: string;
  versionCode: string;
  versionName: string;
  isActive: string;
  createdAt: string;
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const { mutate: update, isPending } = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [upiMethods, setUpiMethods] = useState<UpiMethod[]>([]);
  const [apkFiles, setApkFiles] = useState<ApkFile[]>([]);
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [loadingApk, setLoadingApk] = useState(false);
  const [newUpi, setNewUpi] = useState({ name: "", upiId: "", displayName: "" });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [newApkVersion, setNewApkVersion] = useState({ versionCode: "1", versionName: "1.0.0" });
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<{ id: number; email: string; name: string } | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  const credentialsForm = useForm<CredentialsForm>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      newUsername: "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Fetch current admin info
  const fetchCurrentAdmin = async () => {
    setLoadingAdmin(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "GET",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setCurrentAdmin(data);
    } catch (error) {
      console.error("Error loading admin info:", error);
    }
    setLoadingAdmin(false);
  };

  // Fetch UPI Methods
  const fetchUpiMethods = async () => {
    setLoadingUpi(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/upi-methods`, {
        method: "GET",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setUpiMethods(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading UPI methods:", error);
      toast({ title: "Error loading UPI methods", variant: "destructive" });
      setUpiMethods([]);
    }
    setLoadingUpi(false);
  };

  // Fetch APK Files
  const fetchApkFiles = async () => {
    setLoadingApk(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/apk-files`, {
        method: "GET",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setApkFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading APK files:", error);
      toast({ title: "Error loading APK files", variant: "destructive" });
      setApkFiles([]);
    }
    setLoadingApk(false);
  };

  // Add UPI Method
  const handleAddUpi = async () => {
    if (!newUpi.name || !newUpi.upiId) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/upi-methods`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(newUpi),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast({ title: "UPI method added successfully" });
      setNewUpi({ name: "", upiId: "", displayName: "" });
      await fetchUpiMethods();
    } catch (error) {
      console.error("Error adding UPI method:", error);
      toast({ title: "Error adding UPI method", variant: "destructive" });
    }
  };

  // Delete UPI Method
  const handleDeleteUpi = async (id: number) => {
    if (!confirm("Are you sure you want to delete this UPI method?")) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/upi-methods/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast({ title: "UPI method deleted successfully" });
      await fetchUpiMethods();
    } catch (error) {
      console.error("Error deleting UPI method:", error);
      toast({ title: "Error deleting UPI method", variant: "destructive" });
    }
  };

  // Handle APK File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".apk")) {
      toast({ title: "Only APK files are allowed", variant: "destructive" });
      return;
    }

    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("versionCode", newApkVersion.versionCode);
    formData.append("versionName", newApkVersion.versionName);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/apk-files`, {
        method: "POST",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast({ title: "APK file uploaded successfully" });
      setNewApkVersion({ versionCode: "1", versionName: "1.0.0" });
      // Reset file input
      const fileInput = document.getElementById("apk-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      await fetchApkFiles();
    } catch (error) {
      console.error("Error uploading APK file:", error);
      toast({ title: "Error uploading APK file", variant: "destructive" });
    }
    setUploadingFile(false);
  };

  // Delete APK File
  const handleDeleteApk = async (id: number) => {
    if (!confirm("Are you sure you want to delete this APK file?")) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/apk-files/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast({ title: "APK file deleted successfully" });
      await fetchApkFiles();
    } catch (error) {
      console.error("Error deleting APK file:", error);
      toast({ title: "Error deleting APK file", variant: "destructive" });
    }
  };

  // Handle QR Code Upload
  const handleQrCodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    const validExts = [".png", ".jpg", ".jpeg"];
    const fileExt = file.name.substring(file.name.lastIndexOf("")).toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(fileExt)) {
      toast({ title: "Only PNG and JPEG images are allowed", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File size must be less than 5MB", variant: "destructive" });
      return;
    }

    setUploadingQr(true);
    const formData = new FormData();
    formData.append("qrCode", file);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/settings/upload-qr`, {
        method: "POST",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      toast({ title: "QR code uploaded successfully" });
      
      // Reset file input
      const fileInput = document.getElementById("qr-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      console.error("Error uploading QR code:", error);
      toast({ title: "Error uploading QR code", variant: "destructive" });
    }
    setUploadingQr(false);
  };

  useEffect(() => {
    if (settings) {
      form.reset({
        appName: settings.appName,
        supportPhone: settings.supportPhone || "",
        upiId: settings.upiId || "",
        bankName: settings.bankName || "",
        bankAccountNumber: settings.bankAccountNumber || "",
        bankIfscCode: settings.bankIfscCode || "",
        qrCodeUrl: settings.qrCodeUrl || "",
      });
    }
    fetchUpiMethods();
    fetchApkFiles();
    fetchCurrentAdmin();
  }, [settings, form]);

  const handleCredentialsSubmit = async (data: CredentialsForm) => {
    if (!data.currentPassword) {
      toast({ 
        title: "Error",
        description: "Current password is required",
        variant: "destructive" 
      });
      return;
    }

    if (!data.newUsername && !data.newPassword) {
      toast({ 
        title: "Error",
        description: "Please provide at least a new username or new password",
        variant: "destructive" 
      });
      return;
    }

    setCredentialsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found. Please log in again.");
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/change-credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          newUsername: data.newUsername || undefined,
          currentPassword: data.currentPassword,
          newPassword: data.newPassword || undefined,
        }),
      });

      const responseData = await response.json().catch(() => ({
        error: "Invalid response from server"
      }));

      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || `HTTP ${response.status}`);
      }

      toast({ 
        title: "Success!",
        description: "Credentials updated successfully" 
      });
      
      // Refresh admin info
      await fetchCurrentAdmin();
      
      setShowCredentialsForm(false);
      credentialsForm.reset();
    } catch (error) {
      console.error("Error updating credentials:", error);
      toast({ 
        title: "Error updating credentials",
        description: (error as Error).message,
        variant: "destructive" 
      });
    }
    setCredentialsLoading(false);
  };

  const onSubmit = (data: SettingsForm) => {
    update({ data: data as any }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-2xl" />;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-display font-bold">Global Settings</h2>
        <p className="text-muted-foreground mt-1">Configure app details, payments, UPI methods, and APK management.</p>
      </div>

      {/* Account Credentials Section */}
      <Card className="shadow-sm border-border/50 border-amber-200 bg-amber-50/30">
        <CardHeader className="bg-amber-100/40 border-b border-amber-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900">
              <Key className="w-5 h-5" />
              <div>
                <CardTitle>Account Credentials</CardTitle>
                <CardDescription className="text-amber-800">View and update your admin credentials</CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowCredentialsForm(!showCredentialsForm)}
              className="border-amber-200 hover:bg-amber-100"
            >
              {showCredentialsForm ? "Cancel" : "Change Credentials"}
            </Button>
          </div>
        </CardHeader>

        {/* Current Credentials Display */}
        {!showCredentialsForm && (
          <CardContent className="p-6 space-y-4">
            {loadingAdmin ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
              </div>
            ) : currentAdmin ? (
              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-amber-200 bg-white">
                  <Label className="text-xs text-amber-700 font-semibold uppercase">Current Username</Label>
                  <p className="text-lg font-semibold text-foreground mt-1">{currentAdmin.name}</p>
                </div>
                <div className="p-4 rounded-lg border border-amber-200 bg-white">
                  <Label className="text-xs text-amber-700 font-semibold uppercase">Email (Login ID)</Label>
                  <p className="text-lg font-mono text-foreground mt-1">{currentAdmin.email}</p>
                </div>
                <div className="p-4 rounded-lg border border-amber-200 bg-white">
                  <Label className="text-xs text-amber-700 font-semibold uppercase">Password</Label>
                  <p className="text-lg font-semibold text-foreground mt-1">••••••••</p>
                  <p className="text-xs text-muted-foreground mt-1">Password is encrypted and cannot be displayed</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        )}

        {/* Change Credentials Form */}
        {showCredentialsForm && (
          <CardContent className="p-6">
            <form onSubmit={credentialsForm.handleSubmit(handleCredentialsSubmit)} className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">Enter your current password to make any changes. Make sure to remember your new credentials.</p>
              </div>
              
              <div className="space-y-2">
                <Label>Current Password <span className="text-destructive">*</span></Label>
                <Input 
                  type="password"
                  {...credentialsForm.register("currentPassword")} 
                  placeholder="Enter your current password"
                  className="rounded-xl bg-white"
                  autoComplete="current-password"
                />
                {credentialsForm.formState.errors.currentPassword && (
                  <p className="text-xs text-destructive">{credentialsForm.formState.errors.currentPassword.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Username (optional)</Label>
                  <Input 
                    {...credentialsForm.register("newUsername")} 
                    placeholder="Leave blank to keep current username"
                    className="rounded-xl bg-white"
                    autoComplete="off"
                  />
                  {credentialsForm.formState.errors.newUsername && (
                    <p className="text-xs text-destructive">{credentialsForm.formState.errors.newUsername.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password (optional)</Label>
                  <Input 
                    type="password"
                    {...credentialsForm.register("newPassword")} 
                    placeholder="Leave blank to keep current password"
                    className="rounded-xl bg-white"
                    autoComplete="new-password"
                  />
                  {credentialsForm.formState.errors.newPassword && (
                    <p className="text-xs text-destructive">{credentialsForm.formState.errors.newPassword.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password (optional)</Label>
                  <Input 
                    type="password"
                    {...credentialsForm.register("confirmPassword")} 
                    placeholder="Re-enter new password"
                    className="rounded-xl bg-white"
                    autoComplete="new-password"
                  />
                  {credentialsForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{credentialsForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-amber-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCredentialsForm(false);
                    credentialsForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="btn-primary-gradient"
                  disabled={credentialsLoading}
                >
                  {credentialsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Update Credentials
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <div className="flex items-center gap-2 text-primary">
              <Smartphone className="w-5 h-5" />
              <CardTitle>App Information</CardTitle>
            </div>
            <CardDescription>General application details shown to users.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Application Name</Label>
              <Input {...form.register("appName")} className="rounded-xl bg-card" />
            </div>
            <div className="space-y-2">
              <Label>Support WhatsApp/Phone</Label>
              <Input {...form.register("supportPhone")} className="rounded-xl bg-card" placeholder="+91 9999999999" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <div className="flex items-center gap-2 text-primary">
              <Building className="w-5 h-5" />
              <CardTitle>Payment Configuration</CardTitle>
            </div>
            <CardDescription>Deposit destination details for your users.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 md:col-span-2 p-5 rounded-xl border border-border/50 bg-blue-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <QrCode className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-blue-900">UPI Integration</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-blue-900">Official UPI ID</Label>
                    <Input {...form.register("upiId")} className="rounded-xl bg-white border-blue-100" placeholder="merchant@upi" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-blue-900">QR Code Image URL</Label>
                    <div className="flex gap-2">
                      <Input {...form.register("qrCodeUrl")} className="rounded-xl bg-white border-blue-100 flex-1" placeholder="https://..." disabled />
                      <div className="relative">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                          onChange={handleQrCodeUpload}
                          disabled={uploadingQr}
                          className="sr-only"
                          id="qr-upload"
                        />
                        <label
                          htmlFor="qr-upload"
                          className="flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {uploadingQr ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <FileUp className="w-4 h-4" />
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-blue-700 mt-1">Upload PNG or JPEG (max 5MB)</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2 mt-2">
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-primary rounded-full" /> Manual Bank Transfer Details
                </h4>
              </div>

              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input {...form.register("bankName")} className="rounded-xl bg-card" placeholder="e.g. HDFC Bank" />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input {...form.register("bankAccountNumber")} className="rounded-xl bg-card font-mono" placeholder="00000000000" />
              </div>
              <div className="space-y-2">
                <Label>IFSC Code</Label>
                <Input {...form.register("bankIfscCode")} className="rounded-xl bg-card font-mono uppercase" placeholder="HDFC0000123" />
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-border/50 flex justify-end">
              <Button type="submit" className="btn-primary-gradient px-8 h-12 text-base shadow-lg" disabled={isPending}>
                {isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* UPI Methods Section */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <div className="flex items-center gap-2 text-primary">
            <QrCode className="w-5 h-5" />
            <CardTitle>UPI Payment Methods</CardTitle>
          </div>
          <CardDescription>Add multiple UPI payment options (PhonePe, Paytm, Google Pay, etc.)</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Add New UPI Method */}
          <div className="border-b border-border/50 pb-6 space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add New UPI Method
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>UPI Provider Name</Label>
                <Input
                  placeholder="e.g. PhonePe"
                  value={newUpi.name}
                  onChange={(e) => setNewUpi({ ...newUpi, name: e.target.value })}
                  className="rounded-xl bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label>UPI ID</Label>
                <Input
                  placeholder="e.g. business@phonepe"
                  value={newUpi.upiId}
                  onChange={(e) => setNewUpi({ ...newUpi, upiId: e.target.value })}
                  className="rounded-xl bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label>Display Name (Optional)</Label>
                <Input
                  placeholder="e.g. PhonePe Business"
                  value={newUpi.displayName}
                  onChange={(e) => setNewUpi({ ...newUpi, displayName: e.target.value })}
                  className="rounded-xl bg-card"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={handleAddUpi}
              className="btn-primary-gradient"
            >
              <Plus className="w-4 h-4 mr-2" /> Add UPI Method
            </Button>
          </div>

          {/* UPI Methods List */}
          {loadingUpi ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : !Array.isArray(upiMethods) || upiMethods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No UPI methods added yet
            </div>
          ) : (
            <div className="space-y-3">
              {(upiMethods as any[]).map((method) => (
                <div
                  key={method.id}
                  className="p-4 rounded-lg border border-border/50 bg-muted/20 flex items-center justify-between"
                >
                  <div>
                    <h5 className="font-semibold">{method.name}</h5>
                    <p className="text-sm text-muted-foreground">{method.upiId}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteUpi(method.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* APK Files Section */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="bg-muted/20 border-b border-border/50">
          <div className="flex items-center gap-2 text-primary">
            <Download className="w-5 h-5" />
            <CardTitle>APK File Management</CardTitle>
          </div>
          <CardDescription>Upload and manage application APK files for distribution</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Upload APK File */}
          <div className="border-b border-border/50 pb-6 space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <FileUp className="w-4 h-4" /> Upload New APK
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Version Code</Label>
                <Input
                  placeholder="e.g. 2"
                  value={newApkVersion.versionCode}
                  onChange={(e) => setNewApkVersion({ ...newApkVersion, versionCode: e.target.value })}
                  className="rounded-xl bg-card"
                  type="number"
                />
              </div>
              <div className="space-y-2">
                <Label>Version Name</Label>
                <Input
                  placeholder="e.g. 1.0.1"
                  value={newApkVersion.versionName}
                  onChange={(e) => setNewApkVersion({ ...newApkVersion, versionName: e.target.value })}
                  className="rounded-xl bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label>APK File</Label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".apk"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="sr-only"
                    id="apk-upload"
                  />
                  <label
                    htmlFor="apk-upload"
                    className="flex items-center justify-center px-4 py-2 rounded-xl border-2 border-dashed cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {uploadingFile ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <FileUp className="w-5 h-5 mr-2" />
                        Choose File
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* APK Files List */}
          {loadingApk ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : !Array.isArray(apkFiles) || apkFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No APK files uploaded yet
            </div>
          ) : (
            <div className="space-y-3">
              {(apkFiles as any[]).map((file) => (
                <div
                  key={file.id}
                  className="p-4 rounded-lg border border-border/50 bg-muted/20"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h5 className="font-semibold">{file.filename}</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm text-muted-foreground">
                        <p>Version: {file.versionName} (Code: {file.versionCode})</p>
                        <p>Size: {(parseInt(file.filesize) / 1024 / 1024).toFixed(2)} MB</p>
                        <p>Status: {file.isActive === "true" ? "Active" : "Inactive"}</p>
                        <p>{new Date(file.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a href={file.filepath} download className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteApk(file.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

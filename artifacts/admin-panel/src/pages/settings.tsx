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
import { Loader2, Smartphone, Building, QrCode, Download, Trash2, Plus, FileUp } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://matka-api-server.onrender.com";

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

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

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
      
      // Update the form with new QR code URL
      form.setValue("qrCodeUrl", data.qrCodeUrl);
      
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
  }, [settings, form]);

  const onSubmit = (data: SettingsForm) => {
    update({ data }, {
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

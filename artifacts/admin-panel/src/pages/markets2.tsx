import { useState, useEffect, useCallback, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Edit2, Trash2, Clock, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, Zap, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Market {
  id: number;
  name: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
  openResult?: string;
  closeResult?: string;
  jodiResult?: string;
  autoUpdate: boolean;
  sourceUrl?: string;
  lastFetchedAt?: string;
  fetchError?: string;
  createdAt: string;
}

type MarketForm = z.infer<typeof marketSchema>;
type AutoConfigForm = z.infer<typeof autoConfigSchema>;

const marketSchema = z.object({
  name: z.string().min(1, "Name is required"),
  openTime: z.string().min(1, "Open time is required"),
  closeTime: z.string().min(1, "Close time is required"),
  isActive: z.boolean(),
});

const autoConfigSchema = z.object({
  autoUpdate: z.boolean(),
  sourceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

// Helper function to check for hard fetch errors
function isHardFetchError(fetchError?: string | null | undefined): boolean {
  if (!fetchError) return false;
  const msg = fetchError.toLowerCase();
  if (msg.includes("invalid result format") || msg.includes("null")) {
    return false;
  }
  return true;
}

function MarketDialog({ market, open, setOpen, onSave }: { market?: Market | null; open: boolean; setOpen: (v: boolean) => void; onSave: (data: any) => Promise<void> }) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<MarketForm>({
    resolver: zodResolver(marketSchema),
    defaultValues: {
      name: market?.name || "",
      openTime: market?.openTime || "09:00",
      closeTime: market?.closeTime || "21:00",
      isActive: market?.isActive ?? true,
    },
  });

  const handleSubmit = async (data: MarketForm) => {
    setIsSaving(true);
    try {
      await onSave(data);
      setOpen(false);
      form.reset();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[95%] max-w-[425px] sm:max-w-[425px] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">{market ? "Edit Market" : "Add New Market"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3 sm:space-y-4 pt-4">
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">Market Name</Label>
            <Input {...form.register("name")} placeholder="e.g. KALYAN" className="rounded-xl h-8 sm:h-9 text-xs sm:text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Open Time</Label>
              <Input type="time" {...form.register("openTime")} className="rounded-xl h-8 sm:h-9 text-xs sm:text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Close Time</Label>
              <Input type="time" {...form.register("closeTime")} className="rounded-xl h-8 sm:h-9 text-xs sm:text-sm" />
            </div>
          </div>
          <div className="flex items-center justify-between p-2 sm:p-4 rounded-xl border border-border/50 bg-muted/30">
            <Label className="cursor-pointer text-xs sm:text-sm">Active Status</Label>
            <Switch checked={form.watch("isActive")} onCheckedChange={(c) => form.setValue("isActive", c)} />
          </div>
          <Button
            type="submit"
            className="w-full btn-primary-gradient mt-2 h-8 sm:h-9 text-xs sm:text-sm"
            disabled={isSaving}
          >
            {market ? "Update Market" : "Create Market"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AutoConfigDialog({ market, open, setOpen, onSave }: { market: Market; open: boolean; setOpen: (v: boolean) => void; onSave: (data: any) => Promise<void> }) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<AutoConfigForm>({
    resolver: zodResolver(autoConfigSchema),
    defaultValues: {
      autoUpdate: market.autoUpdate,
      sourceUrl: market.sourceUrl || "",
    },
  });

  const handleSubmit = async (data: AutoConfigForm) => {
    setIsSaving(true);
    try {
      await onSave(data);
      setOpen(false);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[95%] max-w-[480px] sm:max-w-[480px] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Auto-Update Config — {market.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3 sm:space-y-5 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-4 rounded-xl border border-border/50 bg-muted/30 gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <Label className="font-medium text-xs sm:text-sm">Enable Auto Update</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically fetch results every minute</p>
            </div>
            <Switch checked={form.watch("autoUpdate")} onCheckedChange={(c) => form.setValue("autoUpdate", c)} className="flex-shrink-0" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">Source URL</Label>
            <Input
              {...form.register("sourceUrl")}
              placeholder="https://example.com/results"
              className="rounded-xl font-mono text-xs sm:text-sm h-8 sm:h-9"
            />
            <p className="text-xs text-muted-foreground">
              Supports JSON APIs and HTML pages.
            </p>
            {form.formState.errors.sourceUrl && (
              <p className="text-xs text-destructive">{form.formState.errors.sourceUrl.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full btn-primary-gradient h-8 sm:h-9 text-xs sm:text-sm" disabled={isSaving}>
            Save Configuration
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function Markets2() {
  const { toast } = useToast();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [todayResults, setTodayResults] = useState<Record<number, { open?: string; jodi?: string; close?: string; date?: string }>>({});
  const [yesterdayResults, setYesterdayResults] = useState<Record<number, { open?: string; jodi?: string; close?: string; date?: string }>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMarket, setEditingMarket] = useState<Market | null>(null);
  const [autoConfigMarket, setAutoConfigMarket] = useState<Market | null>(null);
  const [fetchingId, setFetchingId] = useState<number | null>(null);

  const token = localStorage.getItem("token");

  // Debug effect - check token and log initial state
  useEffect(() => {
    console.log("[Markets2] Component mounted");
    console.log("[Markets2] Token:", token ? "✅ Present" : "❌ Missing");
    console.log("[Markets2] Markets loaded:", markets.length, "items");
    return () => console.log("[Markets2] Component unmounted");
  }, [token, markets.length]);

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    if (!token) {
      console.warn("[Markets2] No token found - cannot fetch markets");
      setIsLoading(false);
      toast({ title: "Not Authenticated", description: "Please login to continues", variant: "destructive" });
      return;
    }
    console.log("[Markets2] Fetching markets...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/markets2`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      console.log("[Markets2] Fetch response status:", response.status);
      if (!response.ok) throw new Error(`Failed to fetch markets: ${response.status}`);
      const data = await response.json();
      console.log("[Markets2] Markets fetched:", data.length, "items");
      setMarkets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching markets2:", error);
      toast({ title: "Error", description: "Failed to fetch markets", variant: "destructive" });
      setMarkets([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);


  // Initialize today's results from market data
  useEffect(() => {
    if (markets.length === 0) return;
    const results: Record<number, { open?: string; jodi?: string; close?: string; date?: string }> = {};
    for (const market of markets) {
      if (market.openResult || market.jodiResult || market.closeResult) {
        results[market.id] = {
          open: market.openResult,
          jodi: market.jodiResult,
          close: market.closeResult,
          date: market.lastFetchedAt ? format(new Date(market.lastFetchedAt), "d MMM") : undefined,
        };
      }
    }
    setTodayResults(results);
  }, [markets]);

  // Fetch yesterday's results from API for each market
  useEffect(() => {
    if (markets.length === 0) return;
    
    const fetchYesterdayResults = async () => {
      const results: Record<number, { open?: string; jodi?: string; close?: string; date?: string }> = {};
      
      for (const market of markets) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/markets2/${market.id}/results-both-days`);
          if (response.ok) {
            const data = await response.json();
            if (data.yesterday && data.yesterday.result) {
              // Parse the 2-digit jodi into open/jodi/close
              const result = data.yesterday.result;
              results[market.id] = {
                jodi: result,
                open: result.charAt(0),
                close: result.charAt(1),
                date: data.yesterday.date ? format(new Date(data.yesterday.date), "d MMM") : undefined,
              };
            }
          }
        } catch (err) {
          console.log(`Could not fetch yesterday's result for market ${market.id}`);
        }
      }
      
      setYesterdayResults(results);
    };
    
    fetchYesterdayResults();
  }, [markets]);



  const handleSaveMarket = async (data: MarketForm) => {
    try {
      const url = editingMarket ? `${API_BASE_URL}/api/markets2/${editingMarket.id}` : `${API_BASE_URL}/api/markets2`;
      const method = editingMarket ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        toast({ title: `Market ${editingMarket ? "updated" : "created"} successfully` });
        fetchMarkets();
        setDialogOpen(false);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to save market: ${response.status}`);
      }
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this market?")) return;
    try {
      console.log(`[Markets2] Deleting market ${id}...`);
      const response = await fetch(`${API_BASE_URL}/api/markets2/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      console.log(`[Markets2] Delete response status: ${response.status}`);
      
      if (response.ok) {
        toast({ title: "Market deleted successfully" });
        fetchMarkets();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[Markets2] Delete error:`, errorData);
        throw new Error(errorData.error || errorData.message || `Failed to delete market (${response.status})`);
      }
    } catch (error) {
      console.error(`[Markets2] Delete exception:`, error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleFetchNow = async (market: Market) => {
    setFetchingId(market.id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/markets2/${market.id}/fetch-now`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      const message = result.message || result.error || "Unknown error";

      if (!response.ok) {
        // Handle error response
        setMarkets((prev) => prev.map((m) => m.id === market.id ? {
          ...m,
          fetchError: message,
          lastFetchedAt: new Date().toISOString(),
        } : m));

        toast({ 
          title: "Fetch Failed", 
          description: message,
          variant: "destructive" 
        });
        return;
      }

      if (result.success && result.data) {
        setTodayResults((prev) => ({
          ...prev,
          [market.id]: {
            open: result.data.openResult ?? market.openResult ?? "***",
            jodi: result.data.jodiResult ?? market.jodiResult ?? "**",
            close: result.data.closeResult ?? market.closeResult ?? "***",
            date: new Date().toLocaleDateString("en-US", { day: "numeric", month: "short" }),
          },
        }));

        setMarkets((prev) => prev.map((m) => m.id === market.id ? {
          ...m,
          openResult: result.data.openResult ?? m.openResult,
          jodiResult: result.data.jodiResult ?? m.jodiResult,
          closeResult: result.data.closeResult ?? m.closeResult,
          lastFetchedAt: new Date().toISOString(),
          fetchError: undefined,
        } : m));

        toast({ title: "✓ Fetch successful", description: message });
      } else if (message.toLowerCase().includes("can fetch only after")) {
        // Timing issue - market not yet closed
        toast({ title: "Not yet time", description: message });
      } else if (message.toLowerCase().includes("not yet available") || message.toLowerCase().includes("temporary placeholder")) {
        // Results showing as XX - temporary placeholder
        setMarkets((prev) => prev.map((m) => m.id === market.id ? {
          ...m,
          fetchError: undefined,
          lastFetchedAt: new Date().toISOString(),
        } : m));

        toast({ title: "Results - Temporary (XX)", description: message });
      } else if (message.toLowerCase().includes("invalid result format")) {
        // Real error - data from website is in unexpected format
        setMarkets((prev) => prev.map((m) => m.id === market.id ? {
          ...m,
          fetchError: message,
          lastFetchedAt: new Date().toISOString(),
        } : m));

        toast({ 
          title: "Format Error - Check website", 
          description: `Website returned unexpected format: ${message}`, 
          variant: "destructive" 
        });
      } else if (message.toLowerCase().includes("not found")) {
        // Market or results not found on website
        setMarkets((prev) => prev.map((m) => m.id === market.id ? {
          ...m,
          fetchError: message,
          lastFetchedAt: new Date().toISOString(),
        } : m));

        toast({ 
          title: "Not found on website", 
          description: message 
        });
      } else {
        // Generic error
        setMarkets((prev) => prev.map((m) => m.id === market.id ? {
          ...m,
          fetchError: message,
          lastFetchedAt: new Date().toISOString(),
        } : m));

        toast({ title: "Fetch Failed", description: message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setFetchingId(null);
    }
  };

  const handleAutoConfig = async (data: AutoConfigForm) => {
    if (!autoConfigMarket) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/markets2/${autoConfigMarket.id}/auto-config`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          autoUpdate: data.autoUpdate,
          sourceUrl: data.sourceUrl || null,
        }),
      });
      if (response.ok) {
        toast({ title: "Auto-update settings saved" });
        fetchMarkets();
        setAutoConfigMarket(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to save auto-config: ${response.status}`);
      }
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  // Toggle autoUpdate on/off
  const handleToggleAutoUpdate = async (market: Market, newValue: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/markets2/${market.id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          autoUpdate: newValue,
        }),
      });
      if (response.ok) {
        toast({ 
          title: newValue ? "Auto-update enabled" : "Auto-update disabled",
          description: newValue ? "Market will update every minute" : "Manual updates only"
        });
        fetchMarkets();
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };


  const openEdit = (m: Market) => {
    setEditingMarket(m);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingMarket(null);
    setDialogOpen(true);
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-2xl" />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-display font-bold">Markets 2</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage markets, timings, and auto-result updates.</p>
        </div>
        <Button onClick={openCreate} className="btn-primary-gradient gap-2 w-full sm:w-auto flex-shrink-0 text-sm sm:text-base h-9 sm:h-10">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Market</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto lg:overflow-visible">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hidden lg:table-row">
                <TableHead className="pl-2 sm:pl-4 lg:pl-6 min-w-[140px] text-xs sm:text-sm">Market Name</TableHead>
                <TableHead className="px-2 sm:px-4 min-w-[130px] text-xs sm:text-sm">Timings</TableHead>
                <TableHead className="px-2 sm:px-4 min-w-[160px] text-xs sm:text-sm">Yesterday (O/J/C)</TableHead>
                <TableHead className="px-2 sm:px-4 min-w-[160px] text-xs sm:text-sm">Today (O/J/C)</TableHead>
                <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">Status</TableHead>
                <TableHead className="px-2 sm:px-4 min-w-[100px] text-xs sm:text-sm">Auto Update</TableHead>
                <TableHead className="px-2 sm:px-4 min-w-[180px] text-xs sm:text-sm">Source URL</TableHead>
                <TableHead className="px-2 sm:px-4 min-w-[140px] text-xs sm:text-sm">Last Fetched</TableHead>
                <TableHead className="pr-2 sm:pr-4 lg:pr-6 text-right min-w-[150px] text-xs sm:text-sm">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!Array.isArray(markets) ? null : (markets as any[]).map((market) => {
                // Ensure isActive and autoUpdate are booleans
                const isActive = typeof market.isActive === 'string' ? market.isActive === 'true' : market.isActive;
                const autoUpdate = typeof market.autoUpdate === 'string' ? market.autoUpdate === 'true' : market.autoUpdate;
                
                return (
                  <>
                    <TableRow key={`desktop-${market.id}`} className="hidden lg:table-row">
                  <TableCell className="pl-2 sm:pl-4 lg:pl-6 font-semibold text-xs sm:text-sm">{market.name}</TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {market.openTime} – {market.closeTime}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <div className="space-y-1 text-xs">
                      <div className="text-xs text-muted-foreground font-medium">{yesterdayResults[market.id]?.date || "—"}</div>
                      <div className="font-mono font-semibold tracking-widest text-primary">O: {yesterdayResults[market.id]?.open ?? "**"}</div>
                      <div className="font-mono font-semibold tracking-widest text-primary">J: {yesterdayResults[market.id]?.jodi ?? "**"}</div>
                      <div className="font-mono font-semibold tracking-widest text-primary">C: {yesterdayResults[market.id]?.close ?? "**"}</div>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <div className="space-y-1 text-xs">
                      <div className="text-xs text-muted-foreground font-medium">{todayResults[market.id]?.date || "—"}</div>
                      <div className="font-mono font-semibold tracking-widest text-primary">O: {todayResults[market.id]?.open ?? market.openResult ?? "**"}</div>
                      <div className="font-mono font-semibold tracking-widest text-primary">J: {todayResults[market.id]?.jodi ?? market.jodiResult ?? "**"}</div>
                      <div className="font-mono font-semibold tracking-widest text-primary">C: {todayResults[market.id]?.close ?? market.closeResult ?? "**"}</div>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={isActive ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                    >
                      {isActive ? "Active" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <div className="flex items-center gap-2">
                      {autoUpdate ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAutoUpdate(market, false)}
                          className="bg-blue-500 hover:bg-blue-600 text-white gap-1 text-xs h-6"
                        >
                          <Wifi className="w-3 h-3" /> ON
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleAutoUpdate(market, true)}
                          className="gap-1 text-xs h-6"
                        >
                          <WifiOff className="w-3 h-3" /> OFF
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <div className="flex items-center gap-1.5 max-w-[200px]">
                      {market.sourceUrl ? (
                        <>
                          {isHardFetchError(market.fetchError) ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>{market.fetchError}</TooltipContent>
                            </Tooltip>
                          ) : market.lastFetchedAt ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          ) : null}
                          <span className="text-xs text-muted-foreground truncate font-mono">{market.sourceUrl}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not configured</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    <span className="text-xs text-muted-foreground">
                      {market.lastFetchedAt ? format(new Date(market.lastFetchedAt), "dd MMM, HH:mm") : "Never"}
                    </span>
                  </TableCell>
                  <TableCell className="pr-2 sm:pr-4 lg:pr-6 text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleFetchNow(market)}
                            disabled={fetchingId === market.id}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 w-8 h-8"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${fetchingId === market.id ? "animate-spin" : ""}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Fetch Now</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAutoConfigMarket(market)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-8 h-8"
                          >
                            <Wifi className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Auto-Update Config</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(market)}
                            className="text-slate-600 hover:text-slate-700 hover:bg-slate-50 w-8 h-8"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(market.id)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 w-8 h-8"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>

                {/* Mobile Card View */}
                <TableRow key={`mobile-${market.id}`} className="lg:hidden border-b">
                  <TableCell colSpan={9} className="p-0">
                    <div className="p-2 sm:p-4 space-y-2 sm:space-y-3 bg-white">
                      {/* Market Name Header */}
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-xs sm:text-sm text-foreground flex-1">{market.name}</h3>
                        <Badge
                          variant={isActive ? "default" : "secondary"}
                          className={`flex-shrink-0 text-xs ${isActive ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}
                        >
                          {isActive ? "Active" : "Closed"}
                        </Badge>
                      </div>

                      {/* Timings */}
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span>
                          {market.openTime} – {market.closeTime}
                        </span>
                      </div>

                      {/* Yesterday Results */}
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Yesterday (O/J/C)</p>
                        <div className="text-xs text-muted-foreground">{yesterdayResults[market.id]?.date || "—"}</div>
                        <div className="font-mono font-semibold text-primary text-xs tracking-widest">
                          O: {yesterdayResults[market.id]?.open ?? "**"}
                        </div>
                        <div className="font-mono font-semibold text-primary text-xs tracking-widest">
                          J: {yesterdayResults[market.id]?.jodi ?? "**"}
                        </div>
                        <div className="font-mono font-semibold text-primary text-xs tracking-widest">
                          C: {yesterdayResults[market.id]?.close ?? "**"}
                        </div>
                      </div>

                      {/* Today Results */}
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Today (O/J/C)</p>
                        <div className="text-xs text-muted-foreground">{todayResults[market.id]?.date || "—"}</div>
                        <div className="font-mono font-semibold text-primary text-xs tracking-widest">
                          O: {todayResults[market.id]?.open ?? market.openResult ?? "**"}
                        </div>
                        <div className="font-mono font-semibold text-primary text-xs tracking-widest">
                          J: {todayResults[market.id]?.jodi ?? market.jodiResult ?? "**"}
                        </div>
                        <div className="font-mono font-semibold text-primary text-xs tracking-widest">
                          C: {todayResults[market.id]?.close ?? market.closeResult ?? "**"}
                        </div>
                      </div>

                      {/* Auto Update */}
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Auto Update</p>
                        <div className="flex gap-2">
                          {autoUpdate ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleAutoUpdate(market, false)}
                              className="bg-blue-500 hover:bg-blue-600 text-white gap-1 text-xs h-7 flex-1"
                            >
                              <Wifi className="w-3 h-3" /> ON
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleAutoUpdate(market, true)}
                              className="gap-1 text-xs h-7 flex-1"
                            >
                              <WifiOff className="w-3 h-3" /> OFF
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Source URL */}
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Source URL</p>
                        <div className="flex items-center gap-1 text-xs">
                          {market.sourceUrl ? (
                            <>
                              {isHardFetchError(market.fetchError) ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[200px]">{market.fetchError}</TooltipContent>
                                </Tooltip>
                              ) : market.lastFetchedAt ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              ) : null}
                              <span className="text-muted-foreground truncate font-mono break-all text-xs">{market.sourceUrl}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">Not configured</span>
                          )}
                        </div>
                      </div>

                      {/* Last Fetched */}
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Last Fetched</p>
                        <span className="text-xs text-muted-foreground">
                          {market.lastFetchedAt ? format(new Date(market.lastFetchedAt), "dd MMM, HH:mm") : "Never"}
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-1 pt-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleFetchNow(market)}
                              disabled={fetchingId === market.id}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 w-8 h-8"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${fetchingId === market.id ? "animate-spin" : ""}`} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Fetch Now</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setAutoConfigMarket(market)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-8 h-8"
                            >
                              <Zap className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Auto Config</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setEditingMarket(market); setDialogOpen(true); }}
                              className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 w-8 h-8"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(market.id)}
                              className="text-destructive hover:text-red-700 hover:bg-red-50 w-8 h-8"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
                </>
              );
              })}
              {(!Array.isArray(markets) || markets.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-xs sm:text-sm">
                    No markets found. Add your first market.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {dialogOpen && <MarketDialog open={dialogOpen} setOpen={setDialogOpen} market={editingMarket} onSave={handleSaveMarket} />}
      {autoConfigMarket && (
        <AutoConfigDialog
          open={!!autoConfigMarket}
          setOpen={(v) => !v && setAutoConfigMarket(null)}
          market={autoConfigMarket}
          onSave={handleAutoConfig}
        />
      )}
    </div>
  );
}

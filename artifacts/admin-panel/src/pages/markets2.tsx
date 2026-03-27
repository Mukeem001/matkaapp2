import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Edit2, Trash2, Clock, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, Calendar } from "lucide-react";
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

// Helper function to determine result format based on URL
function getResultFormat(sourceUrl?: string): "full" | "jodi-only" {
  if (!sourceUrl) return "full"; // Default to full format
  if (sourceUrl.includes("satta-king-fast.com")) return "jodi-only";
  return "full";
}

// Helper function to format results display
function formatResultsDisplay(results: { open?: string; jodi?: string; close?: string } | undefined, format: "full" | "jodi-only"): string {
  if (!results) return format === "jodi-only" ? "**" : "*** - ** - ***";
  
  if (format === "jodi-only") {
    return results.jodi || "**";
  } else {
    return `${results.open || "***"} - ${results.jodi || "**"} - ${results.close || "***"}`;
  }
}

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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{market ? "Edit Market" : "Add New Market"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Market Name</Label>
            <Input {...form.register("name")} placeholder="e.g. KALYAN" className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Open Time</Label>
              <Input type="time" {...form.register("openTime")} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Close Time</Label>
              <Input type="time" {...form.register("closeTime")} className="rounded-xl" />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/30">
            <Label className="cursor-pointer">Active Status</Label>
            <Switch checked={form.watch("isActive")} onCheckedChange={(c) => form.setValue("isActive", c)} />
          </div>
          <Button
            type="submit"
            className="w-full btn-primary-gradient mt-2"
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Auto-Update Config — {market.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 pt-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/30">
            <div>
              <Label className="font-medium">Enable Auto Update</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically fetch results every minute</p>
            </div>
            <Switch checked={form.watch("autoUpdate")} onCheckedChange={(c) => form.setValue("autoUpdate", c)} />
          </div>
          <div className="space-y-2">
            <Label>Source URL</Label>
            <Input
              {...form.register("sourceUrl")}
              placeholder="https://example.com/results or https://api.example.com/results.json"
              className="rounded-xl font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supports JSON APIs and HTML pages. JSON keys: open, close, jodi. HTML will be scraped automatically.
            </p>
            {form.formState.errors.sourceUrl && (
              <p className="text-xs text-destructive">{form.formState.errors.sourceUrl.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full btn-primary-gradient" disabled={isSaving}>
            Save Configuration
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://matka-api-server.onrender.com";

export default function Markets2() {
  const { toast } = useToast();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dateResults, setDateResults] = useState<Record<number, { open?: string; jodi?: string; close?: string }>>({});
  const [currentResults, setCurrentResults] = useState<Record<number, { open?: string; jodi?: string; close?: string }>>({});
  const [liveResults, setLiveResults] = useState<Record<number, { open?: string; jodi?: string; close?: string }>>({});
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

  // Fetch results for selected date
  useEffect(() => {
    const fetchResultsForDate = async () => {
      if (markets.length === 0 || !token) return;
      const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};
      for (const market of markets) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/markets2/${market.id}/results/${selectedDate}`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (!response.ok) {
            console.error(`Failed to fetch results for market ${market.id}: ${response.status}`);
            continue;
          }
          const data = await response.json();
          if (data.success && data.data) {
            results[market.id] = {
              open: data.data.openResult,
              jodi: data.data.jodiResult,
              close: data.data.closeResult,
            };
          }
        } catch (error) {
          console.error(`Error fetching results for market ${market.id}:`, error);
        }
      }
      setDateResults(results);
    };
    fetchResultsForDate();
  }, [selectedDate, markets, token]);

  // Initialize current results from market data (not a POST fetch)
  useEffect(() => {
    if (markets.length === 0) return;
    const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};
    for (const market of markets) {
      if (market.openResult || market.jodiResult || market.closeResult) {
        results[market.id] = {
          open: market.openResult,
          jodi: market.jodiResult,
          close: market.closeResult,
        };
      }
    }
    setCurrentResults(results);
  }, [markets]);

  // Initialize live results from market data (not a GET fetch)
  useEffect(() => {
    if (markets.length === 0) return;
    const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};
    for (const market of markets) {
      if (market.openResult || market.jodiResult || market.closeResult) {
        results[market.id] = {
          open: market.openResult,
          jodi: market.jodiResult,
          close: market.closeResult,
        };
      }
    }
    setLiveResults(results);
  }, [markets]);

  const displayDate = useMemo(() => {
    const date = new Date(selectedDate);
    const today = new Date();
    const isCurrentDate = format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    return `${format(date, "dd MMM, yyyy")}${isCurrentDate ? " (Today)" : ""}`;
  }, [selectedDate]);

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
      const response = await fetch(`${API_BASE_URL}/api/markets2/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        toast({ title: "Market deleted" });
        fetchMarkets();
      } else {
        throw new Error("Failed to delete market");
      }
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleFetchNow = async (market: Market) => {
    if (!market.sourceUrl) {
      toast({ title: "No source URL", variant: "destructive" });
      return;
    }

    setFetchingId(market.id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/markets2/${market.id}/fetch-now`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const result = await response.json();
      const message = typeof result.message === "string" ? result.message : "No result data";

      if (result.success && result.data) {
        setCurrentResults((prev) => ({
          ...prev,
          [market.id]: {
            open: result.data.openResult ?? market.openResult ?? "***",
            jodi: result.data.jodiResult ?? market.jodiResult ?? "**",
            close: result.data.closeResult ?? market.closeResult ?? "***",
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Markets 2 - Alternative View</h2>
          <p className="text-muted-foreground mt-1">Alternative market management view with same controls.</p>
        </div>
        <Button onClick={openCreate} className="btn-primary-gradient gap-2">
          <Plus className="w-4 h-4" /> Add Market
        </Button>
      </div>

      {/* Date Picker Section */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Select Date:</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg w-[180px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
                className="rounded-lg"
              >
                Today
              </Button>
            </div>
            <div className="ml-auto text-sm font-semibold text-primary bg-muted/50 px-3 py-1.5 rounded-lg">
              {displayDate}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="pl-6 min-w-[140px]">Market Name</TableHead>
                <TableHead className="min-w-[130px]">Timings</TableHead>
                <TableHead className="min-w-[160px]">Current Results</TableHead>
                <TableHead className="min-w-[160px]">Results ({displayDate.split("(")[0].trim()})</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[100px]">Auto Update</TableHead>
                <TableHead className="min-w-[180px]">Source URL</TableHead>
                <TableHead className="min-w-[140px]">Last Fetched</TableHead>
                <TableHead className="text-right pr-6 min-w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!Array.isArray(markets) ? null : (markets as any[]).map((market) => {
                // Ensure isActive and autoUpdate are booleans
                const isActive = typeof market.isActive === 'string' ? market.isActive === 'true' : market.isActive;
                const autoUpdate = typeof market.autoUpdate === 'string' ? market.autoUpdate === 'true' : market.autoUpdate;
                
                return (
                <TableRow key={market.id}>
                  <TableCell className="pl-6 font-semibold">{market.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {market.openTime} – {market.closeTime}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono font-semibold tracking-widest text-primary text-sm">
                      {formatResultsDisplay(
                        currentResults[market.id] || (market.openResult || market.jodiResult || market.closeResult ? {
                          open: market.openResult,
                          jodi: market.jodiResult,
                          close: market.closeResult,
                        } : undefined),
                        getResultFormat(market.sourceUrl)
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono font-semibold tracking-widest text-primary text-sm">
                      {formatResultsDisplay(
                        dateResults[market.id] || (market.openResult || market.jodiResult || market.closeResult ? {
                          open: market.openResult,
                          jodi: market.jodiResult,
                          close: market.closeResult,
                        } : undefined),
                        getResultFormat(market.sourceUrl)
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={isActive ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                    >
                      {isActive ? "Active" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {autoUpdate ? (
                        <Badge className="bg-blue-500 hover:bg-blue-600 gap-1 text-xs">
                          <Wifi className="w-3 h-3" /> ON
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <WifiOff className="w-3 h-3" /> OFF
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {market.lastFetchedAt ? format(new Date(market.lastFetchedAt), "dd MMM, HH:mm") : "Never"}
                    </span>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
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
              );
              })}
              {(!Array.isArray(markets) || markets.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
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

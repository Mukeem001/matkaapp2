import { useState, useMemo, useEffect } from "react";
import {
  useGetMarkets,
  useCreateMarket,
  useUpdateMarket,
  useDeleteMarket,
  useUpdateMarketAutoConfig,
  getGetMarketsQueryKey,
} from "@workspace/api-client-react";
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
import type { Market } from "@workspace/api-client-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://matka-api-server.onrender.com";

const marketSchema = z.object({
  name: z.string().min(1, "Name is required"),
  openTime: z.string().min(1, "Open time is required"),
  closeTime: z.string().min(1, "Close time is required"),
  isActive: z.boolean(),
});

type MarketForm = z.infer<typeof marketSchema>;

const autoConfigSchema = z.object({
  autoUpdate: z.boolean(),
  sourceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});
type AutoConfigForm = z.infer<typeof autoConfigSchema>;

function MarketDialog({ market, open, setOpen }: { market?: Market | null; open: boolean; setOpen: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateMarket();
  const updateMutation = useUpdateMarket();

  const form = useForm<MarketForm>({
    resolver: zodResolver(marketSchema),
    defaultValues: {
      name: market?.name || "",
      openTime: market?.openTime || "09:00",
      closeTime: market?.closeTime || "21:00",
      isActive: market?.isActive ?? true,
    },
  });

  const onSubmit = (data: MarketForm) => {
    const action = market
      ? updateMutation.mutateAsync({ id: market.id, data })
      : createMutation.mutateAsync({ data });

    action
      .then(() => {
        queryClient.invalidateQueries({ queryKey: getGetMarketsQueryKey() });
        toast({ title: `Market ${market ? "updated" : "created"} successfully` });
        setOpen(false);
        form.reset();
      })
      .catch((err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{market ? "Edit Market" : "Add New Market"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {market ? "Update Market" : "Create Market"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AutoConfigDialog({ market, open, setOpen }: { market: Market; open: boolean; setOpen: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const autoConfigMutation = useUpdateMarketAutoConfig();

  const form = useForm<AutoConfigForm>({
    resolver: zodResolver(autoConfigSchema),
    defaultValues: {
      autoUpdate: market.autoUpdate,
      sourceUrl: market.sourceUrl || "",
    },
  });

  const onSubmit = (data: AutoConfigForm) => {
    autoConfigMutation
      .mutateAsync({
        id: market.id,
        data: {
          autoUpdate: data.autoUpdate,
          sourceUrl: data.sourceUrl || null,
        },
      })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: getGetMarketsQueryKey() });
        toast({ title: "Auto-update settings saved" });
        setOpen(false);
      })
      .catch((err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Auto-Update Config — {market.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-4">
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
          <Button type="submit" className="w-full btn-primary-gradient" disabled={autoConfigMutation.isPending}>
            Save Configuration
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Markets() {
  // ============================================================================
  // SECTION 1: ALL HOOKS DECLARED HERE - NO CONDITIONAL LOGIC ABOVE THIS POINT
  // ============================================================================

  const { data: markets, isLoading, error, refetch } = useGetMarkets();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteMarket();

  // State Management
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dateResults, setDateResults] = useState<Record<number, { open?: string; jodi?: string; close?: string }>>({});
  const [currentResults, setCurrentResults] = useState<Record<number, { open?: string; jodi?: string; close?: string }>>({});
  const [liveResults, setLiveResults] = useState<Record<number, { open?: string; jodi?: string; close?: string }>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMarket, setEditingMarket] = useState<Market | null>(null);
  const [autoConfigMarket, setAutoConfigMarket] = useState<Market | null>(null);
  const [fetchingId, setFetchingId] = useState<number | null>(null);

  // Memoized values
  const displayDate = useMemo(() => {
    const date = new Date(selectedDate);
    const today = new Date();
    const isCurrentDate = format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    return `${format(date, "dd MMM, yyyy")}${isCurrentDate ? " (Today)" : ""}`;
  }, [selectedDate]);

  // Effect 1: Fetch results for selected date
  useEffect(() => {
    const fetchResultsForDate = async () => {
      if (!markets || !Array.isArray(markets)) return;

      const token = localStorage.getItem("token");
      if (!token) return;

      const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};

      for (const market of markets) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/markets/${market.id}/results/${selectedDate}`,
            {
              headers: {
                "Authorization": `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              results[market.id] = {
                open: data.data.openResult,
                jodi: data.data.jodiResult,
                close: data.data.closeResult,
              };
            }
          }
        } catch (error) {
          console.error(`Error fetching results for market ${market.id}:`, error);
        }
      }

      setDateResults(results);
    };

    fetchResultsForDate();
  }, [selectedDate, markets]);

  // Effect 2: Fetch current results (latest from website)
  useEffect(() => {
    const fetchCurrentResults = async () => {
      if (!markets || !Array.isArray(markets)) {
        console.log("[Markets] No markets available yet");
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        console.log("[Markets] No token found");
        return;
      }

      console.log(`[Markets] Fetching current results for ${markets.length} market(s)`);

      const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};

      for (const market of markets) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/markets/${market.id}/fetch-now`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          console.log(`[Markets] ${market.name} - Response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            console.log(`[Markets] ${market.name} - Response data:`, data);
            
            if (data.success && data.data) {
              results[market.id] = {
                open: data.data.openResult || "***",
                jodi: data.data.jodiResult || "**",
                close: data.data.closeResult || "***",
              };
              console.log(`[Markets] ${market.name} - Stored result:`, results[market.id]);
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[Markets] ${market.name} - Error response:`, errorData);
          }
        } catch (error) {
          console.error(`[Markets] Error fetching current results for market ${market.id}:`, error);
        }
      }

      console.log("[Markets] Setting current results:", results);
      setCurrentResults(results);
    };

    fetchCurrentResults();
  }, [markets]);

  // Effect 3: Fetch live results directly from website
  useEffect(() => {
    const fetchLiveResults = async () => {
      if (!markets || !Array.isArray(markets)) return;

      const token = localStorage.getItem("token");
      if (!token) return;

      console.log(`[Markets] Fetching live results for ${markets.length} market(s)`);

      const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};

      for (const market of markets) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/markets/${market.id}/live-results`,
            {
              headers: {
                "Authorization": `Bearer ${token}`,
              },
            }
          );

          console.log(`[Markets Live] ${market.name} - Response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            console.log(`[Markets Live] ${market.name} - Response data:`, data);
            
            if (data.success && data.data) {
              results[market.id] = {
                open: data.data.openResult || "***",
                jodi: data.data.jodiResult || "**",
                close: data.data.closeResult || "***",
              };
              console.log(`[Markets Live] ${market.name} - Stored live result:`, results[market.id]);
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[Markets Live] ${market.name} - Error response:`, errorData);
          }
        } catch (error) {
          console.error(`[Markets Live] Error fetching live results for market ${market.id}:`, error);
        }
      }

      console.log("[Markets Live] Setting live results:", results);
      setLiveResults(results);
    };

    fetchLiveResults();
  }, [markets]);

  // Effect 4: Auto-refresh market data every 1 minute (CRITICAL for isActive status)
  useEffect(() => {
    const autoRefreshInterval = setInterval(() => {
      console.log("[Markets] Auto-refetching markets data for isActive status update...");
      // Use refetch directly - more reliable than queryClient.refetchQueries
      refetch();
    }, 60000); // 60 seconds

    return () => clearInterval(autoRefreshInterval);
  }, [refetch]);

  // Effect 5: Auto-refresh current results every 1 minute
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !markets || !Array.isArray(markets) || markets.length === 0) return;

    const autoRefreshCurrentResults = setInterval(async () => {
      console.log("[Markets] Auto-refreshing current results and market status...");
      
      const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};

      for (const market of markets) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/markets/${market.id}/fetch-now`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              results[market.id] = {
                open: data.data.openResult || "***",
                jodi: data.data.jodiResult || "**",
                close: data.data.closeResult || "***",
              };
            }
          }
        } catch (error) {
          console.error(`[Markets Auto-Refresh] Error:`, error);
        }
      }

      setCurrentResults(results);
    }, 60000); // Changed from 120000 (2 min) to 60000 (1 min)

    return () => clearInterval(autoRefreshCurrentResults);
  }, [markets]);

  // Effect 6: Auto-refresh live results every 1 minute
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !markets || !Array.isArray(markets) || markets.length === 0) return;

    const autoRefreshLiveResults = setInterval(async () => {
      console.log("[Markets] Auto-refreshing live results...");
      
      const results: Record<number, { open?: string; jodi?: string; close?: string }> = {};

      for (const market of markets) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/markets/${market.id}/live-results`,
            {
              headers: {
                "Authorization": `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              results[market.id] = {
                open: data.data.openResult || "***",
                jodi: data.data.jodiResult || "**",
                close: data.data.closeResult || "***",
              };
            }
          }
        } catch (error) {
          console.error(`[Markets Auto-Refresh Live] Error:`, error);
        }
      }

      setLiveResults(results);
    }, 60000); // Changed from 120000 (2 min) to 60000 (1 min)

    return () => clearInterval(autoRefreshLiveResults);
  }, [markets]);

  // ============================================================================
  // SECTION 2: CONDITIONAL RENDERING - NOW SAFE BECAUSE ALL HOOKS ARE ABOVE
  // ============================================================================

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 rounded-lg border border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900">Failed to load markets</h2>
          <p className="text-sm text-red-700 mt-2">{error?.message || "Unable to fetch market data"}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !Array.isArray(markets)) {
    return <div className="animate-pulse h-64 bg-muted rounded-2xl" />;
  }


  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this market?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMarketsQueryKey() });
          toast({ title: "Market deleted" });
        },
      }
    );
  };

const handleFetchNow = async (market: Market) => {
  if (!market.sourceUrl) {
    toast({ title: "No source URL", variant: "destructive" });
    return;
  }

  setFetchingId(market.id);

  try {
    const token = localStorage.getItem("token");

    const response = await fetch(`${API_BASE_URL}/api/markets/${market.id}/fetch-now`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    console.log("[FETCH RESULT]", result);

    if (result.success) {
      // ✅ UI instant update
      setCurrentResults((prev) => ({
        ...prev,
        [market.id]: {
          open: result.data?.openResult ?? "***",
          jodi: result.data?.jodiResult ?? "**",
          close: result.data?.closeResult ?? "***",
        },
      }));

      queryClient.invalidateQueries({ queryKey: getGetMarketsQueryKey() });

      toast({
        title: "✓ Fetch successful",
        description: result.message,
      });
    } else {
      toast({
        title: "Fetch Failed",
        description: result.message,
        variant: "destructive",
      });
    }
  } catch (err) {
    console.error(err);
    toast({ title: "Error", variant: "destructive" });
  } finally {
    setFetchingId(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Market Management</h2>
          <p className="text-muted-foreground mt-1">Manage markets, timings, and auto-result updates.</p>
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
                <TableHead className="min-w-[160px]">Current Results (O/J/C)</TableHead>
                <TableHead className="min-w-[160px]">Results (O/J/C)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[100px]">Auto Update</TableHead>
                <TableHead className="min-w-[180px]">Source URL</TableHead>
                <TableHead className="min-w-[140px]">Last Fetched</TableHead>
                <TableHead className="text-right pr-6 min-w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {markets?.map((market) => {
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
                      {currentResults[market.id]?.open || "***"} - {currentResults[market.id]?.jodi || "**"} - {currentResults[market.id]?.close || "***"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono font-semibold tracking-widest text-primary text-sm">
                      {liveResults[market.id]?.open || "***"} - {liveResults[market.id]?.jodi || "**"} - {liveResults[market.id]?.close || "***"}
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
                          {market.fetchError ? (
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
              {(!markets || markets.length === 0) && (
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

      {dialogOpen && <MarketDialog open={dialogOpen} setOpen={setDialogOpen} market={editingMarket} />}
      {autoConfigMarket && (
        <AutoConfigDialog
          open={!!autoConfigMarket}
          setOpen={(v) => !v && setAutoConfigMarket(null)}
          market={autoConfigMarket}
        />
      )}
    </div>
  );
}

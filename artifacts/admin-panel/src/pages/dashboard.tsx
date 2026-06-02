import { useGetDashboardStats, useGetMarkets, useGetScraperStatus } from "@workspace/api-client-react";
import { Users, Ticket, TrendingUp, TrendingDown, Store, ArrowDownToLine, ArrowUpFromLine, Wifi, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, isLoading, error: statsError } = useGetDashboardStats();
  const { data: markets = [] } = useGetMarkets();
  const { data: scraperStatus } = useGetScraperStatus();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-2xl" />
        ))}
      </div>
    );
  }

  if (statsError || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 rounded-lg border border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900">Failed to load dashboard</h2>
          <p className="text-sm text-red-700 mt-2">
            {statsError?.message || "Unable to fetch dashboard data. Please check your connection."}
          </p>
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

  const statCards = [
    { title: "Total Users", value: stats.totalUsers ?? 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Bids Today", value: stats.totalBidsToday ?? 0, icon: Ticket, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { title: "Total Profit", value: `₹${(stats.totalProfit ?? 0).toLocaleString()}`, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Active Markets", value: stats.activeMarkets ?? 0, icon: Store, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Deposits Today", value: `₹${(stats.depositsToday ?? 0).toLocaleString()}`, icon: ArrowDownToLine, color: "text-violet-500", bg: "bg-violet-500/10" },
    { title: "Withdrawals Today", value: `₹${(stats.withdrawalsToday ?? 0).toLocaleString()}`, icon: ArrowUpFromLine, color: "text-rose-500", bg: "bg-rose-500/10" },
    { title: "Win Amount", value: `₹${(stats.winAmount ?? 0).toLocaleString()}`, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Loss Amount", value: `₹${(stats.lossAmount ?? 0).toLocaleString()}`, icon: TrendingDown, color: "text-rose-500", bg: "bg-rose-500/10" },
    { title: "Net Win/Loss", value: `₹${(stats.netWinLoss ?? 0).toLocaleString()}`, icon: CheckCircle2, color: "text-slate-700", bg: "bg-slate-700/10" },
  ];

  // Markets with auto-update enabled and their fetch status
  const autoUpdateMarkets = Array.isArray(markets) ? markets.filter(m => m.autoUpdate) : [];

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <h3 className="text-3xl font-display font-bold text-foreground mt-1">{stat.value}</h3>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Bids */}
        <div className="lg:col-span-2">
          <Card className="border-border/50 shadow-sm overflow-hidden h-full">
            <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
              <CardTitle className="text-lg font-display">Recent Bids</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto lg:overflow-visible">
                <Table>
                  <TableHeader className="hidden lg:table-header-group">
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="pl-6">User</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead>Game</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats.recentBids ?? []).slice(0, 8).map((bid) => (
                      <>
                        {/* Desktop View */}
                        <TableRow key={`desktop-${bid.id}`} className="hidden lg:table-row hover:bg-muted/30 transition-colors">
                          <TableCell className="pl-6 font-medium">{bid.userName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{bid.marketName}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{bid.gameType}</Badge></TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600">₹{bid.amount}</TableCell>
                          <TableCell>
                            <Badge variant={bid.status === "won" ? "default" : bid.status === "lost" ? "destructive" : "secondary"} className="text-xs">
                              {bid.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                        </TableRow>

                        {/* Mobile View */}
                        <TableRow key={`mobile-${bid.id}`} className="lg:hidden block border-b">
                          <TableCell className="block p-4 space-y-2">
                            <div className="flex justify-between items-start">
                              <p className="font-medium text-sm">{bid.userName}</p>
                              <Badge variant={bid.status === "won" ? "default" : bid.status === "lost" ? "destructive" : "secondary"} className="text-xs">
                                {bid.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Market</p>
                                <p className="text-muted-foreground">{bid.marketName}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Amount</p>
                                <p className="font-semibold text-emerald-600">₹{bid.amount}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs font-medium text-muted-foreground">Game Type</p>
                                <Badge variant="outline" className="text-xs">{bid.gameType}</Badge>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
                    {(stats.recentBids ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No recent bids found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Auto-Update Widget */}
        <div className="space-y-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/50 pb-3 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-blue-500" /> Auto-Update
                </CardTitle>
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${scraperStatus?.isRunning ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${scraperStatus?.isRunning ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                  {scraperStatus?.isRunning ? "Running" : "Stopped"}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {autoUpdateMarkets.length === 0 ? (
                <div className="px-5 py-8 text-center text-muted-foreground">
                  <Wifi className="w-8 h-8 mx-auto mb-3 opacity-25" />
                  <p className="text-sm font-medium">No markets configured</p>
                  <p className="text-xs mt-1">Enable auto-update in Markets page</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {autoUpdateMarkets.slice(0, 6).map((market) => (
                    <div key={market.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{market.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {market.lastFetchedAt ? (
                            <>
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(market.lastFetchedAt), { addSuffix: true })}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Never fetched</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {market.openResult || "??"} - {market.jodiResult || "??"} - {market.closeResult || "??"}
                        </span>
                        {market.fetchError ? (
                          <XCircle className="w-4 h-4 text-destructive" />
                        ) : market.lastFetchedAt ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-5 py-3 border-t border-border/40">
                <Link href="/logs" className="text-xs text-primary hover:underline font-medium">
                  View all scraper logs →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

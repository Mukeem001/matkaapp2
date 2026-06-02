import { useGetScraperLogs, useGetScraperStatus } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, Activity, Wifi, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function Logs() {
  const { data: logs, isLoading: logsLoading, refetch } = useGetScraperLogs({ limit: 100 });
  const { data: status } = useGetScraperStatus();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-display font-bold">Scraper Logs</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Auto-update fetch history and scheduler status.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-border/50 hover:bg-muted/30 flex-shrink-0 whitespace-nowrap w-full sm:w-auto justify-center sm:justify-start h-8 sm:h-9"
        >
          <RefreshCw className="w-4 h-4" /> <span className="hidden sm:inline">Refresh</span><span className="sm:hidden">R</span>
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${status?.isRunning ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scheduler</p>
              <p className="text-lg font-bold mt-0.5">{status?.isRunning ? "Running" : "Stopped"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
              <Wifi className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Markets with Auto-Update</p>
              <p className="text-lg font-bold mt-0.5">{status?.totalMarketsWithAutoUpdate ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Run</p>
              <p className="text-sm font-bold mt-0.5">
                {status?.lastRunAt ? format(new Date(status.lastRunAt), "HH:mm:ss") : "Not yet"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs Table */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
          <CardTitle className="text-base font-display">Fetch History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="animate-pulse h-48 bg-muted/30 m-4 rounded-xl" />
          ) : (
            <div className="overflow-x-auto lg:overflow-visible">
              <Table>
                <TableHeader className="hidden lg:table-header-group">
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="pl-2 sm:pl-4 lg:pl-6 text-xs sm:text-sm">Time</TableHead>
                    <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">Market</TableHead>
                    <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">Source</TableHead>
                    <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">Result (O/J/C)</TableHead>
                    <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="pr-2 sm:pr-4 lg:pr-6 text-xs sm:text-sm">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(logs) ? logs.map((log) => (
                    <>
                      {/* Desktop View */}
                      <TableRow key={`desktop-${log.id}`} className="hidden lg:table-row hover:bg-muted/20 transition-colors">
                        <TableCell className="pl-2 sm:pl-4 lg:pl-6 text-xs sm:text-sm text-muted-foreground">
                          {format(new Date(log.createdAt), "dd MMM, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="px-2 sm:px-4 font-medium text-xs sm:text-sm">{log.marketName || "—"}</TableCell>
                        <TableCell className="px-2 sm:px-4">
                          {log.sourceUrl ? (
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] block">
                              {log.sourceUrl}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 sm:px-4">
                          {log.openResult || log.closeResult || log.jodiResult ? (
                            <span className="font-mono font-semibold text-primary text-xs sm:text-sm">
                              {log.openResult || "***"} - {log.jodiResult || "**"} - {log.closeResult || "***"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">No results</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 sm:px-4">
                          {log.success ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1 text-xs">
                              <CheckCircle2 className="w-3 h-3" /> Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <XCircle className="w-3 h-3" /> Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-2 sm:pr-4 lg:pr-6">
                          {log.errorMessage ? (
                            <span className="text-xs text-destructive max-w-[200px] truncate block" title={log.errorMessage}>
                              {log.errorMessage}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Mobile View */}
                      <TableRow key={`mobile-${log.id}`} className="lg:hidden block border-b mb-4">
                        <TableCell className="block p-2 sm:p-4 space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <p className="text-xs sm:text-xs font-medium text-muted-foreground">Time</p>
                              <p className="text-xs sm:text-sm text-foreground">{format(new Date(log.createdAt), "dd MMM, HH:mm:ss")}</p>
                            </div>
                            {log.success ? (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1 text-xs flex-shrink-0">
                                <CheckCircle2 className="w-3 h-3" /> Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 text-xs flex-shrink-0">
                                <XCircle className="w-3 h-3" /> Failed
                              </Badge>
                            )}
                          </div>

                          <div className="bg-muted/50 p-2 sm:p-3 rounded-lg space-y-2">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Market</p>
                              <p className="text-xs sm:text-sm font-medium text-foreground">{log.marketName || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Result</p>
                              {log.openResult || log.closeResult || log.jodiResult ? (
                                <p className="font-mono font-semibold text-primary text-xs sm:text-sm">
                                  {log.openResult || "***"} - {log.jodiResult || "**"} - {log.closeResult || "***"}
                                </p>
                              ) : (
                                <p className="text-muted-foreground text-xs">No results</p>
                              )}
                            </div>
                          </div>

                          <div className="bg-muted/30 p-2 sm:p-3 rounded-lg space-y-2">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Source URL</p>
                              {log.sourceUrl ? (
                                <p className="text-xs text-muted-foreground font-mono break-all">
                                  {log.sourceUrl}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">—</p>
                              )}
                            </div>
                          </div>

                          {log.errorMessage && (
                            <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                              <p className="text-xs font-medium text-destructive mb-1">Error Message</p>
                              <p className="text-xs text-destructive break-words">{log.errorMessage}</p>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    </>
                  )) : null}
                  {(!logs || logs.length === 0 || !Array.isArray(logs)) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                        <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No logs yet</p>
                        <p className="text-sm mt-1">Enable auto-update on a market with a source URL to start fetching.</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

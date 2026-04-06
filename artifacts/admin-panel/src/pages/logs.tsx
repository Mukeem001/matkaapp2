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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Scraper Logs</h2>
          <p className="text-muted-foreground mt-1">Auto-update fetch history and scheduler status.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted/30"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="pl-6">Time</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Result (O/J/C)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(logs) ? logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="pl-6 text-sm text-muted-foreground">
                      {format(new Date(log.createdAt), "dd MMM, HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-medium">{log.marketName || "—"}</TableCell>
                    <TableCell>
                      {log.sourceUrl ? (
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] block">
                          {log.sourceUrl}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.openResult || log.closeResult || log.jodiResult ? (
                        <span className="font-mono font-semibold text-primary text-sm">
                          {log.openResult || "***"} - {log.jodiResult || "**"} - {log.closeResult || "***"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">No results</span>
                      )}
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="pr-6">
                      {log.errorMessage ? (
                        <span className="text-xs text-destructive max-w-[200px] truncate block" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

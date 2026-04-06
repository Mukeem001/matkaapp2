import { useState } from "react";
import { useGetDeposits, useApproveDeposit, useRejectDeposit, getGetDepositsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, X, FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DateFilterType = 'today' | 'yesterday' | 'last3days' | 'last7days' | 'lastMonth' | 'custom' | null;

export default function Deposits() {
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>(null);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  
  // Build query parameters
  let queryParams: any = { status: "all" };
  if (dateFilterType && dateFilterType !== 'custom') {
    queryParams.createdType = dateFilterType;
  } else if (dateFilterType === 'custom') {
    if (customDateFrom) queryParams.createdAfter = new Date(customDateFrom).toISOString();
    if (customDateTo) queryParams.createdBefore = new Date(customDateTo).toISOString();
  }

  const { data: deposits, isLoading, error } = useGetDeposits(queryParams);
  const { mutate: approve } = useApproveDeposit();
  const { mutate: reject } = useRejectDeposit();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const handleDateFilterClick = (type: DateFilterType) => {
    if (type === 'custom') {
      setDateFilterType('custom');
    } else {
      setDateFilterType(type);
      setCustomDateFrom("");
      setCustomDateTo("");
    }
  };

  const clearDateFilter = () => {
    setDateFilterType(null);
    setCustomDateFrom("");
    setCustomDateTo("");
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 rounded-lg border border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900">Failed to load deposits</h2>
          <p className="text-sm text-red-700 mt-2">Unable to fetch deposit data</p>
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

  const handleAction = (id: number, type: 'approve' | 'reject') => {
    const action = type === 'approve' ? approve : reject;
    action({ id }, {
      onSuccess: () => {
        toast({ title: `Deposit ${type}d successfully` });
        queryClient.invalidateQueries({ queryKey: getGetDepositsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Deposit Requests</h2>
        <p className="text-muted-foreground mt-1">Review and process user wallet deposits.</p>
      </div>

      {/* Date Filter Buttons */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={dateFilterType === 'today' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => handleDateFilterClick('today')}
          >
            Today
          </Button>
          <Button
            variant={dateFilterType === 'yesterday' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => handleDateFilterClick('yesterday')}
          >
            Yesterday
          </Button>
          <Button
            variant={dateFilterType === 'last3days' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => handleDateFilterClick('last3days')}
          >
            Last 3 Days
          </Button>
          <Button
            variant={dateFilterType === 'last7days' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => handleDateFilterClick('last7days')}
          >
            Last 7 Days
          </Button>
          <Button
            variant={dateFilterType === 'lastMonth' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => handleDateFilterClick('lastMonth')}
          >
            Last Month
          </Button>
          <Button
            variant={dateFilterType === 'custom' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => handleDateFilterClick('custom')}
          >
            Custom Date
          </Button>
          {dateFilterType && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-muted-foreground"
              onClick={clearDateFilter}
            >
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Custom Date Picker */}
        {dateFilterType === 'custom' && (
          <div className="flex gap-2 items-end bg-cardmuted/30 p-3 rounded-lg">
            <div className="flex-1">
              <Label className="text-xs mb-1">From Date</Label>
              <Input 
                type="date" 
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="rounded-lg h-9"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs mb-1">To Date</Label>
              <Input 
                type="date" 
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="rounded-lg h-9"
              />
            </div>
          </div>
        )}
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="pl-6">Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-center">Proof</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right pr-6">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : !Array.isArray(deposits) || deposits.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No deposit requests.</TableCell></TableRow>
            ) : (deposits as any[]).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="pl-6 text-sm text-muted-foreground">
                  {format(new Date(d.createdAt), 'PP p')}
                </TableCell>
                <TableCell className="font-semibold">{d.userName}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-muted-foreground">{d.paymentMethod}</span>
                    <span className="font-mono text-sm">{d.transactionId || '-'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-lg text-emerald-600">₹{d.amount}</TableCell>
                <TableCell className="text-center">
                  {d.screenshotUrl ? (
                    <Button variant="ghost" size="sm" onClick={() => setScreenshot(d.screenshotUrl!)}>
                      <FileText className="w-4 h-4 text-blue-500" />
                    </Button>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={d.status === 'approved' ? 'default' : d.status === 'rejected' ? 'destructive' : 'secondary'} 
                         className={d.status === 'approved' ? 'bg-emerald-500' : d.status === 'pending' ? 'bg-amber-500' : ''}>
                    {d.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="pr-6 text-right">
                  {d.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" className="h-8 w-8 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none" onClick={() => handleAction(d.id, 'approve')}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" className="h-8 w-8 bg-rose-100 text-rose-700 hover:bg-rose-200 shadow-none" onClick={() => handleAction(d.id, 'reject')}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!screenshot} onOpenChange={() => setScreenshot(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Payment Screenshot</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center mt-4">
            <img src={screenshot || ''} alt="Screenshot" className="max-w-full rounded-lg shadow-md border border-border/50" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

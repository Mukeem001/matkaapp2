import { useState } from "react";
import { useGetWithdrawals, useApproveWithdrawal, useRejectWithdrawal, getGetWithdrawalsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, X, Landmark } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type DateFilterType = 'today' | 'yesterday' | 'last3days' | 'last7days' | 'lastMonth' | 'custom' | null;

export default function Withdrawals() {
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

  const { data: withdrawals, isLoading, error } = useGetWithdrawals(queryParams);
  const { mutate: approve } = useApproveWithdrawal();
  const { mutate: reject } = useRejectWithdrawal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
          <h2 className="text-lg font-semibold text-red-900">Failed to load withdrawals</h2>
          <p className="text-sm text-red-700 mt-2">Unable to fetch withdrawal data</p>
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
        toast({ title: `Withdrawal ${type}d successfully` });
        queryClient.invalidateQueries({ queryKey: getGetWithdrawalsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Withdrawal Requests</h2>
        <p className="text-muted-foreground mt-1">Review and process user cashouts.</p>
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
              <TableHead>Account Details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right pr-6">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : !Array.isArray(withdrawals) || withdrawals.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No withdrawal requests.</TableCell></TableRow>
            ) : (withdrawals as any[]).map((w) => (
              <TableRow key={w.id}>
                <TableCell className="pl-6 text-sm text-muted-foreground">
                  {format(new Date(w.createdAt), 'PP p')}
                </TableCell>
                <TableCell className="font-semibold">{w.userName}</TableCell>
                <TableCell>
                  <div className="flex gap-3 items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      {w.upiId ? (
                        <>
                          <span className="text-xs text-muted-foreground font-medium">UPI</span>
                          <span className="font-mono text-sm">{w.upiId}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground font-medium">{w.bankName}</span>
                          <span className="font-mono text-sm">{w.accountNumber} <span className="text-muted-foreground opacity-50 ml-1">({w.ifscCode})</span></span>
                        </>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-lg text-rose-600">₹{w.amount}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'} 
                         className={w.status === 'approved' ? 'bg-emerald-500' : w.status === 'pending' ? 'bg-amber-500' : ''}>
                    {w.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="pr-6 text-right">
                  {w.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" className="h-8 w-8 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none" onClick={() => handleAction(w.id, 'approve')}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" className="h-8 w-8 bg-rose-100 text-rose-700 hover:bg-rose-200 shadow-none" onClick={() => handleAction(w.id, 'reject')}>
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
    </div>
  );
}

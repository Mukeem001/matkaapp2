import { useEffect, useMemo, useState } from "react";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  const filteredWithdrawals = withdrawals ?? [];
  const totalWithdrawals = filteredWithdrawals.length;
  const totalPages = Math.max(1, Math.ceil(totalWithdrawals / pageSize));
  const pageWithdrawals = useMemo(
    () => filteredWithdrawals.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredWithdrawals, currentPage, pageSize]
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleDateFilterClick = (type: DateFilterType) => {
    if (type === 'custom') {
      setDateFilterType('custom');
      setCurrentPage(1);
    } else {
      setDateFilterType(type);
      setCurrentPage(1);
      setCustomDateFrom("");
      setCustomDateTo("");
    }
  };

  const clearDateFilter = () => {
    setDateFilterType(null);
    setCurrentPage(1);
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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-bold">Withdrawal Requests</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Review and process user cashouts.</p>
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
        <div className="overflow-x-auto lg:overflow-visible">
          <Table>
            <TableHeader className="bg-muted/30 hidden lg:table-header-group">
              <TableRow>
                <TableHead className="pl-2 sm:pl-4 lg:pl-6 text-xs sm:text-sm">Date</TableHead>
                <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">User</TableHead>
                <TableHead className="px-2 sm:px-4 text-xs sm:text-sm">Account Details</TableHead>
                <TableHead className="px-2 sm:px-4 text-right text-xs sm:text-sm">Amount</TableHead>
                <TableHead className="px-2 sm:px-4 text-center text-xs sm:text-sm">Status</TableHead>
                <TableHead className="pr-2 sm:pr-4 lg:pr-6 text-right text-xs sm:text-sm">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-xs sm:text-sm">Loading...</TableCell></TableRow>
              ) : totalWithdrawals === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-xs sm:text-sm">No withdrawal requests.</TableCell></TableRow>
              ) : pageWithdrawals.map((w) => (
                <>
                  {/* Desktop View */}
                  <TableRow key={`desktop-${w.id}`} className="hidden lg:table-row">
                    <TableCell className="pl-2 sm:pl-4 lg:pl-6 text-xs sm:text-sm text-muted-foreground">
                      {format(new Date(w.createdAt), 'PP p')}
                    </TableCell>
                    <TableCell className="px-2 sm:px-4 font-semibold text-xs sm:text-sm">{w.userName}</TableCell>
                    <TableCell className="px-2 sm:px-4">
                      <div className="flex gap-2 sm:gap-3 items-center">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                          <Landmark className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          {w.upiId ? (
                            <>
                              <span className="text-xs text-muted-foreground font-medium">UPI</span>
                              <span className="font-mono text-xs sm:text-sm truncate">{w.upiId}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground font-medium">{w.bankName}</span>
                              <span className="font-mono text-xs sm:text-sm truncate">{w.accountNumber} <span className="text-muted-foreground opacity-50 ml-1">({w.ifscCode})</span></span>
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-2 sm:px-4 text-right font-mono font-bold text-sm sm:text-lg text-rose-600">₹{w.amount}</TableCell>
                    <TableCell className="px-2 sm:px-4 text-center">
                      <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'} 
                             className={`${w.status === 'approved' ? 'bg-emerald-500' : w.status === 'pending' ? 'bg-amber-500' : ''} text-xs`}>
                        {w.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-2 sm:pr-4 lg:pr-6 text-right">
                      {w.status === 'pending' && (
                        <div className="flex justify-end gap-1 sm:gap-2">
                          <Button size="icon" className="h-7 w-7 sm:h-8 sm:w-8 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none" onClick={() => handleAction(w.id, 'approve')}>
                            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </Button>
                          <Button size="icon" className="h-7 w-7 sm:h-8 sm:w-8 bg-rose-100 text-rose-700 hover:bg-rose-200 shadow-none" onClick={() => handleAction(w.id, 'reject')}>
                            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Mobile View */}
                  <TableRow key={`mobile-${w.id}`} className="lg:hidden block border-b mb-4">
                    <TableCell className="block p-2 sm:p-4 space-y-2 sm:space-y-3">
                      <div className="flex justify-between items-start gap-2 mb-2 sm:mb-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Date</p>
                          <p className="text-xs sm:text-sm text-foreground">{format(new Date(w.createdAt), 'PP p')}</p>
                        </div>
                        <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'} 
                               className={`${w.status === 'approved' ? 'bg-emerald-500' : w.status === 'pending' ? 'bg-amber-500' : ''} text-xs flex-shrink-0`}>
                          {w.status.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="bg-muted/50 p-2 sm:p-3 rounded-lg space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">User</p>
                          <p className="text-xs sm:text-sm font-semibold text-foreground">{w.userName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Amount</p>
                          <p className="text-xs sm:text-sm font-mono font-bold text-rose-600">₹{w.amount}</p>
                        </div>
                      </div>

                      <div className="bg-muted/30 p-2 sm:p-3 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Account Details</p>
                        <div className="flex gap-1.5 sm:gap-2 items-start">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                            <Landmark className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            {w.upiId ? (
                              <>
                                <span className="text-xs text-muted-foreground font-medium">UPI</span>
                                <span className="font-mono text-xs sm:text-sm break-all">{w.upiId}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-muted-foreground font-medium">{w.bankName}</span>
                                <span className="font-mono text-xs text-foreground">{w.accountNumber}</span>
                                <span className="font-mono text-xs text-muted-foreground">({w.ifscCode})</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {w.status === 'pending' && (
                        <div className="flex gap-1.5 sm:gap-2 pt-2">
                          <Button size="sm" className="flex-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none text-xs sm:text-sm h-8 sm:h-9" onClick={() => handleAction(w.id, 'approve')}>
                            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" className="flex-1 bg-rose-100 text-rose-700 hover:bg-rose-200 shadow-none text-xs sm:text-sm h-8 sm:h-9" onClick={() => handleAction(w.id, 'reject')}>
                            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Showing {totalWithdrawals === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalWithdrawals)} of {totalWithdrawals} withdrawals
        </p>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))} className="text-xs sm:text-sm h-8 sm:h-9">
            Previous
          </Button>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(event) => {
              const nextPage = Number(event.target.value);
              if (!Number.isNaN(nextPage) && nextPage >= 1 && nextPage <= totalPages) {
                setCurrentPage(nextPage);
              }
            }}
            className="w-16 sm:w-20 text-center text-xs sm:text-sm h-8 sm:h-9"
          />
          <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))} className="text-xs sm:text-sm h-8 sm:h-9">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

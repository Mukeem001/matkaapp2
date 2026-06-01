import { useState, useMemo } from "react";
import { useGetBids, useUpdateBid, getGetBidsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type DateFilterType = 'today' | 'yesterday' | 'last3days' | 'last7days' | 'lastMonth' | 'custom' | null;

// Helper function to get bids type (open-bids or close-bids)
const getBidsType = (bid: any): string => {
  // Use bidsStatus field from database
  if (bid.bidsStatus) {
    return bid.bidsStatus; // Returns 'open-bids' or 'close-bids'
  }
  // Fallback: determine from time if bidsStatus not available
  const now = new Date();
  const closeTime = bid.closeTime ? new Date(`2000-01-01 ${bid.closeTime}`) : null;
  
  if (!closeTime) return 'open-bids';
  
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const closeHour = closeTime.getHours();
  const closeMinute = closeTime.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const closeTotalMinutes = closeHour * 60 + closeMinute;
  
  return currentTotalMinutes < closeTotalMinutes ? 'open-bids' : 'close-bids';
};

export default function Bids() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>(null);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [editingBidId, setEditingBidId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  const queryClient = useQueryClient();
  
  // Build query parameters
  let queryParams: any = {
    page: currentPage,
    limit: pageSize,
  };
  if (dateFilterType && dateFilterType !== 'custom') {
    queryParams.createdType = dateFilterType;
  } else if (dateFilterType === 'custom') {
    if (customDateFrom) queryParams.createdAfter = new Date(customDateFrom).toISOString();
    if (customDateTo) queryParams.createdBefore = new Date(customDateTo).toISOString();
  }

  // 🔥 Fetch bids with filters
  const { data: bidsData, isLoading } = useGetBids(queryParams);

  // 🔄 Update bid mutation
  const { mutate: updateBid } = useUpdateBid();

  // 🔎 frontend status filter
  const bids = useMemo(() => {
    if (!bidsData?.bids || !Array.isArray(bidsData.bids)) return [];

    if (statusFilter === "all") return bidsData.bids;

    return bidsData.bids.filter((bid: any) => bid.status === statusFilter);
  }, [bidsData, statusFilter]);

  // Handle date filter
  const handleDateFilterClick = (type: DateFilterType) => {
    if (type === 'custom') {
      setDateFilterType('custom');
    } else {
      setDateFilterType(type);
      setCustomDateFrom("");
      setCustomDateTo("");
    }
    setCurrentPage(1); // Reset to first page when filter changes
  };

  // Clear date filter
  const clearDateFilter = () => {
    setDateFilterType(null);
    setCustomDateFrom("");
    setCustomDateTo("");
  };

  // Handle edit button click
  const handleEditClick = (bid: any) => {
    setEditingBidId(bid.id);
    setEditAmount(bid.amount.toString());
    setEditNumber(bid.number);
    setEditStatus(bid.status);
  };

  // Handle save edit
  const handleSaveEdit = () => {
    if (!editingBidId) return;

    const amount = editAmount ? parseFloat(editAmount) : undefined;
    const number = editNumber?.trim() || undefined;
    const status = editStatus || undefined;

    console.log("[Bids Edit] Attempting save:", { editingBidId, amount, number, status });

    if (!amount && !number && !status) {
      toast.error("Please change at least one field");
      return;
    }

    if (amount && amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    const payload: any = {};
    if (amount !== undefined && amount > 0) payload.amount = amount;
    if (number !== undefined && number.length > 0) payload.number = number;
    if (status !== undefined && status.length > 0) payload.status = status;

    console.log("[Bids Edit] Payload to send:", payload);

    if (Object.keys(payload).length === 0) {
      toast.error("Please provide valid changes");
      return;
    }

    console.log("[Bids Edit] Calling API with:", { id: editingBidId, data: payload });

    updateBid(
      { id: editingBidId, data: payload },
      {
        onSuccess: (res: any) => {
          console.log("[Bids Edit] Success response:", res);
          toast.success("Bid updated successfully!");
          setEditingBidId(null);
          setEditAmount("");
          setEditNumber("");
          setEditStatus("");
          queryClient.invalidateQueries({ queryKey: getGetBidsQueryKey() });
        },
        onError: (error: any) => {
          console.error("[Bids Edit] Error:", error);
          const errorMsg = error?.response?.data?.error || error?.message || "Failed to update bid";
          toast.error(errorMsg);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Game Bids</h2>
          <p className="text-muted-foreground mt-1">
            Real-time view of all user bets across markets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 rounded-xl bg-card border-border/50">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
            Today {dateFilterType === 'today' && bidsData?.total !== undefined && <span className="ml-1 text-xs">({bidsData.total})</span>}
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
            This Month
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
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={clearDateFilter}
            >
              Clear
            </Button>
          )}
        </div>

        {dateFilterType === 'custom' && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="fromDate" className="text-xs mb-1 block">From Date</Label>
              <Input
                id="fromDate"
                type="datetime-local"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="toDate" className="text-xs mb-1 block">To Date</Label>
              <Input
                id="toDate"
                type="datetime-local"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
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
              <TableHead>Market</TableHead>
              <TableHead>Game Type</TableHead>
              <TableHead className="text-center">Bid Digit</TableHead>
              <TableHead className="text-center">Bids Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Win Amount</TableHead>
              <TableHead className="pr-6 text-right">Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : bids.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  No bids found.
                </TableCell>
              </TableRow>
            ) : (
              bids.map((bid) => (
                <TableRow key={bid.id}>
                  <TableCell className="pl-6 text-sm text-muted-foreground">
                    {format(new Date(bid.createdAt), "PP p")}
                  </TableCell>

                  <TableCell className="font-medium">
                    {bid.userName || "N/A"}
                  </TableCell>

                  <TableCell className="font-semibold text-blue-600">
                    {bid.marketName}
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline">{bid.gameType}</Badge>
                  </TableCell>

                  <TableCell className="text-center font-mono font-bold">
                    {bid.digit}
                  </TableCell>

                  <TableCell className="text-center text-sm">
                    {getBidsType(bid) === 'open-bids' ? (
                      <Badge className="bg-green-100 text-green-700 border border-green-200">Open Bids</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border border-red-200">Close Bids</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-right font-mono font-bold text-emerald-600">
                    ₹{bid.amount}
                  </TableCell>

                  <TableCell className="text-right font-mono font-bold">
                    {bid.status === 'won' ? (
                      <span className="text-green-600">₹{Math.round((bid.amount) * (bid.gameType === 'jodi' ? 90 : bid.gameType === 'hari' ? 9 : 9))}</span>
                    ) : bid.status === 'lost' ? (
                      <span className="text-red-600">-₹{bid.amount}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>

                  <TableCell className="pr-6 text-right">
                    <Badge
                      variant={
                        bid.status === "won"
                          ? "default"
                          : bid.status === "lost"
                          ? "destructive"
                          : "secondary"
                      }
                      className={bid.status === "won" ? "bg-emerald-500" : ""}
                    >
                      {bid.status.toUpperCase()}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditClick(bid)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination Controls */}
      {!isLoading && (bidsData?.total ?? 0) > 0 && (
        <div className="flex items-center justify-between pt-6">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-semibold">{((currentPage - 1) * pageSize) + 1}</span> to <span className="font-semibold">{Math.min(currentPage * pageSize, bidsData?.total ?? 0)}</span> of <span className="font-semibold">{bidsData?.total ?? 0}</span> bids
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="flex items-center gap-1 px-2">
              <span className="text-sm text-muted-foreground">Page</span>
              <Input
                type="number"
                min="1"
                max={Math.ceil((bidsData?.total ?? 0) / pageSize)}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value) || 1;
                  const maxPage = Math.ceil((bidsData?.total ?? 0) / pageSize);
                  setCurrentPage(Math.min(Math.max(page, 1), maxPage));
                }}
                className="w-12 h-9 px-2 text-center"
              />
              <span className="text-sm text-muted-foreground">of {Math.ceil((bidsData?.total ?? 0) / pageSize)}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={currentPage >= Math.ceil((bidsData?.total ?? 0) / pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog 
        open={editingBidId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBidId(null);
            setEditAmount("");
            setEditNumber("");
            setEditStatus("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Bid #{editingBidId}</DialogTitle>
            <DialogDescription>
              Update the amount, bid number, and/or status for this bid.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="Enter new amount"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="number">Bid Number</Label>
              <Input
                id="number"
                type="text"
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                placeholder="Enter new bid number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingBidId(null);
                setEditAmount("");
                setEditNumber("");
                setEditStatus("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSaveEdit();
              }}
              className="gap-2"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
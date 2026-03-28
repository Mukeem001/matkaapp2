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

export default function Bids() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>(null);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [editingBidId, setEditingBidId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const queryClient = useQueryClient();
  
  // Build query parameters
  let queryParams: any = {};
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

    if (Object.keys(payload).length === 0) {
      toast.error("Please provide valid changes");
      return;
    }

    updateBid(
      { id: editingBidId, data: payload },
      {
        onSuccess: () => {
          toast.success("Bid updated successfully!");
          setEditingBidId(null);
          setEditAmount("");
          setEditNumber("");
          setEditStatus("");
          queryClient.invalidateQueries({ queryKey: getGetBidsQueryKey() });
        },
        onError: (error: any) => {
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
              <TableHead className="text-center">Open - Close</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="pr-6 text-right">Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : bids.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
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
                    {bid.number}
                  </TableCell>

                  <TableCell className="text-center text-sm">
                    {bid.openTime} - {bid.closeTime}
                  </TableCell>

                  <TableCell className="text-right font-mono font-bold text-emerald-600">
                    ₹{bid.amount}
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

      {/* Edit Dialog */}
      <Dialog open={editingBidId !== null} onOpenChange={(open) => {
        if (!open) {
          setEditingBidId(null);
          setEditAmount("");
          setEditNumber("");
          setEditStatus("");
        }
      }}>
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
              onClick={handleSaveEdit}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
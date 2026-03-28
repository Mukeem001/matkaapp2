import { useState, useMemo, useEffect } from "react";
import { useGetDashboardStats, useUpdateBid } from "@workspace/api-client-react";
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

export default function Bids() {
  const [status, setStatus] = useState("all");
  const [editingBidId, setEditingBidId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNumber, setEditNumber] = useState("");

  // 🔥 SAME API AS DASHBOARD
  const { data: stats, isLoading, refetch } = useGetDashboardStats();

  // 🔄 Update bid mutation
  const updateBidMutation = useUpdateBid({
    mutation: {
      onSuccess: () => {
        toast.success("Bid updated successfully!");
        setEditingBidId(null);
        setEditAmount("");
        setEditNumber("");
        refetch();
      },
      onError: (error: any) => {
        toast.error(error?.response?.data?.error || "Failed to update bid");
      },
    },
  });

  // 🔎 frontend filter (same UI)
  const bids = useMemo(() => {
    if (!stats?.recentBids || !Array.isArray(stats.recentBids)) return [];

    if (status === "all") return stats.recentBids;

    return stats.recentBids.filter(
      (bid) => bid.status === status
    );
  }, [stats, status]);

  // 🔄 Auto-refresh bid data every 2 minutes to check for result updates
  useEffect(() => {
    console.log("[Bids] Setting up auto-refresh interval");
    
    const autoRefreshInterval = setInterval(() => {
      console.log("[Bids] Auto-refreshing bid data...");
      refetch();
    }, 120000); // 2 minutes

    return () => {
      clearInterval(autoRefreshInterval);
      console.log("[Bids] Cleared auto-refresh interval");
    };
  }, [refetch]);

  // Handle edit button click
  const handleEditClick = (bid: any) => {
    setEditingBidId(bid.id);
    setEditAmount(bid.amount.toString());
    setEditNumber(bid.number);
  };

  // Handle save edit
  const handleSaveEdit = async () => {
    if (!editingBidId) return;

    try {
      const amount = editAmount ? parseFloat(editAmount) : undefined;
      const number = editNumber || undefined;

      if (!amount && !number) {
        toast.error("Please enter amount or number to edit");
        return;
      }

      if (amount && amount <= 0) {
        toast.error("Amount must be greater than 0");
        return;
      }

      await updateBidMutation.mutateAsync({
        id: editingBidId,
        data: {
          ...(amount ? { amount } : {}),
          ...(number ? { number } : {}),
        },
      });
    } catch (error) {
      console.error("[Edit Bid] Error:", error);
    }
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
          <Select value={status} onValueChange={setStatus}>
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
                    {bid.status === "pending" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(bid)}
                      >
                        Edit
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Bid #{editingBidId}</DialogTitle>
            <DialogDescription>
              Update the amount and/or bid number for this pending bid.
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingBidId(null);
                setEditAmount("");
                setEditNumber("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateBidMutation.isPending}
            >
              {updateBidMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
      </Card>
    </div>
  );
}
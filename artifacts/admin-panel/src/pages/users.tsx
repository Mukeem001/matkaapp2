import { useState, useEffect } from "react";
import { useGetUsers, useUpdateUser, getGetUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Ban, CheckCircle2, Wallet, Eye, X, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@workspace/api-client-react";

const walletSchema = z.object({
  walletBalance: z.coerce.number().min(0, "Balance cannot be negative"),
});

type DateFilterType = 'today' | 'yesterday' | 'last3days' | 'last7days' | 'lastMonth' | 'custom' | null;

export default function Users() {
  const [search, setSearch] = useState("");
  const [walletDialog, setWalletDialog] = useState<User | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>(null);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposits' | 'withdrawals' | 'bids'>('all');
  const [historyPageSize] = useState(5);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [userStats, setUserStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [transactionLoading, setTransactionLoading] = useState(false);
  
  // Fetch user stats and transaction history when viewing user changes
  useEffect(() => {
    if (viewingUser) {
      setStatsLoading(true);
      setTransactionLoading(true);
      setHistoryCurrentPage(1);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      
      // Fetch stats
      fetch(`${apiUrl}/api/users/${viewingUser.id}/stats`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })
        .then(res => res.json())
        .then(data => {
          setUserStats(data);
          setStatsLoading(false);
        })
        .catch(err => {
          console.error('Error fetching user stats:', err);
          setStatsLoading(false);
        });

      // Fetch transaction history (deposits, withdrawals, bids)
      Promise.all([
        fetch(`${apiUrl}/api/deposits?userId=${viewingUser.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        }).then(res => res.json()).catch(() => []),
        fetch(`${apiUrl}/api/withdrawals?userId=${viewingUser.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        }).then(res => res.json()).catch(() => []),
        fetch(`${apiUrl}/api/bids?userId=${viewingUser.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        }).then(res => res.json()).catch(() => []),
      ])
        .then(([depositsData, withdrawalsData, bidsData]) => {
          const transactions: any[] = [];

          // Add deposits
          const deposits = Array.isArray(depositsData) ? depositsData : [];
          deposits.forEach((d: any) => {
            transactions.push({
              type: 'deposit',
              date: new Date(d.createdAt),
              amount: typeof d.amount === 'string' ? parseFloat(d.amount) : d.amount,
              details: `${d.status === 'success' ? 'Approved' : 'Pending'} UPI Transfer`,
              status: d.status,
            });
          });

          // Add withdrawals
          const withdrawals = Array.isArray(withdrawalsData) ? withdrawalsData : [];
          withdrawals.forEach((w: any) => {
            transactions.push({
              type: 'withdrawal',
              date: new Date(w.createdAt),
              amount: typeof w.amount === 'string' ? parseFloat(w.amount) : w.amount,
              details: `${w.status === 'success' ? 'Approved' : 'Pending'} UPI Payout`,
              status: w.status,
            });
          });

          // Add bids
          const bids = Array.isArray(bidsData) ? bidsData : (bidsData?.bids || []);
          bids.forEach((b: any) => {
            if (b.status === 'won') {
              const multiplier = b.gameType === 'jodi' ? 90 : 9;
              const amount = typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount;
              transactions.push({
                type: 'bid-win',
                date: new Date(b.createdAt),
                amount: amount * multiplier,
                details: `${b.marketName} - ${b.gameType.toUpperCase()} Win (${multiplier}x)`,
                status: 'won',
              });
            } else if (b.status === 'lost') {
              const amount = typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount;
              transactions.push({
                type: 'bid-loss',
                date: new Date(b.createdAt),
                amount: amount,
                details: `${b.marketName} - ${b.gameType.toUpperCase()} Lost`,
                status: 'lost',
              });
            } else {
              const amount = typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount;
              transactions.push({
                type: 'bid',
                date: new Date(b.createdAt),
                amount: amount,
                details: `${b.marketName} - ${b.gameType.toUpperCase()}`,
                status: 'pending',
              });
            }
          });

          // Sort by date descending (newest first)
          transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
          setTransactionHistory(transactions);
          setTransactionLoading(false);
        })
        .catch(err => {
          console.error('Error fetching transaction history:', err);
          setTransactionLoading(false);
        });
    }
  }, [viewingUser]);
  
  // Build query parameters
  let queryParams: any = { search, page: currentPage, limit: pageSize };
  if (dateFilterType && dateFilterType !== 'custom') {
    queryParams.joinedType = dateFilterType;
  } else if (dateFilterType === 'custom') {
    if (customDateFrom) queryParams.joinedAfter = new Date(customDateFrom).toISOString();
    if (customDateTo) queryParams.joinedBefore = new Date(customDateTo).toISOString();
  }
  
  const { data, isLoading } = useGetUsers(queryParams);
  const { mutate: update } = useUpdateUser();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof walletSchema>>({
    resolver: zodResolver(walletSchema),
  });

  const toggleBlock = (user: User) => {
    update({ id: user.id, data: { isBlocked: !user.isBlocked } }, {
      onSuccess: () => {
        toast({ title: `User ${!user.isBlocked ? 'blocked' : 'unblocked'} successfully` });
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
      }
    });
  };

  const onUpdateWallet = (formData: z.infer<typeof walletSchema>) => {
    if (!walletDialog) return;
    update({ id: walletDialog.id, data: { walletBalance: formData.walletBalance } }, {
      onSuccess: () => {
        toast({ title: "Wallet balance updated" });
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
        setWalletDialog(null);
      }
    });
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog) return;
    
    setIsDeleting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const userId = typeof deleteDialog.id === 'string' ? parseInt(deleteDialog.id, 10) : deleteDialog.id;
      
      console.log(`[Delete User] Attempting to delete user ${deleteDialog.id} (${deleteDialog.name}) from endpoint: ${apiUrl}/api/users/${userId}`);
      
      const response = await fetch(`${apiUrl}/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const responseText = await response.text();
      let errorData: any = {};
      
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText || `HTTP ${response.status}` };
      }

      if (!response.ok) {
        console.error(`[Delete User] Delete failed:`, { status: response.status, response: errorData });
        const errorMessage = errorData.error || errorData.message || `Failed to delete user (Status: ${response.status})`;
        throw new Error(errorMessage);
      }

      console.log(`[Delete User] Successfully deleted user ${userId}`);
      toast({ title: "User deleted successfully", description: `${deleteDialog.name} has been removed.` });
      queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
      setDeleteDialog(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast({ 
        title: "Error", 
        description: (error as Error).message || "Failed to delete user", 
        variant: "destructive" 
      });
    } finally {
      setIsDeleting(false);
    }
  };

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

  const clearDateFilter = () => {
    setDateFilterType(null);
    setCustomDateFrom("");
    setCustomDateTo("");
    setCurrentPage(1); // Reset to first page when clearing filter
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Users</h2>
          <p className="text-muted-foreground mt-1">Manage players, wallets, and access.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, email or phone..." 
            className="pl-9 rounded-xl h-11 bg-card shadow-sm border-border/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
              <TableHead className="pl-6">User Info</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Wallet Balance</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : !Array.isArray(data?.users) ? null : (data.users as any[]).map((user) => (
              <TableRow key={user.id} className="group">
                <TableCell className="pl-6">
                  <div className="font-semibold text-foreground">{user.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Joined {format(new Date(user.createdAt), 'PP')}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{user.phone}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="font-mono font-bold text-emerald-600 bg-emerald-50 w-max ml-auto px-3 py-1 rounded-md border border-emerald-100">
                    ₹{(user.walletBalance ?? 0).toLocaleString()}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={user.isBlocked ? 'destructive' : 'default'} className={!user.isBlocked ? 'bg-blue-500' : ''}>
                    {user.isBlocked ? 'Blocked' : 'Active'}
                  </Badge>
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                      onClick={() => setViewingUser(user)}
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => {
                        setWalletDialog(user);
                        form.reset({ walletBalance: user.walletBalance });
                      }}
                    >
                      <Wallet className="w-3.5 h-3.5" /> Edit Wallet
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`h-8 gap-1.5 ${user.isBlocked ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-rose-200 text-rose-700 hover:bg-rose-50'}`}
                      onClick={() => toggleBlock(user)}
                    >
                      {user.isBlocked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      {user.isBlocked ? 'Unblock' : 'Block'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteDialog(user)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination Controls */}
      {!isLoading && (data?.total ?? 0) > 0 && (
        <div className="flex items-center justify-between pt-6">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-semibold">{((currentPage - 1) * pageSize) + 1}</span> to <span className="font-semibold">{Math.min(currentPage * pageSize, data?.total ?? 0)}</span> of <span className="font-semibold">{data?.total ?? 0}</span> users
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
                max={Math.ceil((data?.total ?? 0) / pageSize)}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value) || 1;
                  const maxPage = Math.ceil((data?.total ?? 0) / pageSize);
                  setCurrentPage(Math.min(Math.max(page, 1), maxPage));
                }}
                className="w-12 h-9 px-2 text-center"
              />
              <span className="text-sm text-muted-foreground">of {Math.ceil((data?.total ?? 0) / pageSize)}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={currentPage >= Math.ceil((data?.total ?? 0) / pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!walletDialog} onOpenChange={(o) => !o && setWalletDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Wallet Balance</DialogTitle>
          </DialogHeader>
          <div className="mb-4 mt-2 p-4 bg-muted/50 rounded-xl flex justify-between items-center border border-border/50">
            <div>
              <p className="text-sm text-muted-foreground">User</p>
              <p className="font-semibold">{walletDialog?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="font-mono font-bold text-primary text-lg">₹{walletDialog?.walletBalance}</p>
            </div>
          </div>
          <form onSubmit={form.handleSubmit(onUpdateWallet)} className="space-y-4">
            <div className="space-y-2">
              <Label>New Balance Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input type="number" {...form.register("walletBalance")} className="pl-8 text-lg font-bold rounded-xl" autoFocus />
              </div>
            </div>
            <Button type="submit" className="w-full btn-primary-gradient mt-2 h-11">
              Confirm Update
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Permanently remove this user and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
            <p className="text-sm text-red-900 mb-3">
              Are you sure you want to delete <span className="font-bold">{deleteDialog?.name}</span>? This action cannot be undone.
            </p>
            <p className="text-xs text-red-700">User ID: {deleteDialog?.id} | Phone: {deleteDialog?.phone}</p>
          </div>
          <div className="flex gap-2 mt-6">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialog(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="flex-1"
            >
              {isDeleting ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Details Modal */}
      <Dialog open={!!viewingUser} onOpenChange={(o) => !o && setViewingUser(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              User Details - {viewingUser?.name}
            </DialogTitle>
            <DialogDescription>
              Comprehensive overview of user activity and information
            </DialogDescription>
          </DialogHeader>
          
          {viewingUser && (
            <div className="space-y-6">
              {/* Personal Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">📋 Personal Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Name</p>
                    <p className="font-medium">{viewingUser.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{viewingUser.phone}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{viewingUser.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Joined</p>
                    <p className="font-medium">{format(new Date(viewingUser.createdAt), 'PPP')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={viewingUser.isBlocked ? 'destructive' : 'default'} className={!viewingUser.isBlocked ? 'bg-blue-500' : ''}>
                      {viewingUser.isBlocked ? 'Blocked' : 'Active'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Wallet Info */}
              <div className="space-y-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <h3 className="font-semibold text-sm flex items-center gap-2">💰 Wallet Balance</h3>
                <p className="text-2xl font-bold text-emerald-600">₹{(viewingUser.walletBalance ?? 0).toLocaleString()}</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-muted-foreground mb-1">💵 Total Deposits</p>
                  <p className="text-xl font-bold text-blue-600">₹{statsLoading ? '...' : (userStats?.totalDeposits ?? 0).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs text-muted-foreground mb-1">📤 Total Withdrawals</p>
                  <p className="text-xl font-bold text-orange-600">₹{statsLoading ? '...' : (userStats?.totalWithdrawals ?? 0).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs text-muted-foreground mb-1">🎲 Total Bets</p>
                  <p className="text-xl font-bold text-purple-600">{statsLoading ? '...' : (userStats?.totalBets ?? 0)}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-muted-foreground mb-1">✅ Bets Won</p>
                  <p className="text-xl font-bold text-green-600">{statsLoading ? '...' : (userStats?.betsWon ?? 0)}</p>
                </div>
              </div>

              {/* Win/Loss Summary */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-semibold text-sm">📊 Win/Loss Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><TrendingUp className="w-3 h-3" /> Total Winnings</p>
                    <p className="text-lg font-bold text-green-600">₹{statsLoading ? '...' : (userStats?.totalWinnings ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><TrendingDown className="w-3 h-3" /> Total Losses</p>
                    <p className="text-lg font-bold text-red-600">₹{statsLoading ? '...' : (userStats?.totalLosses ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Transaction History with Filters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">📜 Recent Activity History</h3>
                </div>
                
                {/* Filter Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={historyFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() => setHistoryFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={historyFilter === 'deposits' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 rounded-full text-xs ${historyFilter === 'deposits' ? 'bg-blue-600 hover:bg-blue-700' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}
                    onClick={() => setHistoryFilter('deposits')}
                  >
                    💵 Deposits
                  </Button>
                  <Button
                    variant={historyFilter === 'withdrawals' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 rounded-full text-xs ${historyFilter === 'withdrawals' ? 'bg-orange-600 hover:bg-orange-700' : 'border-orange-200 text-orange-700 hover:bg-orange-50'}`}
                    onClick={() => setHistoryFilter('withdrawals')}
                  >
                    📤 Withdrawals
                  </Button>
                  <Button
                    variant={historyFilter === 'bids' ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 rounded-full text-xs ${historyFilter === 'bids' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-200 text-purple-700 hover:bg-purple-50'}`}
                    onClick={() => setHistoryFilter('bids')}
                  >
                    🎲 Bids
                  </Button>
                </div>

                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold">Date & Time</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold">Type</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold">Details</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionLoading ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            Loading transactions...
                          </td>
                        </tr>
                      ) : (() => {
                        const filteredTransactions = transactionHistory.filter(t => {
                          if (historyFilter === 'all') return true;
                          if (historyFilter === 'deposits') return t.type === 'deposit';
                          if (historyFilter === 'withdrawals') return t.type === 'withdrawal';
                          if (historyFilter === 'bids') return t.type.includes('bid');
                          return true;
                        });

                        const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / historyPageSize));
                        const startIdx = (historyCurrentPage - 1) * historyPageSize;
                        const endIdx = startIdx + historyPageSize;
                        const paginatedTransactions = filteredTransactions.slice(startIdx, endIdx);

                        if (filteredTransactions.length === 0) {
                          return (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                                No {historyFilter !== 'all' ? historyFilter : 'transactions'} found
                              </td>
                            </tr>
                          );
                        }

                        return paginatedTransactions.map((tx, idx) => {
                          let badgeClassName = 'bg-gray-100 text-gray-700';
                          let amountColor = 'text-gray-600';

                          if (tx.type === 'deposit') {
                            badgeClassName = 'bg-blue-100 text-blue-700';
                            amountColor = 'text-green-600';
                          } else if (tx.type === 'withdrawal') {
                            badgeClassName = 'bg-orange-100 text-orange-700';
                            amountColor = 'text-red-600';
                          } else if (tx.type === 'bid-win') {
                            badgeClassName = 'bg-green-100 text-green-700';
                            amountColor = 'text-green-600';
                          } else if (tx.type === 'bid-loss') {
                            badgeClassName = 'bg-red-100 text-red-700';
                            amountColor = 'text-red-600';
                          } else {
                            badgeClassName = 'bg-purple-100 text-purple-700';
                            amountColor = 'text-gray-600';
                          }

                          const typeLabel =
                            tx.type === 'deposit'
                              ? 'Deposit'
                              : tx.type === 'withdrawal'
                                ? 'Withdrawal'
                                : tx.type === 'bid-win'
                                  ? 'Win'
                                  : tx.type === 'bid-loss'
                                    ? 'Loss'
                                    : 'Bid';

                          return (
                            <tr key={idx} className="border-t border-border/30 hover:bg-muted/20">
                              <td className="px-4 py-3 text-muted-foreground">
                                {format(tx.date, 'MMM d, yyyy h:mm a')}
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={badgeClassName}>
                                  {typeLabel}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm">{tx.details}</td>
                              <td className={`px-4 py-3 text-right font-semibold ${amountColor}`}>
                                {tx.type === 'withdrawal' || tx.type === 'bid-loss' || (tx.type === 'deposit' && tx.status !== 'success') || tx.type === 'bid'
                                  ? '-'
                                  : '+'}
                                ₹{Math.abs(tx.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {(() => {
                  const filteredTransactions = transactionHistory.filter(t => {
                    if (historyFilter === 'all') return true;
                    if (historyFilter === 'deposits') return t.type === 'deposit';
                    if (historyFilter === 'withdrawals') return t.type === 'withdrawal';
                    if (historyFilter === 'bids') return t.type.includes('bid');
                    return true;
                  });

                  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / historyPageSize));
                  
                  if (filteredTransactions.length === 0) {
                    return null;
                  }

                  return (
                    <div className="flex items-center justify-between pt-4">
                      <div className="text-xs text-muted-foreground">
                        Showing <span className="font-semibold">{Math.min((historyCurrentPage - 1) * historyPageSize + 1, filteredTransactions.length)}</span> to <span className="font-semibold">{Math.min(historyCurrentPage * historyPageSize, filteredTransactions.length)}</span> of <span className="font-semibold">{filteredTransactions.length}</span> transactions
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={historyCurrentPage === 1}
                          className="h-8 px-3"
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1 px-2">
                          <span className="text-xs text-muted-foreground">Page</span>
                          <Input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={historyCurrentPage}
                            onChange={(e) => {
                              const page = parseInt(e.target.value) || 1;
                              setHistoryCurrentPage(Math.min(Math.max(page, 1), totalPages));
                            }}
                            className="w-10 h-8 px-2 text-center text-xs"
                          />
                          <span className="text-xs text-muted-foreground">of {totalPages}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryCurrentPage(prev => prev + 1)}
                          disabled={historyCurrentPage >= totalPages}
                          className="h-8 px-3"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                <p className="text-xs text-muted-foreground">Showing 5 transactions per page. Total {transactionHistory.length} transactions loaded.</p>
              </div>

              {/* Notes */}
              <div className="space-y-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-700">ℹ️ Note: Displaying real-time user data from the system. Data updates automatically.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

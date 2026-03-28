import { useState } from "react";
import { useGetUsers, useUpdateUser, getGetUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Ban, CheckCircle2, Wallet, History, X } from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@workspace/api-client-react/dist/generated/api.schemas";

const walletSchema = z.object({
  walletBalance: z.coerce.number().min(0, "Balance cannot be negative"),
});

type DateFilterType = 'today' | 'yesterday' | 'last3days' | 'last7days' | 'lastMonth' | 'custom' | null;

export default function Users() {
  const [search, setSearch] = useState("");
  const [walletDialog, setWalletDialog] = useState<User | null>(null);
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>(null);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  
  // Build query parameters
  let queryParams: any = { search, page: 1, limit: 50 };
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
    </div>
  );
}

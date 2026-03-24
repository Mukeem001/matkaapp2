import { useGetWithdrawals, useApproveWithdrawal, useRejectWithdrawal, getGetWithdrawalsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, X, Landmark } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function Withdrawals() {
  const { data: withdrawals, isLoading, error } = useGetWithdrawals({ status: "all" });
  const { mutate: approve } = useApproveWithdrawal();
  const { mutate: reject } = useRejectWithdrawal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  console.log("Withdrawals data =>", withdrawals);

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

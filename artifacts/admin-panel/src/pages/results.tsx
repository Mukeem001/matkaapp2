import { useState } from "react";
import { useGetMarkets, useGetResults, useDeclareResult, getGetResultsQueryKey, getGetMarketsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const resultSchema = z.object({
  marketId: z.coerce.number().min(1, "Market is required"),
  resultDate: z.string().min(1, "Date is required"),
  openResult: z.string().optional(),
  closeResult: z.string().optional(),
  jodiResult: z.string().optional(),
  pannaResult: z.string().optional(),
});

export default function Results() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  
  const { data: markets } = useGetMarkets();
  const { data: results, isLoading } = useGetResults({ date: selectedDate });
  const { mutate: declare, isPending } = useDeclareResult();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof resultSchema>>({
    resolver: zodResolver(resultSchema),
    defaultValues: {
      marketId: 0,
      resultDate: today,
      openResult: "",
      closeResult: "",
      jodiResult: "",
      pannaResult: "",
    }
  });

  const onSubmit = (data: z.infer<typeof resultSchema>) => {
    declare({ data: data as any }, {
      onSuccess: () => {
        toast({ title: "Result declared successfully" });
        queryClient.invalidateQueries({ queryKey: getGetResultsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMarketsQueryKey() });
        form.reset({ ...data, openResult: "", closeResult: "", jodiResult: "", pannaResult: "" });
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Declare Results</h2>
        <p className="text-muted-foreground mt-1">Manage game outcomes and declare market results.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 shadow-sm border-border/50 h-fit">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-lg">New Result</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Market</Label>
                <Select onValueChange={(v) => form.setValue("marketId", Number(v))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select a market" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(markets) ? markets.map(m => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                    )) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("resultDate")} className="rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Open Panna</Label>
                  <Input {...form.register("openResult")} placeholder="***" maxLength={3} className="rounded-xl text-center font-mono tracking-widest" />
                </div>
                <div className="space-y-2">
                  <Label>Close Panna</Label>
                  <Input {...form.register("closeResult")} placeholder="***" maxLength={3} className="rounded-xl text-center font-mono tracking-widest" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Jodi Digit</Label>
                <Input {...form.register("jodiResult")} placeholder="**" maxLength={2} className="rounded-xl text-center font-mono tracking-widest text-lg font-bold" />
              </div>
              <Button type="submit" className="w-full btn-primary-gradient mt-4" disabled={isPending}>
                Declare Result
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm border-border/50">
          <CardHeader className="bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-lg">History</CardTitle>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40 rounded-lg h-9"
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Market</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Result (Open - Jodi - Close)</TableHead>
                  <TableHead className="pr-6 text-right">Declared At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : results?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No results found for this date.</TableCell></TableRow>
                ) : !Array.isArray(results) ? null : (results as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6 font-semibold">{r.marketName}</TableCell>
                    <TableCell>{format(new Date(r.resultDate), 'PP')}</TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono text-lg font-bold text-primary tracking-widest bg-primary/5 px-4 py-1.5 rounded-lg border border-primary/20">
                        {r.openResult || '***'} - {r.jodiResult || '**'} - {r.closeResult || '***'}
                      </span>
                    </TableCell>
                    <TableCell className="pr-6 text-right text-muted-foreground text-sm">
                      {r.declaredAt ? format(new Date(r.declaredAt), 'p') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

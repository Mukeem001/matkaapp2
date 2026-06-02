import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGetResults, useGetMarkets } from "@workspace/api-client-react";
import { Loader2, Calendar } from "lucide-react";

export default function MarketResultHistory() {
  const [marketId, setMarketId] = useState<number | null>(null);
  const [date, setDate] = useState<string>("");
  
  const { data: markets, isLoading: marketsLoading } = useGetMarkets();

  const { data: results, isLoading: resultsLoading } = useGetResults({
    marketId: marketId ?? undefined,
    date: date || undefined,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Market Result History</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">View historical results for all markets</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Filter Results</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Search by market and date</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="market" className="text-xs sm:text-sm">Market</Label>
              <select
                id="market"
                value={marketId || ""}
                onChange={(e) => setMarketId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded-lg bg-white text-xs sm:text-sm h-8 sm:h-9"
                disabled={marketsLoading}
              >
                <option value="">All Markets</option>
                {markets?.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="date" className="text-xs sm:text-sm">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 sm:h-9 text-xs sm:text-sm"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => {
                  setMarketId(null);
                  setDate("");
                }}
                variant="outline"
                className="w-full h-8 sm:h-9 text-xs sm:text-sm"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Results</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {results?.length || 0} results found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resultsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : results && results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="border-b bg-muted">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 text-left">Market</th>
                    <th className="px-2 sm:px-4 py-2 text-left">Date</th>
                    <th className="px-2 sm:px-4 py-2 text-center">Open</th>
                    <th className="px-2 sm:px-4 py-2 text-center">Close</th>
                    <th className="px-2 sm:px-4 py-2 text-center">Jodi</th>
                    <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">Declared At</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result: any) => (
                    <tr key={result.id} className="border-b hover:bg-muted/50">
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium">{result.marketName}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">{result.resultDate}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono">
                        {result.openResult || "—"}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono">
                        {result.closeResult || "—"}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-mono">
                        {result.jodiResult || "—"}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {result.declaredAt
                          ? new Date(result.declaredAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-xs sm:text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

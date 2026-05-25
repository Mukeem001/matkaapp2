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
  
  const { data: markets, isLoading: marketsLoading } = useGetMarkets({
    page: 1,
    limit: 100,
  });

  const { data: results, isLoading: resultsLoading } = useGetResults({
    marketId: marketId ?? undefined,
    date: date || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Market Result History</h1>
        <p className="text-gray-600 mt-2">View historical results for all markets</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Results</CardTitle>
          <CardDescription>Search by market and date</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="market">Market</Label>
              <select
                id="market"
                value={marketId || ""}
                onChange={(e) => setMarketId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border rounded-md bg-white"
                disabled={marketsLoading}
              >
                <option value="">All Markets</option>
                {markets?.data?.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => {
                  setMarketId(null);
                  setDate("");
                }}
                variant="outline"
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
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
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Market</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-center">Open</th>
                    <th className="px-4 py-2 text-center">Close</th>
                    <th className="px-4 py-2 text-center">Jodi</th>
                    <th className="px-4 py-2 text-left">Declared At</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result: any) => (
                    <tr key={result.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{result.marketName}</td>
                      <td className="px-4 py-3">{result.resultDate}</td>
                      <td className="px-4 py-3 text-center font-mono">
                        {result.openResult || "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {result.closeResult || "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {result.jodiResult || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
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
            <div className="text-center py-8 text-gray-500">
              No results found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

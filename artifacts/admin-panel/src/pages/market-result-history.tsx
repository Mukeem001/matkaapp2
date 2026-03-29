import { useState, useMemo } from "react";
import { useGetMarkets, useGetResults } from "@workspace/api-client-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function MarketResultHistory() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedMarketId, setSelectedMarketId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(today);

  const { data: markets, isLoading: marketsLoading } = useGetMarkets();
  
  // Build query params
  const queryParams: any = {};
  if (selectedMarketId) {
    queryParams.marketId = parseInt(selectedMarketId);
  }
  if (selectedDate) {
    queryParams.resultDate = selectedDate;
  }

  const { data: allResults, isLoading: resultsLoading } = useGetResults(queryParams);

  // Filter results locally if needed
  const results = useMemo(() => {
    if (!allResults) return [];
    
    let filtered = allResults;
    
    // Additional client-side filtering for market
    if (selectedMarketId) {
      filtered = filtered.filter((r: any) => r.marketId === parseInt(selectedMarketId));
    }
    
    // Additional client-side filtering for date
    if (selectedDate) {
      filtered = filtered.filter((r: any) => r.resultDate === selectedDate);
    }
    
    return filtered;
  }, [allResults, selectedMarketId, selectedDate]);

  const selectedMarketName = markets?.find((m: any) => m.id === parseInt(selectedMarketId))?.name || "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Market Result History</h2>
        <p className="text-muted-foreground mt-1">View historical results for each market</p>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Market Selector */}
            <div className="space-y-2">
              <Label htmlFor="market">Select Market</Label>
              <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose a market..." />
                </SelectTrigger>
                <SelectContent>
                  {markets?.map((market: any) => (
                    <SelectItem key={market.id} value={market.id.toString()}>
                      {market.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Selector */}
            <div className="space-y-2">
              <Label htmlFor="date">Select Date</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={today}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Clear Filters */}
          <Button
            variant="outline"
            onClick={() => {
              setSelectedMarketId("");
              setSelectedDate(today);
            }}
          >
            Clear Filters
          </Button>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Results{selectedMarketName && ` - ${selectedMarketName}`}
            {selectedDate && ` - ${format(new Date(selectedDate), 'MMM dd, yyyy')}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Market</TableHead>
                  <TableHead className="text-center">Date</TableHead>
                  <TableHead className="text-center">Open</TableHead>
                  <TableHead className="text-center">Close</TableHead>
                  <TableHead className="text-center">Jodi</TableHead>
                  <TableHead className="text-center">Panna</TableHead>
                  <TableHead className="text-right">Declared At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading results...
                    </TableCell>
                  </TableRow>
                ) : results.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {selectedMarketId && selectedDate
                        ? "No results found for selected market and date"
                        : "Select a market and date to view results"}
                    </TableCell>
                  </TableRow>
                ) : (
                  results.map((result: any) => (
                    <TableRow key={result.id}>
                      <TableCell className="text-center">
                        <span className="font-medium">{result.marketName}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {format(new Date(result.resultDate), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-center">
                        {result.openResult ? (
                          <Badge variant="outline" className="font-mono">
                            {result.openResult}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {result.closeResult ? (
                          <Badge variant="outline" className="font-mono">
                            {result.closeResult}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {result.jodiResult ? (
                          <Badge variant="outline" className="font-mono">
                            {result.jodiResult}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {result.pannaResult ? (
                          <Badge variant="outline" className="font-mono">
                            {result.pannaResult}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {result.declaredAt
                          ? format(new Date(result.declaredAt), 'MMM dd, HH:mm')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {results.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              Total: {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

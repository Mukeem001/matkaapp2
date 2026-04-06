import { useEffect } from "react";
import { useGetGameRates, useUpdateGameRates, getGetGameRatesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const ratesSchema = z.object({
  singleDigit: z.coerce.number().min(1),
  jodiDigit: z.coerce.number().min(1),
  singlePanna: z.coerce.number().min(1),
  doublePanna: z.coerce.number().min(1),
  triplePanna: z.coerce.number().min(1),
  halfSangam: z.coerce.number().min(1),
  fullSangam: z.coerce.number().min(1),
});

type GameRatesForm = z.infer<typeof ratesSchema>;

export default function GameRates() {
  const { data: rates, isLoading } = useGetGameRates();
  const { mutate: update, isPending } = useUpdateGameRates();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<GameRatesForm>({
    resolver: zodResolver(ratesSchema),
  });

  useEffect(() => {
    if (rates) form.reset(rates);
  }, [rates, form]);

  const onSubmit = (data: GameRatesForm) => {
    update({ data }, {
      onSuccess: () => {
        toast({ title: "Rates updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetGameRatesQueryKey() });
      }
    });
  };

  const fields = [
    { name: "singleDigit", label: "Single Digit", desc: "10 ka" },
    { name: "jodiDigit", label: "Jodi Digit", desc: "10 ka" },
    { name: "singlePanna", label: "Single Panna", desc: "10 ka" },
    { name: "doublePanna", label: "Double Panna", desc: "10 ka" },
    { name: "triplePanna", label: "Triple Panna", desc: "10 ka" },
    { name: "halfSangam", label: "Half Sangam", desc: "10 ka" },
    { name: "fullSangam", label: "Full Sangam", desc: "10 ka" },
  ] as const;

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-2xl" />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-display font-bold">Game Winning Rates</h2>
        <p className="text-muted-foreground mt-1">Configure multiplier amounts (e.g. 10 ₹ = 90 ₹)</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {fields.map((field) => (
                <div key={field.name} className="flex flex-col space-y-2 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">{field.label}</Label>
                    <span className="text-xs text-muted-foreground font-medium bg-background px-2 py-1 rounded-md shadow-sm">
                      {field.desc}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-lg font-bold text-muted-foreground">₹ 10</span>
                    <span className="text-muted-foreground">→</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                      <Input 
                        type="number" 
                        {...form.register(field.name)} 
                        className="pl-8 text-lg font-bold text-primary rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 pt-6 border-t border-border/50 flex justify-end">
              <Button type="submit" className="btn-primary-gradient px-8 h-12 text-base" disabled={isPending}>
                {isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Save All Rates
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
